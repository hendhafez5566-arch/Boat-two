import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
const local = createRequire(resolve('apps/api/package.json'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost/isolated',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'assignment-isolated-test-secret-32-chars',
  ENCRYPTION_KEY: '0'.repeat(64),
  EXTERNAL_DELIVERY_ENABLED: 'false',
});
local('reflect-metadata');
const { PGlite } = local('@electric-sql/pglite'),
  { pgcrypto } = local('@electric-sql/pglite/contrib/pgcrypto'),
  { vector } = local('@electric-sql/pglite-pgvector');
const pg = new PGlite({ extensions: { pgcrypto, vector } });
await pg.waitReady;
await pg.exec('CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS;');
for (const p of readdirSync('apps/api/src/database/migrations')
  .filter((p) => p.endsWith('.sql'))
  .sort())
  await pg.exec(readFileSync('apps/api/src/database/migrations/' + p, 'utf8'));
const scope = new AsyncLocalStorage();
const db = {
  withTenant: async (id, fn) => {
    const a = scope.getStore();
    if (a) {
      if (a.id !== id) throw Error('cross tenant');
      return fn(a.c);
    }
    return pg.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE app_user');
      await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
      const c = {
        query: async (s, p = []) => {
          const r = await tx.query(s, p);
          return { ...r, rowCount: r.affectedRows || r.rows.length };
        },
      };
      return scope.run({ id, c }, () => fn(c));
    });
  },
};
const { AssignmentService } = local('./dist/inbox/assignment.service');
const service = new AssignmentService(db, { emit: () => {} });
const tenant = uuid(),
  other = uuid(),
  a = uuid(),
  b = uuid(),
  ch = uuid();
await pg.query(
  "INSERT INTO tenants(id,name,slug) VALUES($1::uuid,'Assignment QA',$1::text),($2::uuid,'Other QA',$2::text)",
  [tenant, other],
);
for (const id of [a, b]) {
  await pg.query('INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)', [
    id,
    id + '@example.test',
    id === a ? 'Visa' : 'Flights',
  ]);
  await pg.query(
    "INSERT INTO memberships(tenant_id,user_id,role,available) VALUES($1,$2,'agent',true)",
    [tenant, id],
  );
}
await pg.query(
  "INSERT INTO channels(id,tenant_id,type,name,external_id) VALUES($1::uuid,$2,'web','QA',$1::text)",
  [ch, tenant],
);
const policy = async (p) =>
  pg.query(
    "UPDATE tenants SET settings=jsonb_set(settings,'{crmAssignment}',$2::jsonb,true) WHERE id=$1",
    [tenant, JSON.stringify(p)],
  );
