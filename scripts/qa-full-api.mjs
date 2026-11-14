// Full AppModule acceptance sandbox. No route/controller/service mocks.
// Only DatabaseService transport is adapted to embedded PostgreSQL; tenant RLS is enforced.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { setInterval } from 'node:timers';
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
const local = createRequire(resolve('apps/api/package.json'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  API_PORT: '4000',
  APP_URL:
    process.env.BOAT_CLOUD_REVIEW === 'true'
      ? process.env.BOAT_QA_APP_URL || 'http://localhost:3000'
      : 'http://localhost:3000',
  PUBLIC_API_URL:
    process.env.BOAT_CLOUD_REVIEW === 'true'
      ? process.env.BOAT_QA_PUBLIC_URL || 'http://localhost:4000'
      : 'http://localhost:4000',
  DATABASE_URL: 'postgres://app_user:local-only@localhost/isolated',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET:
    process.env.BOAT_CLOUD_REVIEW === 'true'
      ? randomBytes(48).toString('hex')
      : 'isolated-full-app-secret-never-used-externally',
  ENCRYPTION_KEY:
    process.env.BOAT_CLOUD_REVIEW === 'true' ? randomBytes(32).toString('hex') : '0'.repeat(64),
  EXTERNAL_DELIVERY_ENABLED: 'false',
  EMAIL_DELIVERY_ENABLED: 'false',
  AI_PROVIDER_CALLS_ENABLED: 'false',
  BOAT_PREVIEW_ONLY: 'true',
  WHATSAPP_PREVIEW_BOT_ENABLED: 'false',
});
if (process.env.BOAT_TELEGRAM_QA === 'true') {
  const { installTelegramProviderFixture } = await import('./qa-telegram-provider.mjs');
  installTelegramProviderFixture();
}
(async () => {
  console.log('QA_PG_INITIALIZING');
  const { PGlite } = local('@electric-sql/pglite');
  const { pgcrypto } = local('@electric-sql/pglite/contrib/pgcrypto');
  const { vector } = local(process.env.BOAT_QA_VECTOR_MODULE || '@electric-sql/pglite-pgvector');
  const pg = new PGlite({ extensions: { vector, pgcrypto } });
  await pg.waitReady;
  console.log('QA_PG_READY');
  await pg.exec(
    'CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now());',
  );
  const dir = 'apps/api/src/database/migrations';
  let count = 0;
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    try {
      await pg.transaction(async (tx) => {
        await tx.exec(readFileSync(dir + '/' + name, 'utf8'));
        await tx.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      });
      count++;
      if (process.env.BOAT_CLOUD_REVIEW === 'true' && count % 20 === 0)
        console.log('QA_MIGRATIONS_APPLIED', count);
    } catch (e) {
      throw new Error('Migration ' + name + ': ' + e.message);
    }
  }
  console.log('FULL_SCHEMA_MIGRATIONS', count);
  local('reflect-metadata');
  const { DatabaseService } = local('./dist/database/database.service');
  const { requestContext } = local('./dist/common/request-context');
  const scope = new AsyncLocalStorage();
  const wrap = (tx) => ({
    query: async (sql, args = []) => {
      const r = args.length
        ? await tx.query(sql, args)
        : await tx.exec(sql).then((rs) => rs[rs.length - 1] || { rows: [], affectedRows: 0 });
      return { ...r, rowCount: r.affectedRows || r.rows.length };
    },
  });
  const transaction = (tenant, fn) =>
    pg.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE app_user');
      if (tenant) await tx.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      const actor = requestContext.getStore()?.user;
      if (actor?.tenantId === tenant)
        await tx.query("SELECT set_config('app.actor_id',$1,true)", [actor.userId]);
      const client = wrap(tx);
      return scope.run({ tenant, client }, () => fn(client));
    });
  DatabaseService.prototype.query = function (sql, args = []) {
    const active = scope.getStore();
    return active ? active.client.query(sql, args) : transaction(null, (c) => c.query(sql, args));
  };
  DatabaseService.prototype.withTenant = function (tenant, fn) {
    const active = scope.getStore();
    if (active) {
      if (active.tenant !== tenant) throw Error('Cross-tenant transaction');
      return fn(active.client);
    }
    return transaction(tenant, fn);
  };
  DatabaseService.prototype.detached = DatabaseService.prototype.withTenant;
  const { NestFactory } = local('@nestjs/core');
  const { AppModule } = local('./dist/app.module');
  const app = await NestFactory.create(AppModule, { logger: ['error'], rawBody: true });
  app.useBodyParser('json', { limit: '1mb' });
  app.use((req, res, next) => requestContext.run(req, next));
  app.enableCors();
  if (process.env.BOAT_TEMPLATE_QA === 'true') {
    const { installTemplateFixtures } = await import('./qa-template-fixtures.mjs');
    installTemplateFixtures(app, local);
  }
  if (process.env.BOAT_CRM_QA === 'true') {
    const { installCrmFixtures } = await import('./qa-crm-fixtures.mjs');
    installCrmFixtures(app, local);
  }
  if (process.env.BOAT_CLOUD_REVIEW === 'true') {
    const { CrmJobs } = local('./dist/business/crm-jobs');
    const { EventsService } = local('./dist/events/events.service');
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const jobs = await pg.query(
          "SELECT id,tenant_id FROM crm_jobs WHERE kind='import' AND status IN ('pending','running') LIMIT 10",
        );
        for (const job of jobs.rows)
          await app.get(CrmJobs).process({ tenantId: job.tenant_id, jobId: job.id });
        // Drain the real persisted event outbox; external/provider delivery stays disabled.
        await app.get(EventsService).tick();
      } catch (e) {
        console.error('Review internal worker', e.message);
      } finally {
        running = false;
      }
    }, 1000).unref();
  }
  if (process.env.BOAT_CRM_V3_QA === 'true') {
    const { AutomationService } = local('./dist/business/automation.service');
    app
      .getHttpAdapter()
      .getInstance()
      .post('/__qa/v3/receipts', async (req, res) => {
        const db = app.get(DatabaseService),
          engine = app.get(AutomationService),
          { tenantId, contactId } = req.body;
        const { randomUUID } = await import('node:crypto');
        const eventId = randomUUID(),
          marker = 'Synthetic receipt ' + eventId;
        const input = {
          tenantId,
          contactId,
          eventId,
          actions: [
            { type: 'note', text: marker },
            { type: 'task', title: marker, delayMinutes: 5 },
          ],
        };
        const original = db.withTenant.bind(db);
        let injected = false;
        db.withTenant = (tenant, fn) =>
          original(tenant, (c) =>
            fn({
              ...c,
              query: async (sql, args = []) => {
                if (!injected && sql.includes('INSERT INTO crm_tasks') && args.includes(marker)) {
                  injected = true;
                  throw Error('Synthetic transient database failure');
                }
                return c.query(sql, args);
              },
            }),
          );
        let failed = false;
        try {
          await engine.followup(input);
        } catch {
          failed = true;
        } finally {
          db.withTenant = original;
        }
        await engine.followup(input);
        await engine.followup(input);
        const counts = await db.withTenant(tenantId, async (c) => ({
          notes: (await c.query('SELECT count(*)::int AS n FROM crm_notes WHERE body=$1', [marker]))
            .rows[0].n,
          tasks: (
            await c.query('SELECT count(*)::int AS n FROM crm_tasks WHERE title=$1', [marker])
          ).rows[0].n,
        }));
        res.json({ failed, injected, ...counts });
      });
  }
  await app.listen(4000, '127.0.0.1');
  console.log('FULL_APP_READY 4000');
  const stop = async () => {
    await app.close();
    await pg.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
