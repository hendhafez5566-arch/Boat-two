/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { filtersSchema } from './schemas';

test('subscriber profiles and inbox views execute against PostgreSQL with tenant RLS', async (t) => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'false',
  });
  const { CrmService } = await import('./crm.service');
  const { InboxController } = await import('../inbox/inbox.controller');
  const { CampaignsController } = await import('./campaigns.controller');
  const { OutboundService } = await import('../messaging/outbound.service');
  const pg = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222';
  const account = '33333333-3333-4333-8333-333333333333',
    contact = '44444444-4444-4444-8444-444444444444',
    foreignContact = '55555555-5555-4555-8555-555555555555',
    conversation = '66666666-6666-4666-8666-666666666666',
    user = '77777777-7777-4777-8777-777777777777',
    sequence = '88888888-8888-4888-8888-888888888888';
  const local = new AsyncLocalStorage<{ tenant: string; c: any }>();
  const wrap = (tx: any) => ({
    query: async (sql: string, args: unknown[] = []) => {
      const result = await tx.query(sql, args);
      return { ...result, rowCount: result.affectedRows || result.rows.length };
    },
  });
  const db: any = {
    withTenant: async (id: string, fn: (c: any) => Promise<unknown>) => {
      const current = local.getStore();
      if (current) {
        assert.equal(id, current.tenant);
        return fn(current.c);
      }
      return pg.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
        const c = wrap(tx);
        return local.run({ tenant: id, c }, () => fn(c));
      });
    },
    conversation: async (id: string, _conv: string, fn: () => Promise<unknown>) =>
      db.withTenant(id, () => fn()),
  };
  try {
    await pg.exec(readFileSync(resolve('src/business/test-fixtures/parity.sql'), 'utf8'));
    await pg.exec(readFileSync(resolve('src/database/migrations/089_inbox_views.sql'), 'utf8'));
    await pg.query('INSERT INTO tenants VALUES($1,$2),($3,$4)', [tenant, 'One', other, 'Two']);
    await pg.query('INSERT INTO channels(id,tenant_id,name) VALUES($1,$2,$3)', [
      account,
      tenant,
      'Account',
    ]);
    await pg.query(
      "INSERT INTO contacts(id,tenant_id,name,tags,attributes,created_at,updated_at) VALUES($1,$2,'Alice','{existing}','{\"kept\":\"value\"}','2025-01-01','2025-01-01'),($3,$4,'Foreign','{}','{}','2025-01-01','2025-01-01')",
      [contact, tenant, foreignContact, other],
    );
    await pg.query(
      'INSERT INTO contact_channels(tenant_id,contact_id,channel_id,external_id) VALUES($1,$2,$3,$4)',
      [tenant, contact, account, 'recipient'],
    );
    await pg.query(
      "INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,'opted_in','Fixture consent')",
      [tenant, contact, account],
    );
    await pg.query("INSERT INTO sequences VALUES($1,$2,'Follow up',$3,'active')", [
      sequence,
      tenant,
      account,
    ]);
    await pg.query(
      "INSERT INTO sequence_enrollments(tenant_id,sequence_id,contact_id,status) VALUES($1,$2,$3,'active')",
      [tenant, sequence, contact],
    );
    await pg.query(
      'INSERT INTO conversations(id,tenant_id,channel_id,contact_id) VALUES($1,$2,$3,$4)',
      [conversation, tenant, account, contact],
    );
    const crm = new CrmService(db, { assertWithinLimit: async () => {} } as any);
    const inbox = new InboxController(db, {} as any, {} as any, {} as any, { emit() {} } as any);
    const req: any = { user: { tenantId: tenant, userId: user } };
    await t.test(
      'system action configuration is versioned, tenant isolated and executes opt-out and handoff',
      async () => {
        const { SystemActionsController } = await import('../flows/system-actions.controller');
        const { FlowRuntimeService } = await import('../flows/flow-runtime.service');
        const flow = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          version = '99999999-9999-4999-8999-999999999999';
        await pg.query(
          "INSERT INTO flows(id,tenant_id,name,status,published_version_id,is_component) VALUES($1,$2,'Action','published',$3,true)",
          [flow, tenant, version],
        );
        await pg.query(
          'INSERT INTO flow_versions(id,tenant_id,graph,channel_ids) VALUES($1,$2,$3,$4)',
          [version, tenant, JSON.stringify({ startNodeId: 'start', nodes: [] }), [account]],
        );
        const controller = new SystemActionsController(db, {} as any);
        const { validateGraph } = await import('../flows/engine/validate');
        const { SYSTEM_ACTION_KEYS } = await import('../flows/system-actions');
        let draftCount = 0;
        const draftController = new SystemActionsController(db, {
          create: async (_tenant: string, _user: string, input: any) => {
            assert.equal(input.isComponent, true);
            assert.deepEqual(input.channelIds, [account]);
            return { id: flow, updated_at: new Date('2026-01-01') };
          },
          update: async (_tenant: string, _id: string, input: any) => {
            assert.deepEqual(validateGraph(input.graph).errors, []);
            assert.equal(
              input.triggers,
              undefined,
              'retain valid component trigger metadata for publishing',
            );
            draftCount++;
          },
        } as any);
        for (const key of SYSTEM_ACTION_KEYS)
          await draftController.draft(req, account, key, { language: 'ar' });
        assert.equal(draftCount, 7);

        const config = {
          revision: 0,
          actions: {
            unsubscribe: { enabled: true, flowId: flow, keywords: ['stop me'] },
            resubscribe: { enabled: true, flowId: flow, keywords: ['subscribe me'] },
            human: { enabled: true, flowId: flow, keywords: ['agent'] },
            bot: { enabled: true, flowId: flow, keywords: ['bot'] },
          },
        };
        assert.equal((await controller.save(req, account, config)).revision, 1);
        await assert.rejects(() => controller.save(req, account, config), /changed/);
        await assert.rejects(
          () => controller.get({ user: { tenantId: other } } as any, account),
          /not found/i,
        );
        const started: any[] = [];
        let assigned = 0;
        const runtime: any = new FlowRuntimeService(
          db,
          {} as any,
          {} as any,
          {} as any,
          {} as any,
          {
            autoAssignIfEnabled: async () => {
              assigned++;
            },
          } as any,
          {} as any,
          {} as any,
          {} as any,
          {} as any,
        );
        runtime.startFlow = async (_base: any, _ctx: any, candidate: any) => {
          started.push(candidate.flow_id);
        };
        const send = (text: string) =>
          runtime.onMessage({
            tenantId: tenant,
            conversationId: conversation,
            contactId: contact,
            channelId: account,
            messageId: version,
            content: { text },
          });
        await send('stop me');
        assert.equal(
          (
            await pg.query<{ status: string }>(
              'SELECT status FROM contact_consents WHERE contact_id=$1',
              [contact],
            )
          ).rows[0].status,
          'opted_out',
        );
        assert.equal(
          (
            await pg.query<{ status: string }>(
              'SELECT status FROM sequence_enrollments WHERE contact_id=$1',
              [contact],
            )
          ).rows[0].status,
          'stopped',
        );
        await send('subscribe me');
        assert.equal(
          (
            await pg.query<{ status: string }>(
              'SELECT status FROM contact_consents WHERE contact_id=$1',
              [contact],
            )
          ).rows[0].status,
          'opted_in',
        );
        await send('agent');
        assert.equal(assigned, 1);
        assert.equal(
          (
            await pg.query<{ handled_by: string }>(
              'SELECT handled_by FROM conversations WHERE id=$1',
              [conversation],
            )
          ).rows[0].handled_by,
          'human',
        );
        await send('stop me');
        assert.equal(started.length, 3, 'human handling ignores unrelated system actions');
        await send('bot');
        assert.equal(started.length, 4);
        assert.equal(
          (
            await pg.query<{ handled_by: string }>(
              'SELECT handled_by FROM conversations WHERE id=$1',
              [conversation],
            )
          ).rows[0].handled_by,
          'bot',
        );
        await pg.query("UPDATE sequence_enrollments SET status='active' WHERE contact_id=$1", [
          contact,
        ]);
        const nextConfig = {
          revision: 1,
          actions: {
            get_started: { enabled: true, flowId: flow, keywords: [] },
            no_match: { enabled: true, flowId: flow, keywords: [] },
            location_reply: { enabled: true, flowId: flow, keywords: [] },
          },
        };
        await controller.save(req, account, nextConfig);
        await send('hello');
        assert.equal(started.length, 5, 'get started runs for first inbound');
        await pg.query(
          "INSERT INTO messages(tenant_id,conversation_id,direction) VALUES($1,$2,'in'),($1,$2,'in')",
          [tenant, conversation],
        );
        await send('unmatched');
        assert.equal(started.length, 6, 'no match runs after first message');
        await runtime.onMessage({
          tenantId: tenant,
          conversationId: conversation,
          contactId: contact,
          channelId: account,
          messageId: version,
          content: { location: { latitude: 30, longitude: 31 } },
        });
        assert.equal(started.length, 7, 'location runs configured action');
        await pg.query("UPDATE channels SET settings='{}' WHERE id=$1", [account]);
      },
    );
    await t.test(
      'campaign pagination, literal search and delivered/read statistics query PostgreSQL',
      async () => {
        const first = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          second = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          foreign = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        await pg.query(
          "INSERT INTO campaigns(id,tenant_id,channel_id,name,status) VALUES($1,$2,$3,'Campaign_One','completed'),($4,$2,$3,'Campaign Two','draft'),($5,$6,$3,'Foreign','completed')",
          [first, tenant, account, second, foreign, other],
        );
        const message = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
        await pg.query(
          "INSERT INTO messages(id,tenant_id,conversation_id,channel_id,status,direction) VALUES($1,$2,$3,$4,'read','out')",
          [message, tenant, conversation, account],
        );
        await pg.query(
          "INSERT INTO campaign_recipients(tenant_id,campaign_id,contact_id,message_id,status) VALUES($1,$2,$3,$4,'queued'),($1,$2,$3,NULL,'failed')",
          [tenant, first, contact, message],
        );
        const controller = new CampaignsController(db, {} as any);
        const summary = await controller.summary(req, { channelId: account });
        assert.equal(summary.total, 2);
        assert.equal(summary.completed, 1);
        assert.equal(summary.delivered, 1);
        assert.equal(summary.read, 1);
        assert.equal(summary.readRate, 100);
        assert.equal(summary.failed, 1);
        const one: any = await controller.list(req, { paginated: 'true', limit: 1, page: 1 });
        assert.equal(one.total, 2);
        assert.equal(one.items.length, 1);
        const next: any = await controller.list(req, { paginated: 'true', limit: 1, page: 2 });
        assert.notEqual(one.items[0].id, next.items[0].id);
        const literal: any = await controller.list(req, { paginated: 'true', q: '_' });
        assert.equal(literal.total, 1);
        assert.equal(literal.items[0].name, 'Campaign_One');
        const legacy = await controller.list(req, {});
        assert.ok(Array.isArray(legacy));
        assert.equal(legacy.length, 2);
      },
    );
    await t.test('summary uses current filters and excludes another tenant', async () => {
      assert.deepEqual(await crm.summary(tenant, filtersSchema.parse({ channelId: account })), {
        total: 1,
        retained: 1,
        subscribed: 1,
        in_sequences: 1,
      });
      assert.equal((await crm.summary(tenant, filtersSchema.parse({ q: 'Foreign' }))).total, 0);
      const result = await crm.list(tenant, filtersSchema.parse({}), 1, 10, 'name');
      assert.equal(result.total, 1);
      assert.equal(result.items[0].name, 'Alice');
      const fallback = await crm.list(
        tenant,
        filtersSchema.parse({}),
        1,
        10,
        'name; DROP TABLE contacts',
      );
      assert.equal(fallback.total, 1);
    });
    await t.test(
      'profile updates preserve untouched attributes, reject stale saves and foreign IDs',
      async () => {
        const before = await crm.profile(tenant, contact);
        const updated = await crm.patchProfile(tenant, contact, {
          tags: ['updated'],
          attributes: { new: 'field' },
          expectedUpdatedAt: new Date(before.contact.updated_at).toISOString(),
        });
        assert.deepEqual(updated.contact.tags, ['updated']);
        assert.deepEqual(updated.contact.attributes, { kept: 'value', new: 'field' });
        assert.equal(updated.sequences.length, 1);
        await assert.rejects(
          crm.patchProfile(tenant, contact, {
            name: 'Lost write',
            expectedUpdatedAt: new Date(before.contact.updated_at).toISOString(),
          }),
          /changed/,
        );
        await assert.rejects(crm.profile(tenant, foreignContact), /not found/);
      },
    );
    await t.test(
      'important and archived views and account counts use real persisted flags',
      async () => {
        await inbox.update(req, conversation, { important: true });
        assert.equal((await inbox.list(req, { view: 'important' })).items.length, 1);
        await inbox.update(req, conversation, { archived: true });
        assert.equal((await inbox.list(req, {})).items.length, 0);
        assert.equal((await inbox.list(req, { view: 'archived' })).items.length, 1);
        const counts = await inbox.counts(req, { channelId: account });
        assert.equal(counts.archived, 1);
        assert.equal(counts.active, 0);
        await inbox.update(req, conversation, { archived: false });
        assert.equal((await inbox.counts(req, {})).important, 1);
      },
    );
    await t.test(
      'account blocking expires waiting sessions and prevents queued provider delivery',
      async () => {
        await pg.query(
          "INSERT INTO flow_sessions(tenant_id,conversation_id,status) VALUES($1,$2,'waiting')",
          [tenant, conversation],
        );
        await inbox.update(req, conversation, { blocked: true });
        assert.equal((await inbox.list(req, { view: 'blocked' })).items.length, 1);
        assert.equal((await inbox.list(req, {})).items.length, 0);
        assert.equal(
          (
            await pg.query<any>('SELECT status FROM flow_sessions WHERE conversation_id=$1', [
              conversation,
            ])
          ).rows[0].status,
          'expired',
        );
        const message = '99999999-9999-4999-8999-999999999999',
          job = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        await pg.query(
          "INSERT INTO messages(id,tenant_id,conversation_id,channel_id,status,direction) VALUES($1,$2,$3,$4,'queued','out')",
          [message, tenant, conversation, account],
        );
        await pg.query(
          "INSERT INTO outbound_jobs(id,tenant_id,message_id,status) VALUES($1,$2,$3,'pending')",
          [job, tenant, message],
        );
        let sends = 0;
        db.query = async () => ({ rows: [{ id: job, tenant_id: tenant }] });
        const adapter = {
          send: async () => {
            sends++;
            return { externalId: 'unexpected' };
          },
        };
        await new OutboundService(
          db,
          {} as any,
          {} as any,
          adapter as any,
          adapter as any,
          adapter as any,
        ).tick();
        assert.equal(sends, 0);
        assert.equal(
          (await pg.query<any>('SELECT error FROM messages WHERE id=$1', [message])).rows[0].error,
          'RECIPIENT_BLOCKED',
        );
        await inbox.update(req, conversation, { blocked: false });
        assert.equal((await inbox.list(req, { view: 'blocked' })).items.length, 0);
        assert.equal((await inbox.list(req, {})).items.length, 1);
      },
    );
  } finally {
    await pg.close();
  }
});