const make = async (owner) => {
  const ct = uuid(),
    cv = uuid();
  await pg.query(
    'INSERT INTO contacts(id,tenant_id,name,owner_id,attributes) VALUES($1,$2,\'QA\',$3,\'{"service":"visa"}\')',
    [ct, tenant, owner],
  );
  await pg.query(
    'INSERT INTO conversations(id,tenant_id,channel_id,contact_id) VALUES($1,$2,$3,$4)',
    [cv, tenant, ch, ct],
  );
  return { ct, cv };
};
const results = [];
const check = (name, actual, expected) => {
  results.push({ name, pass: actual === expected, actual, expected });
};
await policy({
  enabled: true,
  method: 'rules',
  memberIds: [],
  rules: [{ tag: 'visa', memberIds: [a] }],
});
const returning = await make(b);
await pg.query("UPDATE contacts SET tags='{visa}' WHERE id=$1", [returning.ct]);
check(
  'returning owner outside matching rule is rejected',
  await service.autoAssignIfEnabled(tenant, returning.cv),
  a,
);
await pg.query('INSERT INTO inbox_settings(tenant_id,max_open_per_agent) VALUES($1,1)', [tenant]);
await policy({ enabled: true, method: 'least_loaded', memberIds: [a], rules: [] });
const first = await make(a);
await service.autoAssignIfEnabled(tenant, first.cv);
const second = await make(a);
check(
  'returning owner at capacity must wait',
  await service.autoAssignIfEnabled(tenant, second.cv),
  null,
);
const waiting = (
  await pg.query(
    'SELECT count(*)::int n FROM crm_notifications WHERE tenant_id=$1 AND resource_id=$2',
    [tenant, second.cv],
  )
).rows[0].n;
// No manager fixture yet: the queue event itself must persist even without recipients.
const marker = (
  await pg.query(
    "SELECT count(*)::int n FROM messages WHERE conversation_id=$1 AND content->>'event'='assignment_waiting'",
    [second.cv],
  )
).rows[0].n;
check('no-candidate reason persists on the conversation', marker > 0, true);
check(
  'foreign tenant cannot select our staff',
  await db.withTenant(other, (c) => service.candidate(c)),
  null,
);
if (!process.env.QA_BASELINE) {
  const manager = uuid();
  await pg.query('INSERT INTO users(id,email) VALUES($1,$2)', [manager, manager + '@example.test']);
  await pg.query(
    "INSERT INTO memberships(tenant_id,user_id,role,available) VALUES($1,$2,'owner',true)",
    [tenant, manager],
  );
  await pg.query("UPDATE conversations SET status='closed' WHERE tenant_id=$1", [tenant]);
  await policy({
    enabled: true,
    method: 'rules',
    memberIds: [],
    maxOpenPerAgent: 2,
    rules: [
      { fieldKey: 'service', fieldValue: 'visa', memberIds: [a] },
      { fieldKey: 'service', fieldValue: 'flight', memberIds: [b] },
    ],
  });
  const context = { attributes: { service: 'visa' }, channelId: ch };
  check(
    'missing service is qualification pending',
    (await db.withTenant(tenant, (c) => service.evaluate(c, { channelId: ch }))).reason,
    'awaiting_service',
  );
  const pending = await make(null);
  await pg.query("UPDATE contacts SET attributes='{}' WHERE id=$1", [pending.ct]);
  await service.autoAssignIfEnabled(tenant, pending.cv);
  check(
    'pending qualification does not alert manager',
    (
      await pg.query('SELECT count(*)::int n FROM crm_notifications WHERE resource_id=$1', [
        pending.cv,
      ])
    ).rows[0].n,
    0,
  );

  const beforeCursor = (
    await pg.query("SELECT settings->>'crmAssignmentLast' last FROM tenants WHERE id=$1", [tenant])
  ).rows[0].last;
  check(
    'service field chooses visa specialist',
    await db.withTenant(tenant, (c) => service.candidate(c, context)),
    a,
  );
  check(
    'dry-run leaves rotation cursor unchanged',
    (
      await pg.query("SELECT settings->>'crmAssignmentLast' last FROM tenants WHERE id=$1", [
        tenant,
      ])
    ).rows[0].last,
    beforeCursor,
  );
  await pg.query('UPDATE memberships SET available=false WHERE tenant_id=$1 AND user_id=$2', [
    tenant,
    a,
  ]);
  check(
    'unavailable specialist excluded',
    await db.withTenant(tenant, (c) => service.candidate(c, context)),
    null,
  );
  const queued = await make(b);
  await service.autoAssignIfEnabled(tenant, queued.cv);
  await service.autoAssignIfEnabled(tenant, queued.cv);
  check(
    'waiting alerts reach manager once',
    (
      await pg.query(
        'SELECT count(*)::int n FROM crm_notifications WHERE user_id=$1 AND resource_id=$2',
        [manager, queued.cv],
      )
    ).rows[0].n,
    1,
  );
  await pg.query('UPDATE memberships SET available=true WHERE tenant_id=$1 AND user_id=$2', [
    tenant,
    a,
  ]);
  check(
    'retry assigns eligible specialist',
    await service.autoAssignIfEnabled(tenant, queued.cv, true),
    a,
  );
  check(
    'assignment resolves waiting notification',
    !!(
      await pg.query(
        'SELECT handled_at FROM crm_notifications WHERE user_id=$1 AND resource_id=$2',
        [manager, queued.cv],
      )
    ).rows[0].handled_at,
    true,
  );
  check(
    'eligible returning owner retained',
    await service.autoAssignIfEnabled(tenant, queued.cv),
    a,
  );
  await pg.query('UPDATE contacts SET attributes=\'{"service":"flight"}\' WHERE id=$1', [
    queued.ct,
  ]);
  await service.routeAnswer({
    tenantId: tenant,
    type: 'crm.bot.answer',
    payload: { contactId: queued.ct },
  });
  check(
    'changed service reroutes bot-owned conversation',
    (await pg.query('SELECT assigned_to FROM conversations WHERE id=$1', [queued.cv])).rows[0]
      .assigned_to,
    b,
  );
  await pg.query("UPDATE conversations SET handled_by='human' WHERE id=$1", [queued.cv]);
  await pg.query('UPDATE contacts SET attributes=\'{"service":"visa"}\' WHERE id=$1', [queued.ct]);
  await service.routeAnswer({
    tenantId: tenant,
    type: 'crm.bot.answer',
    payload: { contactId: queued.ct },
  });
  check(
    'bot-answer events never steal human-owned conversation',
    (await pg.query('SELECT assigned_to FROM conversations WHERE id=$1', [queued.cv])).rows[0]
      .assigned_to,
    b,
  );
  const dept = uuid();
  await pg.query("INSERT INTO departments(id,tenant_id,name) VALUES($1,$2,'Visas')", [
    dept,
    tenant,
  ]);
  await pg.query(
    'INSERT INTO department_members(tenant_id,department_id,user_id) VALUES($1,$2,$3)',
    [tenant, dept, a],
  );
  await policy({
    enabled: true,
    method: 'rules',
    memberIds: [],
    rules: [{ channelId: ch, departmentId: dept, tag: 'visa', memberIds: [a, b] }],
  });
  check(
    'channel department and tag all match',
    await db.withTenant(tenant, (c) =>
      service.candidate(c, { channelId: ch, departmentId: dept, tags: ['visa'] }),
    ),
    a,
  );
  check(
    'missing tag does not match',
    await db.withTenant(tenant, (c) =>
      service.candidate(c, { channelId: ch, departmentId: dept, tags: [] }),
    ),
    null,
  );
  await pg.query("UPDATE conversations SET status='closed' WHERE tenant_id=$1", [tenant]);
  await policy({
    enabled: true,
    method: 'round_robin',
    memberIds: [a, b],
    rules: [],
    maxOpenPerAgent: 10,
  });
  const round = await Promise.all(Array.from({ length: 6 }, () => make(null)));
  const chosen = await Promise.all(round.map((x) => service.autoAssignIfEnabled(tenant, x.cv)));
  check('six concurrent arrivals balance round robin', chosen.filter((x) => x === a).length, 3);
  check(
    'one durable assignment per concurrent conversation',
    (
      await pg.query(
        "SELECT count(*)::int n FROM messages WHERE conversation_id=ANY($1::uuid[]) AND content->>'event'='assigned'",
        [round.map((x) => x.cv)],
      )
    ).rows[0].n,
    6,
  );
  await policy({
    enabled: true,
    method: 'least_loaded',
    memberIds: [a, b],
    rules: [],
    maxOpenPerAgent: 10,
  });
  await pg.query("UPDATE conversations SET status='closed' WHERE id=$1", [
    round.find((x, i) => chosen[i] === a).cv,
  ]);
  check(
    'least loaded uses open conversations',
    await db.withTenant(tenant, (c) => service.candidate(c)),
    a,
  );
}
const path =
  'docs/acceptance/2026-11-02-assignment/' +
  (process.env.QA_BASELINE ? 'before' : 'after') +
  '.json';
writeFileSync(
  path,
  JSON.stringify(
    { engine: 'PostgreSQL/PGlite, all migrations, app_user RLS; not native server', results },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
await pg.close();
if (!process.env.QA_BASELINE && results.some((r) => !r.pass)) process.exitCode = 1;
