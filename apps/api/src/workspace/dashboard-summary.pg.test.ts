import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { dashboardChannelSchema, dashboardSummary } from './dashboard-summary';

test('dashboard uses thirty UTC days, platform scoping, distinct subscriptions and tenant RLS', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE channels(id text,tenant_id text,type text);
      CREATE TABLE contact_channels(contact_id text,tenant_id text,channel_id text,created_at timestamptz);
      CREATE TABLE consent_history(contact_id text,tenant_id text,channel_id text,status text,created_at timestamptz);
      CREATE TABLE ai_settings(tenant_id text,enabled boolean);
      CREATE TABLE ai_agents(tenant_id text,provider_id text,enabled boolean);
      CREATE TABLE ai_providers(id text,tenant_id text,enabled boolean);
      CREATE TABLE knowledge_sources(id text,tenant_id text,archived_at timestamptz);
      CREATE TABLE knowledge_jobs(source_id text,tenant_id text,status text,updated_at timestamptz);
      CREATE TABLE users(id text,full_name text);
      INSERT INTO channels VALUES('w','one','whatsapp'),('w2','one','whatsapp'),('t','one','telegram'),('f','two','whatsapp');
      INSERT INTO contact_channels VALUES
        ('a','one','w','2026-09-29 00:00Z'),('a','one','w2','2026-10-28 01:00Z'),
        ('b','one','w','2026-10-28 23:59:59Z'),('outside','one','w','2026-09-28 23:59:59Z'),
        ('tomorrow','one','w','2026-10-29 00:00Z'),('telegram','one','t','2026-10-28 01:00Z'),
        ('foreign','two','f','2026-10-28 01:00Z');
      INSERT INTO consent_history VALUES
        ('a','one','w','opted_out','2026-10-28 10:00Z'),('a','one','w2','opted_out','2026-10-28 11:00Z'),
        ('b','one','w','opted_in','2026-10-28 10:00Z'),('foreign','two','f','opted_out','2026-10-28 12:00Z');
      INSERT INTO ai_settings VALUES('one',true),('two',false);
      INSERT INTO knowledge_sources VALUES('s','one',null),('archived','one',now()),('foreign','two',null);
      INSERT INTO knowledge_jobs VALUES('s','one','completed','2026-10-20 12:00Z'),('s','one','failed','2026-10-28 12:00Z'),('archived','one','completed','2026-10-27 12:00Z');
      INSERT INTO users VALUES('user','Name'),('other','Other');
      DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['channels','contact_channels','consent_history','ai_settings','ai_agents','ai_providers','knowledge_sources','knowledge_jobs'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
        EXECUTE format('CREATE POLICY tenant_policy ON %I USING(tenant_id=current_setting(''app.tenant_id'',true))',t);
        EXECUTE format('GRANT SELECT ON %I TO app_user',t);
      END LOOP; END $$;
      GRANT SELECT ON users TO app_user;
    `);
    await pg.transaction(async (tx) => {
      await tx.exec(
        "SET LOCAL ROLE app_user; SET LOCAL app.tenant_id='one'; SET LOCAL TIMEZONE='Asia/Dhaka'",
      );
      const c = {
        query: (sql: string, args?: unknown[]) => tx.query(sql, args),
      } as unknown as Pick<PoolClient, 'query'>;
      const now = new Date('2026-10-28T16:00:00Z');
      const result = await dashboardSummary(c, 'whatsapp', 'user', false, now);
      assert.equal(result.growth.length, 30);
      assert.deepEqual(result.growth[0], { day: '2026-09-29', gain: 1, drop: 0 });
      assert.deepEqual(result.growth[29], { day: '2026-10-28', gain: 1, drop: 1 });
      assert.equal(
        result.growth.reduce((n, d) => n + d.gain, 0),
        2,
      );
      assert.equal(result.ai.enabled, false);
      assert.equal(result.ai.sources, 1);
      assert.equal(new Date(result.ai.last_training).toISOString(), '2026-10-20T12:00:00.000Z');
      assert.equal(result.userName, 'Name');
      const telegram = await dashboardSummary(c, 'telegram', 'user', true, now);
      assert.equal(
        telegram.growth.reduce((n, d) => n + d.gain, 0),
        1,
      );
      assert.equal(
        telegram.growth.reduce((n, d) => n + d.drop, 0),
        0,
      );
      assert.equal(telegram.ai.enabled, true);
    });
    assert.equal(dashboardChannelSchema.parse(undefined), 'whatsapp');
    assert.equal(dashboardChannelSchema.safeParse('anything').success, false);
  } finally {
    await pg.close();
  }
});
