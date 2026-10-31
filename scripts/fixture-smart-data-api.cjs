/* eslint-disable */
// Isolated local acceptance only. No real accounts, credentials or external delivery.
const { createRequire } = require('node:module');
const local = createRequire(require('node:path').resolve('apps/api/package.json'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'smart-data-fixture-secret-long-enough',
  ENCRYPTION_KEY: '0'.repeat(64),
  EXTERNAL_DELIVERY_ENABLED: 'false',
  AI_PROVIDER_CALLS_ENABLED: 'false',
});
local('reflect-metadata');
const { PGlite } = local('@electric-sql/pglite');
const { Module } = local('@nestjs/common');
const { NestFactory, Reflector } = local('@nestjs/core');
const { JwtService } = local('@nestjs/jwt');
const { AsyncLocalStorage } = require('node:async_hooks');
const { readFileSync } = require('node:fs');
const { DataSourcesService } = local('./dist/commerce/data-sources.service');
const { DataSourcesController } = local('./dist/commerce/data-sources.controller');
const { FlowsService } = local('./dist/flows/flows.service');
const { FlowsController } = local('./dist/flows/flows.controller');
const { AuthGuard } = local('./dist/auth/auth.guard');
const { FlowEngine } = local('./dist/flows/engine/engine');
const { newState } = local('./dist/flows/engine/types');
const tenant = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  user = '33333333-3333-4333-8333-333333333333',
  agent = '44444444-4444-4444-8444-444444444444';
(async () => {
  const pg = new PGlite();
  const scope = new AsyncLocalStorage();
  const wrap = (tx) => ({
    query: async (sql, args = []) => {
      const r = await tx.query(sql, args);
      return { ...r, rowCount: r.affectedRows || r.rows.length };
    },
  });
  const db = {
    query: async (sql, args = []) => {
      const r = await pg.query(sql, args);
      return { ...r, rowCount: r.affectedRows || r.rows.length };
    },
    withTenant: async (id, fn) => {
      const active = scope.getStore();
      if (active) {
        if (active.id !== id) throw Error('tenant mismatch');
        return fn(active.c);
      }
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        return scope.run({ id, c: wrap(tx) }, () => fn(wrap(tx)));
      });
    },
  };
  await pg.exec(
    `CREATE ROLE app_user;GRANT USAGE ON SCHEMA public TO app_user;CREATE TABLE tenants(id uuid PRIMARY KEY,suspended_at timestamptz);CREATE TABLE users(id uuid PRIMARY KEY,session_version int DEFAULT 0,disabled_at timestamptz);CREATE TABLE memberships(tenant_id uuid,user_id uuid,role text);CREATE TABLE integration_connections(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,provider text,enabled boolean,UNIQUE(tenant_id,id));CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid,attributes jsonb DEFAULT '{}',UNIQUE(tenant_id,id));CREATE TABLE channels(id uuid PRIMARY KEY,tenant_id uuid,UNIQUE(tenant_id,id));GRANT SELECT ON tenants,memberships,integration_connections TO app_user;GRANT SELECT,UPDATE ON contacts TO app_user;CREATE FUNCTION audit_core_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`,
  );
  for (const table of ['memberships', 'integration_connections', 'contacts'])
    await pg.exec(
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_isolation ON ${table} USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);`,
    );
  await pg.exec(readFileSync('apps/api/src/database/migrations/086_commerce.sql', 'utf8'));
  await pg.exec(
    readFileSync('apps/api/src/database/migrations/095_smart_data_sources.sql', 'utf8'),
  );
  await pg.query('INSERT INTO tenants(id) VALUES($1),($2)', [tenant, other]);
  await pg.query('INSERT INTO users(id) VALUES($1),($2)', [user, agent]);
  await pg.query("INSERT INTO memberships VALUES($1,$2,'owner'),($1,$3,'agent'),($4,$2,'owner')", [
    tenant,
    user,
    agent,
    other,
  ]);
  await pg.query('INSERT INTO contacts(id,tenant_id) VALUES($1,$2)', [user, tenant]);
  await pg.exec(`CREATE TABLE flows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,name text,description text,status text DEFAULT 'draft',priority int DEFAULT 0,triggers jsonb DEFAULT '[]',channel_ids uuid[] DEFAULT '{}',published_version_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),folder_name text,draft_graph jsonb,is_component boolean DEFAULT false,created_by uuid);
 CREATE TABLE flow_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,flow_id uuid,version int,graph jsonb,triggers jsonb,channel_ids uuid[],created_by uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE conversations(id uuid,contact_id uuid);CREATE TABLE messages(flow_node_id text,status text,conversation_id uuid,flow_id uuid,direction text);CREATE TABLE flow_sessions(id uuid,status text,error text,created_at timestamptz,updated_at timestamptz,flow_id uuid);GRANT SELECT ON conversations,messages,flow_sessions TO app_user;
 CREATE TABLE flow_button_clicks(flow_id uuid,node_id text,option_id text,contact_id uuid,errored boolean);
 GRANT UPDATE ON tenants TO app_user;ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;ALTER TABLE tenants FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_isolation ON tenants USING(id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);GRANT SELECT,INSERT,UPDATE,DELETE ON flows,flow_versions TO app_user;GRANT SELECT ON flow_button_clicks TO app_user;
 ALTER TABLE flows ENABLE ROW LEVEL SECURITY;ALTER TABLE flows FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_isolation ON flows USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
 ALTER TABLE flow_versions ENABLE ROW LEVEL SECURITY;ALTER TABLE flow_versions FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_isolation ON flow_versions USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);`);
  const google = {
    execute: async () => {
      throw Error('No live Google in fixture');
    },
  };
  const sources = new DataSourcesService(db, google);
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  class FixtureModule {}
  Module({
    controllers: [DataSourcesController, FlowsController],
    providers: [
      { provide: DataSourcesService, useValue: sources },
      {
        provide: FlowsService,
        useValue: new FlowsService(
          db,
          { assertWithinLimit: async () => {} },
          {},
          google,
          undefined,
          sources,
        ),
      },
    ],
  })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: ['error'] });
  app.enableCors();
  app.useGlobalGuards(new AuthGuard(jwt, new Reflector(), db));
  app.use((req, res, next) => {
    if (req.path === '/fixture/tokens')
      return res.json({
        owner: jwt.sign({ sub: user, tid: tenant, role: 'owner' }),
        agent: jwt.sign({ sub: agent, tid: tenant, role: 'agent' }),
        other: jwt.sign({ sub: user, tid: other, role: 'owner' }),
      });
    if (req.path === '/workspace')
      return res.json({
        tenant: { id: tenant, name: 'Smart Catalog QA' },
        role: 'owner',
        usage: {},
        plan: { limits: {} },
        aiEnabled: true,
      });
    if (req.path === '/workspace/branding') return res.json({ enabled: false });
    if (req.path === '/branding/resolve') return res.json({ enabled: false });
    if (['/crm/fields', '/workspace/members', '/departments', '/sequences'].includes(req.path))
      return res.json([]);
    if (req.path === '/crm/contacts') return res.json({ items: [] });
    if (
      [
        '/channels',
        '/integrations',
        '/commerce/products',
        '/commerce/services',
        '/commerce/appointments',
      ].includes(req.path)
    )
      return res.json([]);
    next();
  });
  await app.listen(4000, '127.0.0.1');
  console.log('Isolated Nest / PostgreSQL fixture ready on 4000');
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
