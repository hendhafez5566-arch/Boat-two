/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { nativeFlowDraftSchema } from './whatsapp-flow-contract';

test('native WhatsApp Flow lifecycle uses PostgreSQL claims, tenant isolation and explicit provider receipts', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'false',
  });
  const { WhatsAppFlowsService } = await import('./whatsapp-flows.service');
  const { ProviderError } = await import('./adapters/adapter');
  const { env } = await import('../config/env');
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222',
    channel = '33333333-3333-4333-8333-333333333333',
    foreignChannel = '44444444-4444-4444-8444-444444444444';
  const als = new AsyncLocalStorage<{ tenant: string; c: any }>();
  const db: any = {
    withTenant: async (id: string, fn: (c: any) => unknown) => {
      const current = als.getStore();
      if (current) {
        assert.equal(id, current.tenant);
        return fn(current.c);
      }
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        const c = {
          query: async (sql: string, args: unknown[] = []) => {
            const result = await tx.query(sql, args);
            return { ...result, rowCount: result.affectedRows || result.rows.length };
          },
        };
        return als.run({ tenant: id, c }, () => fn(c));
      });
    },
  };
  let calls = 0,
    uploads = 0;
  let errors: Record<string, unknown>[] = [];
  let providerStatus = 'DRAFT';
  let providerWaba = '900';
  let createMode: 'ok' | 'unknown' | 'reject' = 'ok';
  let holdCreate: (() => Promise<void>) | undefined;
  const gateway: any = {
    create: async () => {
      calls++;
      if (holdCreate) await holdCreate();
      if (createMode === 'unknown') throw new Error('Timeout');
      if (createMode === 'reject') throw new ProviderError('Rejected', 400);
      return { id: '12345' };
    },
    get: async (id: string) => {
      calls++;
      return {
        id,
        name: 'Contact',
        categories: ['CONTACT_US'],
        status: providerStatus,
        validation_errors: errors,
        whatsapp_business_account: { id: providerWaba },
        preview: {
          preview_url: 'https://business.facebook.com/wa/manage/flows/12345/preview/?token=test',
          expires_at: '2030-01-01',
        },
      };
    },
    upload: async () => {
      calls++;
      uploads++;
      return { success: true, validation_errors: errors };
    },
    transition: async (_id: string, _token: string, action: string) => {
      calls++;
      providerStatus = action === 'publish' ? 'PUBLISHED' : 'DEPRECATED';
      return { success: true };
    },
    list: async () => ({
      items: [
        {
          id: '12345',
          name: 'Contact',
          categories: ['CONTACT_US'],
          status: providerStatus,
          validation_errors: errors,
          whatsapp_business_account: { id: providerWaba },
        },
      ],
      complete: true,
    }),
  };
  const service = new WhatsAppFlowsService(
    db,
    { credentials: () => ({ accessToken: 'test-no-network', wabaId: '900' }) } as any,
    gateway,
  );
  const draft = nativeFlowDraftSchema.parse({
    name: 'Contact',
    categories: ['CONTACT_US'],
    definition: {
      version: '7.3',
      screens: [{ id: 'CONTACT', layout: { type: 'SingleColumnLayout', children: [] } }],
    },
  });
  try {
    await pg.exec(readFileSync(resolve('src/business/test-fixtures/parity.sql'), 'utf8'));
    await pg.exec(readFileSync(resolve('src/database/migrations/090_whatsapp_flows.sql'), 'utf8'));
    await pg.query('INSERT INTO tenants VALUES($1,$2),($3,$4)', [tenant, 'One', other, 'Two']);
    await pg.query(
      "INSERT INTO channels(id,tenant_id,name,type) VALUES($1,$2,'Account','whatsapp'),($3,$4,'Foreign','whatsapp')",
      [channel, tenant, foreignChannel, other],
    );
    let row = await service.create(tenant, channel, draft);
    await t.test(
      'local drafts need no external access, reject stale edits and exclude foreign tenants',
      async () => {
        assert.equal(row.provider_status, 'LOCAL_DRAFT');
        assert.equal(calls, 0);
        row = await service.edit(tenant, channel, row.id, row.revision, draft);
        await assert.rejects(
          () => service.edit(tenant, channel, row.id, row.revision - 1, draft),
          /changed/,
        );
        await assert.rejects(() => service.list(other, channel), /not found/);
        await assert.rejects(() => service.create(tenant, foreignChannel, draft), /not found/);
        await assert.rejects(
          () => service.operate(tenant, channel, row.id, row.revision, 'create'),
          /disabled/,
        );
        assert.equal(calls, 0);
      },
    );
    env.EXTERNAL_DELIVERY_ENABLED = 'true';
    await t.test('a durable registration claim prevents a second provider request', async () => {
      let entered!: () => void, release!: () => void;
      const began = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      holdCreate = async () => {
        entered();
        await blocked;
      };
      const first = service.operate(tenant, channel, row.id, row.revision, 'create');
      await began;
      await assert.rejects(
        () => service.operate(tenant, channel, row.id, row.revision, 'create'),
        /changed|reconciliation/,
      );
      assert.equal(calls, 1);
      release();
      row = await first;
      holdCreate = undefined;
      assert.equal(row.provider_id, '12345');
      assert.equal(row.operation, null);
    });
    await t.test(
      'publication needs a current uploaded definition and zero validation errors',
      async () => {
        await assert.rejects(
          () => service.operate(tenant, channel, row.id, row.revision, 'publish'),
          /Upload/,
        );
        errors = [{ message: 'Invalid form component', line_start: 3 }];
        row = await service.operate(tenant, channel, row.id, row.revision, 'upload');
        assert.equal(row.validation_errors.length, 1);
        await assert.rejects(
          () => service.operate(tenant, channel, row.id, row.revision, 'publish'),
          /resolve/,
        );
        errors = [];
        row = await service.operate(tenant, channel, row.id, row.revision, 'upload');
        row = await service.edit(tenant, channel, row.id, row.revision, {
          ...draft,
          definition: { ...draft.definition, version: '7.2' },
        });
        await assert.rejects(
          () => service.operate(tenant, channel, row.id, row.revision, 'publish'),
          /Upload/,
        );
        row = await service.operate(tenant, channel, row.id, row.revision, 'upload');
        row = await service.operate(tenant, channel, row.id, row.revision, 'publish');
        assert.equal(row.provider_status, 'PUBLISHED');
        assert.equal(uploads, 3);
        await assert.rejects(
          () => service.edit(tenant, channel, row.id, row.revision, draft),
          /cannot be edited/,
        );
        row = await service.operate(tenant, channel, row.id, row.revision, 'deprecate');
        assert.equal(row.provider_status, 'DEPRECATED');
      },
    );
    await t.test('status refresh verifies the owning WABA and filters preview URLs', async () => {
      providerWaba = 'foreign';
      await assert.rejects(() => service.refresh(tenant, channel, row.id), /does not belong/);
      providerWaba = '900';
      const result = await service.refresh(tenant, channel, row.id);
      row = result.flow;
      assert.ok(result.preview?.url?.startsWith('https://business.facebook.com/'));
    });
    await t.test(
      'unknown create outcomes block automatic retry and reconcile only with matching provider evidence',
      async () => {
        const uncertain = await service.create(tenant, channel, draft);
        createMode = 'unknown';
        await assert.rejects(
          () => service.operate(tenant, channel, uncertain.id, uncertain.revision, 'create'),
          /unknown/,
        );
        const state = (await service.list(tenant, channel)).find(
          (item) => item.id === uncertain.id,
        )!;
        assert.equal(state.operation_state, 'unknown');
        const before = calls;
        await assert.rejects(
          () => service.operate(tenant, channel, state.id, state.revision, 'create'),
          /reconciliation/,
        );
        assert.equal(calls, before);
        // Use a different provider receipt so it does not collide with the already managed Flow.
        providerStatus = 'DRAFT';
        providerWaba = 'foreign';
        await assert.rejects(
          () => service.reconcileCreate(tenant, channel, state.id, state.revision, '67890'),
          /does not belong/,
        );
        providerWaba = '900';
        const recovered = await service.reconcileCreate(
          tenant,
          channel,
          state.id,
          state.revision,
          '67890',
        );
        assert.equal(recovered.provider_id, '67890');
        assert.equal(recovered.operation, null);
        assert.equal(recovered.uploaded_hash, null);
        createMode = 'ok';
      },
    );
    await t.test(
      'explicit provider rejection releases the claim but preserves a local draft',
      async () => {
        const local = await service.create(tenant, channel, draft);
        createMode = 'reject';
        await assert.rejects(
          () => service.operate(tenant, channel, local.id, local.revision, 'create'),
          /rejected/,
        );
        const state = (await service.list(tenant, channel)).find((item) => item.id === local.id)!;
        assert.equal(state.operation, null);
        assert.equal(state.provider_status, 'LOCAL_DRAFT');
        createMode = 'ok';
      },
    );
    await t.test(
      'stale upload claims recover without treating unknown validation as a successful upload',
      async () => {
        const local = await service.create(tenant, channel, draft);
        await pg.query(
          "UPDATE whatsapp_flows SET provider_id='88888',waba_id='900',provider_status='DRAFT',operation='upload',operation_state='running',operation_id=gen_random_uuid(),operation_started_at=now() WHERE id=$1",
          [local.id],
        );
        await assert.rejects(() => service.refresh(tenant, channel, local.id), /still running/);
        await pg.query(
          "UPDATE whatsapp_flows SET operation_started_at=now()-interval '3 minutes' WHERE id=$1",
          [local.id],
        );
        const refreshed = await service.refresh(tenant, channel, local.id);
        assert.equal(refreshed.flow.operation, null);
        assert.equal(refreshed.flow.uploaded_hash, null);
        await assert.rejects(
          () => service.operate(tenant, channel, local.id, refreshed.flow.revision, 'publish'),
          /Upload/,
        );
      },
    );
    await t.test(
      'uncertain registration can merge its definition with a separately synchronized provider receipt',
      async () => {
        const local = await service.create(tenant, channel, draft);
        await pg.query(
          "UPDATE whatsapp_flows SET operation='create',operation_state='unknown',operation_id=gen_random_uuid(),operation_started_at=now()-interval '3 minutes' WHERE id=$1",
          [local.id],
        );
        await pg.query(
          "INSERT INTO whatsapp_flows(tenant_id,channel_id,name,categories,provider_id,waba_id,provider_status) VALUES($1,$2,'Contact',ARRAY['CONTACT_US'],'77777','900','DRAFT')",
          [tenant, channel],
        );
        const merged = await service.reconcileCreate(
          tenant,
          channel,
          local.id,
          local.revision,
          '77777',
        );
        assert.equal(merged.provider_id, '77777');
        assert.ok(merged.definition);
        assert.equal(merged.uploaded_hash, null);
        assert.notEqual(merged.id, local.id);
        assert.equal(
          (await service.list(tenant, channel)).some((item) => item.id === local.id),
          false,
        );
      },
    );
  } finally {
    env.EXTERNAL_DELIVERY_ENABLED = 'false';
    await pg.close();
  }
});
