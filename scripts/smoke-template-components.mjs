/* global Response */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js'),
  { TemplatesController } = local('./dist/messaging/templates.controller.js'),
  { env } = local('./dist/config/env.js');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function call(path, body, token, status = 201, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
try {
  const a = await call('/auth/register', {
    email: `template-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Template fixture',
    workspaceName: 'Template component acceptance',
  });
  const wa = await db.withTenant(
    a.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO channels(tenant_id,type,name,external_id,settings) VALUES($1,'whatsapp','Local component fixture',$2,'{}') RETURNING id",
          [a.tenantId, randomUUID()],
        )
      ).rows[0],
  );
  const definitions = [
    { type: 'HEADER', format: 'DOCUMENT' },
    { type: 'BODY', text: 'Hello {{1}}' },
    { type: 'FOOTER', text: 'Local test' },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+1234567890' },
        { type: 'URL', text: 'Order', url: 'https://example.test/order/{{1}}' },
        { type: 'QUICK_REPLY', text: 'Confirm' },
      ],
    },
  ];
  // Synchronization uses the real controller and PostgreSQL but no external request.
  const controller = new TemplatesController(db, {
      credentials: () => ({ wabaId: '123', accessToken: 'local' }),
    }),
    request = { user: { tenantId: a.tenantId } };
  const before = globalThis.fetch,
    gate = env.EXTERNAL_DELIVERY_ENABLED;
  try {
    env.EXTERNAL_DELIVERY_ENABLED = 'true';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'local-doc',
              name: 'local_document',
              language: 'en',
              category: 'UTILITY',
              status: 'APPROVED',
              components: definitions,
            },
            {
              id: 'local-otp',
              name: 'local_otp',
              language: 'en',
              category: 'AUTHENTICATION',
              status: 'APPROVED',
              components: [{ type: 'BODY', text: 'Code {{1}}' }],
            },
          ],
        }),
        { status: 200 },
      );
    assert.equal((await controller.sync(request, wa.id)).synced, 2);
  } finally {
    globalThis.fetch = before;
    env.EXTERNAL_DELIVERY_ENABLED = gate;
  }
  const rows = await call(`/channels/${wa.id}/templates`, undefined, a.accessToken, 200);
  assert.deepEqual(rows.find((r) => r.name === 'local_document').components, definitions);
  assert.equal(rows.find((r) => r.name === 'local_otp').supported, false);
  const template = {
    name: 'local_document',
    language: 'en',
    bodyParams: ['Ada'],
    header: { type: 'document', url: 'https://example.test/report.pdf', filename: 'report.pdf' },
    buttonParams: [
      { index: 1, type: 'url', value: '12' },
      { index: 2, type: 'quick_reply', value: 'confirm-12' },
    ],
  };
  const campaign = await call(
    '/campaigns',
    { name: 'Component fixture', channelId: wa.id, content: { template } },
    a.accessToken,
  );
  const cv = await db.withTenant(a.tenantId, async (c) => {
    const ct = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Local recipient') RETURNING id",
        [a.tenantId],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO contact_channels(tenant_id,contact_id,channel_id,external_id) VALUES($1,$2,$3,'1234567890')",
      [a.tenantId, ct.id, wa.id],
    );
    await c.query(
      "INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,'opted_in','Local fixture')",
      [a.tenantId, ct.id, wa.id],
    );
    return (
      await c.query(
        "INSERT INTO conversations(tenant_id,channel_id,contact_id,handled_by) VALUES($1,$2,$3,'human') RETURNING id",
        [a.tenantId, wa.id, ct.id],
      )
    ).rows[0];
  });
  await call(`/conversations/${cv.id}/messages`, { template }, a.accessToken);
  for (const bad of [
    { ...template, header: undefined },
    { ...template, header: { type: 'image', url: 'https://example.test/x' } },
    { ...template, buttonParams: [] },
    { ...template, header: { type: 'document', url: 'https://127.0.0.1/x' } },
    { ...template, name: 'local_otp' },
  ]) {
    await call(
      '/campaigns',
      { name: 'Rejected component', channelId: wa.id, content: { template: bad } },
      a.accessToken,
      400,
    );
    await call(`/conversations/${cv.id}/messages`, { template: bad }, a.accessToken, 400);
  }
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE whatsapp_templates SET status='REJECTED' WHERE name='local_document'"),
  );
  await call(
    `/campaigns/${campaign.id}/schedule`,
    { at: new Date(Date.now() + 3600000).toISOString() },
    a.accessToken,
    400,
  );
  await call(`/conversations/${cv.id}/messages`, { template }, a.accessToken, 400);
  const { OutboundService } = local('./dist/messaging/outbound.service.js');
  const job = await db.withTenant(a.tenantId, async (c) => {
    const j = (
      await c.query(
        'SELECT j.id,j.message_id FROM outbound_jobs j JOIN messages m ON m.id=j.message_id WHERE m.conversation_id=$1',
        [cv.id],
      )
    ).rows[0];
    await c.query("UPDATE outbound_jobs SET status='pending',available_at=now() WHERE id=$1", [
      j.id,
    ]);
    return j;
  });
  let providerCalls = 0;
  const worker = new OutboundService(
    {
      query: async () => ({ rows: [{ id: job.id, tenant_id: a.tenantId }] }),
      withTenant: db.withTenant.bind(db),
    },
    { take: async () => ({ allowed: true }) },
    { credentials: () => ({}) },
    {
      send: async () => {
        providerCalls++;
      },
    },
    {
      send: async () => {
        providerCalls++;
      },
    },
  );
  try {
    env.EXTERNAL_DELIVERY_ENABLED = 'true';
    await worker.tick();
  } finally {
    env.EXTERNAL_DELIVERY_ENABLED = gate;
  }
  assert.equal(providerCalls, 0);
  const failed = await db.withTenant(
    a.tenantId,
    async (c) =>
      (await c.query('SELECT status,error FROM messages WHERE id=$1', [job.message_id])).rows[0],
  );
  assert.equal(failed.error, 'TEMPLATE_DEFINITION_INVALID');
  assert.equal(failed.status, 'failed');
  const b = await call('/auth/register', {
    email: `template-other-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Other',
    workspaceName: 'Other template tenant',
  });
  await call(`/channels/${wa.id}/templates`, undefined, b.accessToken, 404);
  assert.equal(env.EXTERNAL_DELIVERY_ENABLED, 'false');
  console.log(
    'Template components: mocked sync preserves structure and rejects OTP; rich campaign and conversation parameters validated; rejection-after-create and tenant isolation passed. No provider calls.',
  );
} finally {
  await db.onModuleDestroy();
}
