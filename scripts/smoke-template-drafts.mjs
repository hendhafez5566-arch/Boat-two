/* global Response */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js');
const { TemplatesController } = local('./dist/messaging/templates.controller.js');
const { env } = local('./dist/config/env.js');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function call(path, token, method = 'GET', body, status = 200) {
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
  const register = () =>
    call(
      '/auth/register',
      null,
      'POST',
      {
        email: `draft-${randomUUID()}@example.test`,
        password: randomUUID() + randomUUID(),
        fullName: 'Draft fixture',
        workspaceName: 'Draft fixture',
      },
      201,
    );
  const a = await register(),
    b = await register();
  const channel = await db.withTenant(
    a.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO channels(tenant_id,type,name,external_id,settings) VALUES($1,'whatsapp','Local draft fixture',$2,'{}') RETURNING id",
          [a.tenantId, randomUUID()],
        )
      ).rows[0],
  );
  const path = `/channels/${channel.id}/templates`;
  const draft = {
    name: 'rich_order',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}',
    examples: ['Ada'],
    header: {
      type: 'HEADER',
      format: 'DOCUMENT',
      example: { header_handle: ['local-provider-handle'] },
    },
    footer: 'Local fixture',
    buttons: [
      {
        type: 'URL',
        text: 'View',
        url: 'https://example.test/order/{{1}}',
        example: ['https://example.test/order/12'],
      },
    ],
  };
  const created = await call(path, a.accessToken, 'POST', draft, 201);
  assert.equal(created.components[0].format, 'DOCUMENT');
  const changed = await call(path + '/' + created.id, a.accessToken, 'PATCH', {
    revision: created.revision,
    draft: { ...draft, footer: 'Edited footer' },
  });
  assert.equal(changed.revision, created.revision + 1);
  await call(
    path + '/' + created.id,
    a.accessToken,
    'PATCH',
    { revision: created.revision, draft },
    409,
  );
  await call(
    path + '/' + created.id,
    b.accessToken,
    'PATCH',
    { revision: changed.revision, draft },
    404,
  );
  await call(path, a.accessToken, 'POST', { ...draft, name: 'bad_order', examples: [] }, 400);
  await call(path + '/' + created.id + '/submit', a.accessToken, 'POST', undefined, 503);
  const ctl = new TemplatesController(db, {
    credentials: () => ({ wabaId: '123', accessToken: 'local-only' }),
  });
  const request = { user: { tenantId: a.tenantId } },
    before = globalThis.fetch,
    gate = env.EXTERNAL_DELIVERY_ENABLED;
  let calls = 0,
    captured;
  try {
    env.EXTERNAL_DELIVERY_ENABLED = 'true';
    globalThis.fetch = async (_url, init) => {
      calls++;
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'mock-provider-template' }), { status: 200 });
    };
    await ctl.submit(request, channel.id, created.id);
    assert.deepEqual(captured.components, changed.components);
    await assert.rejects(() => ctl.submit(request, channel.id, created.id));
    assert.equal(calls, 1);
    const uncertain = await ctl.create(request, channel.id, { ...draft, name: 'uncertain_order' });
    globalThis.fetch = async () => {
      calls++;
      throw new Error('Local simulated timeout');
    };
    await assert.rejects(() => ctl.submit(request, channel.id, uncertain.id));
    await assert.rejects(() => ctl.submit(request, channel.id, uncertain.id));
    assert.equal(calls, 2);
    const row = await db.withTenant(
      a.tenantId,
      async (c) =>
        (await c.query('SELECT status FROM whatsapp_templates WHERE id=$1', [uncertain.id]))
          .rows[0],
    );
    assert.equal(row.status, 'SUBMISSION_UNKNOWN');
    const raced = await ctl.create(request, channel.id, { ...draft, name: 'raced_order' });
    globalThis.fetch = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify({ id: 'mock-raced' }), { status: 200 });
    };
    const race = await Promise.allSettled([
      ctl.submit(request, channel.id, raced.id),
      ctl.submit(request, channel.id, raced.id),
    ]);
    assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = before;
    env.EXTERNAL_DELIVERY_ENABLED = gate;
  }
  await call(
    path + '/' + created.id,
    a.accessToken,
    'PATCH',
    { revision: changed.revision, draft },
    409,
  );
  console.log(
    'Template drafts: rich create/edit, revision/tenant/gate checks, exact mocked submission, concurrent claim and ambiguous no-retry passed. No external requests.',
  );
} finally {
  await db.onModuleDestroy();
}
