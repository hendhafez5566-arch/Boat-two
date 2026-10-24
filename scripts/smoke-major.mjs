import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { PlansService } = require('./dist/plans/plans.service.js');
const { ExternalEffects } = require('./dist/events/external-effect.js');
const { EmbeddingBudget } = require('./dist/ai/knowledge/embedding-budget.js');
const { env } = require('./dist/config/env.js');
const { PlatformAccess } = require('./dist/platform/platform.module.js');
const { Reflector } = require('@nestjs/core');
const { totp } = require('./dist/platform/totp.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  effects = new ExternalEffects(db),
  budget = new EmbeddingBudget(db, plans, effects);
const base = process.env.SMOKE_API_URL || 'http://localhost:4113';
async function req(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${result.message || ''}`);
  return result;
}
const post = (path, token, body, status = 201) => req(path, token, 'POST', body, status);
async function register() {
  const password = randomBytes(20).toString('hex'),
    email = `major-${randomUUID()}@example.test`;
  return {
    ...(await post('/auth/register', null, {
      email,
      password,
      fullName: 'Local major fixture',
      workspaceName: 'Local major fixture',
    })),
    password,
    email,
  };
}
async function wait(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error('Expected durable worker state');
}
let access;
try {
  const a = await register(),
    b = await register(),
    token = a.accessToken;
  const source = await post('/ai/knowledge', token, {
    type: 'text',
    title: 'Durable local knowledge',
    content: 'Local support policies and opening hours. '.repeat(20),
  });
  await wait(async () =>
    (await req('/ai/knowledge-jobs', token)).jobs.some(
      (job) => job.source_id === source.id && job.status === 'blocked',
    ),
  );
  const jobs = await req('/ai/knowledge-jobs', token),
    job = jobs.jobs.find((job) => job.source_id === source.id);
  assert.ok(job.total > 0);
  assert.equal(Number(jobs.usage.charged), 0);
  assert.equal(Number(jobs.usage.reserved), 0);
  await post('/ai/knowledge-jobs/' + job.id + '/resume', b.accessToken, undefined, 404);
  await post('/ai/knowledge-jobs/' + job.id + '/resume', token);
  await wait(
    async () =>
      (await req('/ai/knowledge-jobs', token)).jobs.find((row) => row.id === job.id)?.status ===
      'blocked',
  );
  await post('/ai/knowledge-jobs/' + job.id + '/cancel', token);
  assert.equal(
    (await req('/ai/knowledge-jobs', token)).jobs.find((row) => row.id === job.id).status,
    'canceled',
  );
  const fileForm = new globalThis.FormData();
  fileForm.append(
    'file',
    new globalThis.Blob(['Durable file extraction fixture. '.repeat(30)], { type: 'text/plain' }),
    'fixture.txt',
  );
  const uploaded = await fetch(base + '/ai/knowledge/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fileForm,
  });
  assert.equal(uploaded.status, 201);
  const fileSource = await uploaded.json();
  await wait(async () =>
    (await req('/ai/knowledge-jobs', token)).jobs.some(
      (row) => row.source_id === fileSource.id && row.status === 'blocked',
    ),
  );
  const extracted = await db.withTenant(
    a.tenantId,
    async (c) =>
      (
        await c.query(
          'SELECT j.raw_file,s.content FROM knowledge_jobs j JOIN knowledge_sources s ON s.id=j.source_id WHERE j.source_id=$1',
          [fileSource.id],
        )
      ).rows[0],
  );
  assert.equal(extracted.raw_file, null);
  assert.ok(extracted.content.includes('Durable file extraction fixture'));
  const channel = await post('/channels', token, { type: 'web', name: 'Shared policy fixture' });
  assert.equal((await req('/delivery/policies', token))[0].marketing_enabled, false);
  await req('/delivery/policies/' + channel.id, token, 'PUT', {
    intervalMs: 100,
    marketingEnabled: true,
  });
  await req(
    '/delivery/policies/' + channel.id,
    b.accessToken,
    'PUT',
    { intervalMs: 100, marketingEnabled: true },
    404,
  );
  const visitor = await post(`/widget/${channel.external_id}/session`, null, {});
  let inbound = await fetch(
    `${base}/widget/${channel.external_id}/messages?visitorId=${visitor.visitorId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
      body: JSON.stringify({ clientMsgId: randomUUID(), text: 'STOP' }),
    },
  );
  assert.equal(inbound.status, 201);
  const contactId = (await req('/conversations', token)).items[0].contact_id;
  assert.equal(
    (await req('/crm/contacts/' + contactId + '/timeline', token)).consent[0].status,
    'opted_out',
  );
  const target = await post('/crm/contacts', token, { name: 'Preview target' }),
    preview = await req(`/crm/contacts/${target.id}/merge-preview?sourceId=${contactId}`, token);
  assert.equal(preview.canMerge, true);
  assert.equal(preview.counts.conversations, 1);
  await req(
    `/crm/contacts/${target.id}/merge-preview?sourceId=${contactId}`,
    b.accessToken,
    'GET',
    undefined,
    404,
  );
  const secret = await post('/integrations/secrets', token, {
    name: 'Local fixture secret',
    value: 'fixture-not-real-integration-token',
    allowedHosts: ['example.com'],
  });
  assert.ok(
    !JSON.stringify(await req('/integrations/secrets', token)).includes('fixture-not-real'),
  );
  await req('/integrations/secrets/' + secret.id, token, 'PATCH', {
    value: 'fixture-rotated-not-real-token',
  });
  assert.equal((await req('/integrations/secrets', token))[0].version, 2);
  await req('/integrations/secrets/' + secret.id, b.accessToken, 'PATCH', { enabled: false }, 404);
  const rule = await post('/automations', token, {
    name: 'Saved branch editing fixture',
    enabled: false,
    trigger: 'crm.contacts.update',
    conditions: { anyOf: [{ tag: 'one' }, { tag: 'two' }] },
    actions: [
      {
        type: 'branch',
        conditions: { lifecycle: 'lead' },
        then: [{ type: 'note', text: 'Yes fixture' }],
        otherwise: [{ type: 'task', title: 'No fixture', delayMinutes: 10 }],
      },
      { type: 'http', url: 'https://example.com/hook', secretId: secret.id, body: '{}' },
    ],
  });
  await req('/automations/' + rule.id, token, 'PATCH', {
    ...rule,
    name: 'Edited saved branch fixture',
    conditions: { allOf: [{ tag: 'one' }] },
    actions: [...rule.actions, { type: 'note', text: 'Appended fixture' }],
  });
  assert.equal(
    (await req('/automations', token)).find((row) => row.id === rule.id).actions.length,
    3,
  );
  const reconciliation = await post('/billing/reconciliations', token);
  await wait(
    async () =>
      (await req('/billing/reconciliations', token)).find((row) => row.id === reconciliation.id)
        ?.status === 'blocked',
  );
  const me = await req('/auth/me', token),
    userId = me.user.id;
  await req('/platform', token, 'GET', undefined, 403);
  await assert.rejects(() => db.query('SELECT platform_snapshot()'), /permission denied/);
  const platformUrl = new URL(process.env.DATABASE_ADMIN_URL);
  platformUrl.searchParams.set('options', '-c role=boat_platform');
  env.PLATFORM_DATABASE_URL = platformUrl.toString();
  env.PLATFORM_JWT_SECRET = randomBytes(32).toString('hex');
  env.PLATFORM_ADMIN_USER_IDS = userId;
  access = new PlatformAccess(db, new Reflector());
  const challenge = await access.login({ email: a.email, password: a.password });
  assert.equal(challenge.requiresEnrollment, true);
  const platformLogin = await access.enroll({
    setupToken: challenge.setupToken,
    otp: totp(challenge.secret, Math.floor(Date.now() / 30000)),
  });
  const contextFor = (jwt) => ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer ' + jwt } }) }),
  });
  await assert.rejects(() => access.canActivate(contextFor(token)), /invalid or expired/);
  assert.equal(await access.canActivate(contextFor(platformLogin.accessToken)), true);
  const snapshot = (await access.query('SELECT platform_snapshot() AS data'))[0].data;
  assert.ok(snapshot.companies.some((row) => row.id === a.tenantId));
  assert.equal(
    (await access.query("SELECT has_table_privilege(current_user,'plans','UPDATE') AS allowed"))[0]
      .allowed,
    false,
  );
  await access.query('SELECT platform_change_company($1,$2,$3,$4,$5)', [
    userId,
    b.tenantId,
    'Suspended local fixture',
    true,
    'Local fixture suspension check',
  ]);
  await req('/workspace', b.accessToken, 'GET', undefined, 403);
  await access.query('SELECT platform_change_company($1,$2,$3,$4,$5)', [
    userId,
    b.tenantId,
    'Restored local fixture',
    false,
    'Local fixture restoration check',
  ]);
  await req('/workspace', b.accessToken);
  const bUser = (await req('/auth/me', b.accessToken)).user.id;
  await access.query('SELECT platform_revoke_user($1,$2,$3)', [
    userId,
    bUser,
    'Local fixture session revocation',
  ]);
  await req('/workspace', b.accessToken, 'GET', undefined, 401);
  await post('/auth/refresh', null, { refreshToken: b.refreshToken }, 401);
  const sessions = await req('/auth/sessions', token);
  assert.ok(sessions.length > 0);
  await post('/auth/sessions/' + sessions[0].id + '/revoke', token);
  await req('/workspace', token, 'GET', undefined, 401);
  const { BillingService } = require('./dist/billing/billing.service.js');
  const oldStripe = env.STRIPE_SECRET_KEY,
    oldDelivery = env.EXTERNAL_DELIVERY_ENABLED;
  env.STRIPE_SECRET_KEY = 'sk_test_fixture_no_network';
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  try {
    const billing = new BillingService(db, effects),
      subscriptionId = 'sub_fixture_' + randomUUID(),
      customerId = 'cus_fixture_' + randomUUID();
    let retrieves = 0;
    await db.withTenant(b.tenantId, (c) =>
      c.query('UPDATE subscriptions SET stripe_subscription_id=$1,stripe_customer_id=$2', [
        subscriptionId,
        customerId,
      ]),
    );
    billing.stripe = {
      subscriptions: {
        retrieve: async () => {
          retrieves++;
          return {
            id: subscriptionId,
            customer: customerId,
            status: 'canceled',
            metadata: { tenantId: b.tenantId, planCode: 'pro' },
            items: { data: [] },
          };
        },
      },
    };
    const key = randomUUID();
    await db.eventScope('reconciliation-fixture:' + key, () => billing.reconcile(b.tenantId, key));
    await db.eventScope('reconciliation-fixture:' + key, () => billing.reconcile(b.tenantId, key));
    assert.equal(retrieves, 1);
    assert.equal(
      (
        await db.withTenant(
          b.tenantId,
          async (c) => (await c.query('SELECT status FROM subscriptions')).rows[0],
        )
      ).status,
      'canceled',
    );
  } finally {
    env.STRIPE_SECRET_KEY = oldStripe;
    env.EXTERNAL_DELIVERY_ENABLED = oldDelivery;
  }
  // Isolated test-process provider stubs only: no paid calls or environment activation.
  const originalFetch = globalThis.fetch,
    oldGate = env.AI_PROVIDER_CALLS_ENABLED,
    oldKey = env.EMBEDDING_API_KEY;
  env.AI_PROVIDER_CALLS_ENABLED = 'true';
  env.EMBEDDING_API_KEY = 'fixture-key-no-network';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const input = JSON.parse(options.body).input;
    return new globalThis.Response(
      JSON.stringify({
        data: input.map((_, index) => ({ index, embedding: Array(1536).fill(0.01) })),
      }),
    );
  };
  try {
    const { KnowledgeService } = require('./dist/ai/knowledge/knowledge.service.js');
    const { EventsService } = require('./dist/events/events.service.js');
    const { EventEmitter2 } = require('@nestjs/event-emitter');
    const knowledge = new KnowledgeService(
      db,
      plans,
      new EventsService(db, new EventEmitter2()),
      budget,
    );
    const indexing = await knowledge.reindex(a.tenantId, source.id);
    await db.withTenant(a.tenantId, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,41))', [source.id]);
      await c.query('SELECT id FROM knowledge_jobs WHERE id=$1 FOR UPDATE', [indexing.jobId]);
      await c.query("UPDATE knowledge_jobs SET status='pending' WHERE id=$1", [indexing.jobId]);
      await knowledge.process({ tenantId: a.tenantId, jobId: indexing.jobId });
    });
    const indexed = await knowledge.get(a.tenantId, source.id);
    assert.equal(indexed.status, 'ready');
    assert.ok(indexed.chunk_count > 0);
    const afterIndexCalls = calls;
    const key = 'local-budget-' + randomUUID();
    await budget.embed(a.tenantId, ['fixture'], key);
    await budget.embed(a.tenantId, ['fixture'], key);
    assert.equal(calls, afterIndexCalls + 1);
    await db.withTenant(a.tenantId, (c) =>
      c.query(
        "UPDATE embedding_usage SET charged=(SELECT (limits->>'embedding_token_budget')::bigint-10 FROM plans WHERE code='pro'),reserved=0 WHERE period=date_trunc('month',now())::date",
      ),
    );
    const concurrent = await Promise.allSettled([
      budget.embed(a.tenantId, ['12345678'], 'budget-a-' + randomUUID()),
      budget.embed(a.tenantId, ['abcdefgh'], 'budget-b-' + randomUUID()),
    ]);
    assert.equal(concurrent.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((row) => row.status === 'rejected').length, 1);
    const usage = await db.withTenant(
      a.tenantId,
      async (c) => (await c.query('SELECT charged,reserved FROM embedding_usage')).rows[0],
    );
    assert.equal(Number(usage.reserved), 0);
    assert.ok(Number(usage.charged) <= 5000000);
  } finally {
    globalThis.fetch = originalFetch;
    env.AI_PROVIDER_CALLS_ENABLED = oldGate;
    env.EMBEDDING_API_KEY = oldKey;
  }
  console.log(
    'PASS major sprint: durable gated knowledge jobs/resume/cancel; atomic embedding budget race and cached replay with mocked provider; shared channel policies; inbound opt-out; merge preview; secret encryption/rotation and saved branches; independent platform token/database boundary; tenant suspension; immediate access/refresh session revocation. No paid or delivery provider calls.',
  );
} finally {
  await access?.onModuleDestroy();
  await db.onModuleDestroy();
}
