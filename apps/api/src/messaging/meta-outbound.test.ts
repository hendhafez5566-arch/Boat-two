/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test';
import assert from 'node:assert/strict';

test('Graph errors expose safe codes and invalidate only the WhatsApp token actually used', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'true',
  });
  const { graphPost, ProviderError } = await import('./adapters/adapter');
  const { OutboundService } = await import('./outbound.service');
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: 190, message: 'SYNTHETIC_PRIVATE_TOKEN_AND_RECIPIENT' } },
      { status: 400 },
    );
  try {
    await assert.rejects(
      graphPost('https://graph.facebook.com/v21.0/600/messages', 'synthetic-token', {}),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.providerCode, 190);
        assert.match(error.message, /authentication.*#190/);
        assert.ok(!error.message.includes('SYNTHETIC'));
        return true;
      },
    );
    const writes: { sql: string; params: unknown[] }[] = [];
    const now = new Date();
    const message = {
      id: 'message',
      channel_id: 'channel',
      conversation_id: 'conversation',
      credentials_enc: 'ciphertext-lease',
      channel_type: 'whatsapp',
      channel_status: 'active',
      content: { text: 'Synthetic QA' },
      last_inbound_at: now,
      created_at: now,
      sender_type: 'bot',
      flow_id: 'flow',
    };
    const db = {
      query: async () => ({ rows: [{ id: 'job', tenant_id: 'tenant' }] }),
      withTenant: async (tenant: string, fn: (c: any) => unknown) => {
        assert.equal(tenant, 'tenant');
        return fn({
          query: async (sql: string, params: unknown[] = []) => {
            if (sql.startsWith('SELECT * FROM outbound_jobs'))
              return {
                rows: [{ id: 'job', message_id: 'message', status: 'pending', attempts: 0 }],
              };
            if (sql.startsWith('SELECT m.*')) return { rows: [message] };
            if (sql.includes('FROM campaign_recipients')) return { rows: [] };
            if (sql.startsWith('UPDATE ')) {
              writes.push({ sql, params });
              return { rowCount: 1, rows: [] };
            }
            throw new Error('Unexpected query in outbound test');
          },
        });
      },
    };
    let sends = 0;
    const adapter = {
      send: async () => {
        sends++;
        throw new ProviderError('Meta authentication error (#190)', 400, 190);
      },
    };
    const worker = new OutboundService(
      db as never,
      { take: async () => ({ allowed: true }) } as never,
      { credentials: () => ({}) } as never,
      adapter as never,
      {} as never,
      {} as never,
    );
    await worker.tick();
    assert.equal(sends, 1);
    const authWrite = writes.find((w) => w.sql.includes('metaAuthorization'))!;
    assert.ok(authWrite.sql.includes('credentials_enc IS NOT DISTINCT FROM $3'));
    assert.deepEqual([authWrite.params[0], authWrite.params[2]], ['channel', 'ciphertext-lease']);
    assert.equal(JSON.parse(String(authWrite.params[1])).status, 'invalid_token');
    const failed = writes.find((w) => w.sql.includes('outbound_jobs SET status=$2'))!;
    assert.equal(failed.params[1], 'failed');
    assert.ok(!writes.some((w) => w.sql.includes("status='pending'")));
  } finally {
    globalThis.fetch = original;
  }
});


test('scoped agent preview send reaches WhatsApp while other chats fail visibly with global delivery off', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
  });
  const { env } = await import('../config/env');
  const { OutboundService } = await import('./outbound.service');
  const oldFlag = env.EXTERNAL_DELIVERY_ENABLED;
  const keys = ['BOAT_PREVIEW_ONLY', 'WHATSAPP_PREVIEW_BOT_ENABLED',
    'WHATSAPP_PREVIEW_BOT_CHANNEL_ID', 'WHATSAPP_PREVIEW_BOT_CONVERSATION_ID',
    'WHATSAPP_PREVIEW_BOT_AFTER'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  env.EXTERNAL_DELIVERY_ENABLED = 'false';
  Object.assign(process.env, {
    BOAT_PREVIEW_ONLY: 'true',
    WHATSAPP_PREVIEW_BOT_ENABLED: 'true',
    WHATSAPP_PREVIEW_BOT_CHANNEL_ID: 'synthetic-channel',
    WHATSAPP_PREVIEW_BOT_CONVERSATION_ID: 'own-qa-conversation',
    WHATSAPP_PREVIEW_BOT_AFTER: new Date(Date.now() - 60_000).toISOString(),
  });
  try {
    const execute = async (conversationId: string) => {
      const writes: { sql: string; params: unknown[] }[] = [];
      const events: Array<{ type: string; payload: any }> = [];
      let sends = 0;
      const now = new Date();
      const message = {
        id: 'synthetic-message',
        conversation_id: conversationId,
        channel_id: 'synthetic-channel',
        channel_type: 'whatsapp',
        channel_status: 'active',
        created_at: now,
        last_inbound_at: now,
        sender_type: 'agent',
        flow_id: null,
        content: { text: 'QA ONLY' },
      };
      const db = {
        query: async () => ({ rows: [{ id: 'synthetic-job', tenant_id: 'synthetic-tenant' }] }),
        withTenant: async (_tenant: string, fn: (db: any) => unknown) => fn({
          query: async (sql: string, params: unknown[] = []) => {
            if (sql.startsWith('SELECT * FROM outbound_jobs')) return {
              rows: [{ id: 'synthetic-job', message_id: 'synthetic-message', status: 'pending', attempts: 0 }],
            };
            if (sql.startsWith('SELECT m.*')) return { rows: [message] };
            if (sql.includes('FROM campaign_recipients')) return { rows: [] };
            if (sql.startsWith('UPDATE ')) {
              writes.push({ sql, params });
              return { rowCount: 1, rows: [] };
            }
            throw new Error('Unexpected statement: ' + sql);
          },
        }),
      };
      const adapter = { send: async () => {
        sends++;
        return { externalId: 'synthetic-meta-id' };
      } };
      const worker = new OutboundService(
        db as never,
        { take: async () => ({ allowed: true }) } as never,
        { credentials: () => ({}) } as never,
        adapter as never,
        {} as never,
        {} as never,
        { emit: (type: string, payload: unknown) => events.push({ type, payload }) } as never,
      );
      await worker.tick();
      return { writes, events, sends };
    };
    const own = await execute('own-qa-conversation');
    assert.equal(own.sends, 1);
    assert.ok(own.writes.some((x) => x.sql.includes("messages SET status='sent'")));
    assert.ok(own.events.some((x) => x.type === 'message.status' && x.payload.status === 'sent'));
    const other = await execute('different-customer');
    assert.equal(other.sends, 0);
    assert.ok(other.writes.some((x) => x.sql.includes("outbound_jobs SET status='blocked'")));
    assert.ok(other.writes.some((x) => x.sql.includes("messages SET status='failed'") && x.params[1] === 'EXTERNAL_DELIVERY_DISABLED'));
    assert.ok(other.events.some((x) => x.type === 'message.status' && x.payload.status === 'failed'));
  } finally {
    env.EXTERNAL_DELIVERY_ENABLED = oldFlag;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
