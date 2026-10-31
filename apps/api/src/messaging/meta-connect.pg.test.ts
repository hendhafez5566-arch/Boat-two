/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

test('Meta onboarding and token rotation preserve tenant and phone identity in PostgreSQL', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    META_APP_ID: '100',
    META_APP_SECRET: 'synthetic-test-app-secret',
    META_EMBEDDED_CONFIG_ID: '700',
    EXTERNAL_DELIVERY_ENABLED: 'false',
    META_CONNECT_ENABLED: 'true',
  });
  const { env } = await import('../config/env');
  const { MetaConnectController } = await import('./meta-connect.controller');
  const { ChannelsService } = await import('./channels.service');
  const { CryptoService } = await import('./crypto.service');
  const { inspectMetaMessagingPermission } = await import('./meta-messaging-inspection');
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222';
  const user = '33333333-3333-4333-8333-333333333333',
    secondUser = '44444444-4444-4444-8444-444444444444';
  await pg.exec(`CREATE ROLE app_user; CREATE TABLE tenants(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE memberships(tenant_id uuid, user_id uuid, role text);
    CREATE TABLE channels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,type text,name text,external_id text UNIQUE,credentials_enc text,settings jsonb NOT NULL DEFAULT '{}',status text DEFAULT 'active',created_at timestamptz DEFAULT now());
    INSERT INTO tenants VALUES('${tenant}'),('${other}'); INSERT INTO users VALUES('${user}'),('${secondUser}');
    INSERT INTO memberships VALUES('${tenant}','${user}','owner'),('${tenant}','${secondUser}','admin');
    GRANT SELECT,INSERT,UPDATE,DELETE ON tenants,users,memberships,channels TO app_user;`);
  for (const table of ['tenants', 'memberships', 'channels'])
    await pg.exec(
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY; CREATE POLICY isolation ON ${table} USING(${table === 'tenants' ? 'id' : 'tenant_id'}=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(${table === 'tenants' ? 'id' : 'tenant_id'}=nullif(current_setting('app.tenant_id',true),'')::uuid);`,
    );
  await pg.exec(
    readFileSync(resolve(__dirname, '../database/migrations/013_meta_connections.sql'), 'utf8'),
  );
  type Client = { query: (sql: string, params?: unknown[]) => Promise<any> };
  await pg.exec(
    `CREATE FUNCTION channel_lookup(p_type text,p_external_id text) RETURNS SETOF channels LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT * FROM channels WHERE type=p_type AND external_id=p_external_id $$; REVOKE ALL ON FUNCTION channel_lookup(text,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION channel_lookup(text,text) TO app_user;`,
  );
  const als = new AsyncLocalStorage<{ tenant: string; c: Client }>();
  const db: any = {
    withTenant: async (id: string, fn: (c: Client) => unknown) => {
      const active = als.getStore();
      if (active) {
        assert.equal(id, active.tenant);
        return fn(active.c);
      }
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        const c: Client = {
          query: async (sql, params = []) => {
            const value = await tx.query(sql, params);
            return { ...value, rowCount: value.affectedRows || value.rows.length };
          },
        };
        return als.run({ tenant: id, c }, () => fn(c));
      });
    },
    query: async (sql: string, params: unknown[]) =>
      pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        return tx.query(sql, params);
      }),
  };
  const crypto = new CryptoService();
  const channels = new ChannelsService(db, { assertWithinLimit: async () => {} } as never, crypto);
  const controller = new MetaConnectController(db, crypto, channels);
  const req = { user: { userId: user, tenantId: tenant, role: 'owner' } } as any;
  let valid = true,
    app = '100',
    phones = ['600'],
    scopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
  let exchangeCalls = 0,
    networkCalls = 0,
    expiresAt = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    networkCalls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://graph.facebook.com');
    if (url.pathname.endsWith('/oauth/access_token')) {
      exchangeCalls++;
      return Response.json({ access_token: 'synthetic-onboarding-token' });
    }
    if (url.pathname.endsWith('/debug_token'))
      return Response.json({
        data: { app_id: app, is_valid: valid, type: 'SYSTEM_USER', scopes, expires_at: expiresAt },
      });
    if (url.pathname.endsWith('/500/subscribed_apps'))
      return Response.json({ data: [{ whatsapp_business_api_data: { id: '100' } }] });
    if (url.pathname.endsWith('/500/phone_numbers'))
      return Response.json({ data: phones.map((id) => ({ id })) });
    throw new Error('Unexpected test provider endpoint');
  };
  try {
    await t.test('setup can be enabled without globally enabling outbound delivery', async () => {
      assert.equal(controller.config().connectEnabled, true);
      assert.equal(env.EXTERNAL_DELIVERY_ENABLED, 'false');
    });
    await t.test(
      'a foreign tenant or another owner cannot consume a valid signup state',
      async () => {
        const state = (await controller.start(req, { kind: 'whatsapp' })).state;
        const body = {
          state,
          code: 'synthetic-code',
          wabaId: '500',
          phoneNumberId: '600',
          name: 'Synthetic QA',
        };
        await assert.rejects(
          controller.embedded({ user: { ...req.user, tenantId: other } } as any, body),
          /owner mismatch/,
        );
        await assert.rejects(
          controller.embedded({ user: { ...req.user, userId: secondUser } } as any, body),
          /owner mismatch/,
        );
        assert.equal(exchangeCalls, 0);
        const created = await controller.embedded(req, body);
        assert.ok(created.id);
        await assert.rejects(controller.embedded(req, body), /expired or already consumed/);
        assert.equal(exchangeCalls, 1);
        const row = (await pg.query<any>('SELECT * FROM channels')).rows[0];
        assert.ok(!row.credentials_enc.includes('synthetic-onboarding-token'));
        assert.equal(row.settings.metaAuthorization.status, 'granted');
      },
    );
    const channel = (await pg.query<any>('SELECT * FROM channels')).rows[0];
    await t.test('reauthorization keeps the same channel id and settings', async () => {
      await pg.query(
        'UPDATE channels SET settings=settings || \'{"customSetting":true}\'::jsonb WHERE id=$1',
        [channel.id],
      );
      const { state } = await controller.start(req, { kind: 'whatsapp' });
      const result = await controller.embedded(req, {
        state,
        code: 'synthetic-code',
        wabaId: '500',
        phoneNumberId: '600',
        name: 'Synthetic QA',
      });
      assert.equal(result.id, channel.id);
      assert.equal((await pg.query<any>('SELECT * FROM channels')).rows.length, 1);
      assert.equal(
        (await pg.query<any>('SELECT settings FROM channels')).rows[0].settings.customSetting,
        true,
      );
    });
    await t.test(
      'wrong app, expired token, missing permission and another phone preserve the old credentials',
      async () => {
        const old = (await pg.query<any>('SELECT credentials_enc FROM channels')).rows[0]
          .credentials_enc;
        valid = false;
        await assert.rejects(
          channels.reconnect(tenant, channel.id, 'synthetic-bad-token'),
          /invalid, expired/,
        );
        valid = true;
        app = '999';
        await assert.rejects(
          channels.reconnect(tenant, channel.id, 'synthetic-bad-token'),
          /another app/,
        );
        app = '100';
        scopes = ['whatsapp_business_management'];
        await assert.rejects(
          channels.reconnect(tenant, channel.id, 'synthetic-bad-token'),
          /messaging permission/,
        );
        scopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
        expiresAt = Math.floor(Date.now() / 1000) - 1;
        await assert.rejects(
          channels.reconnect(tenant, channel.id, 'synthetic-bad-token'),
          /invalid, expired/,
        );
        expiresAt = 0;
        phones = ['601'];
        await assert.rejects(
          channels.reconnect(tenant, channel.id, 'synthetic-bad-token'),
          /exact phone/,
        );
        phones = ['600'];
        await assert.rejects(
          channels.reconnect(tenant, channel.id, 'synthetic-bad-token', '501'),
          /cannot change/,
        );
        assert.equal(
          (await pg.query<any>('SELECT credentials_enc FROM channels')).rows[0].credentials_enc,
          old,
        );
        const before = networkCalls;
        await assert.rejects(
          channels.reconnect(other, channel.id, 'synthetic-bad-token'),
          /not found/,
        );
        assert.equal(networkCalls, before);
      },
    );
    await t.test(
      'revocation overrides cached connectivity and valid rotation preserves identity',
      async () => {
        await pg.query('UPDATE channels SET settings=settings || $1::jsonb', [
          JSON.stringify({
            connectionHealth: {
              state: 'connected',
              checkedAt: new Date().toISOString(),
              reason: 'provider_verified',
            },
          }),
        ]);
        valid = false;
        assert.equal(
          (await channels.inspectAuthorization(tenant, channel.id)).connectionHealth.state,
          'expired',
        );
        assert.equal((await channels.list(tenant))[0].connectionHealth.state, 'expired');
        valid = true;
        await channels.reconnect(tenant, channel.id, 'synthetic-replacement-token');
        const rows = await channels.list(tenant);
        assert.equal(rows[0].id, channel.id);
        assert.equal(rows[0].connectionHealth.state, 'needs_action');
        assert.equal(rows[0].settings.metaAuthorization.status, 'granted');
        assert.equal((await channels.list(other)).length, 0);
      },
    );
    await t.test(
      'subscription is idempotent and never overwrites callbacks or registers the phone',
      async () => {
        const calls: string[] = [];
        let mode = 'missing';
        globalThis.fetch = async (input, options) => {
          const url = new URL(String(input));
          assert.ok(url.pathname.endsWith('/500/subscribed_apps'));
          calls.push(options?.method ?? 'GET');
          if (options?.method === 'POST') return Response.json({ success: true });
          return Response.json({
            data:
              mode === 'missing'
                ? []
                : [
                    {
                      whatsapp_business_api_data: { id: '100' },
                      ...(mode === 'override'
                        ? { override_callback_uri: 'https://other.example/webhook' }
                        : {}),
                    },
                  ],
          });
        };
        assert.equal(await channels.completeWhatsAppSubscription(tenant, channel.id), true);
        assert.deepEqual(calls, ['GET', 'POST']);
        calls.length = 0;
        mode = 'subscribed';
        assert.equal(await channels.completeWhatsAppSubscription(tenant, channel.id), true);
        assert.deepEqual(calls, ['GET']);
        calls.length = 0;
        mode = 'override';
        assert.equal(await channels.completeWhatsAppSubscription(tenant, channel.id), false);
        assert.deepEqual(calls, ['GET']);
      },
    );
    await t.test(
      'inspection errors return no credentials and cannot claim permission',
      async () => {
        globalThis.fetch = async () => {
          throw new Error('synthetic secret must not be returned');
        };
        const result = await inspectMetaMessagingPermission('synthetic-private-token');
        assert.equal(result.status, 'unknown');
        assert.ok(!JSON.stringify(result).includes('synthetic'));
      },
    );
  } finally {
    globalThis.fetch = original;
    await pg.close();
  }
});
