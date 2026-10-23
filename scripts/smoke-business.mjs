import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { ExternalEffects } = require('./dist/events/external-effect.js');
const db = new DatabaseService(),
  effects = new ExternalEffects(db);
const base = process.env.SMOKE_API_URL || 'http://localhost:4000';
async function req(path, { token, method = 'GET', body, status = 200 } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  assert.equal(r.status, status, `${method} ${path} unexpected status (${d.message || ''})`);
  return d;
}
async function post(path, token, body, status = 201) {
  return req(path, { token, method: 'POST', body, status });
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Expected worker state not reached');
}
async function register() {
  return post('/auth/register', null, {
    email: `business-${randomBytes(8).toString('hex')}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Business smoke',
    workspaceName: 'Business smoke',
  });
}
try {
  const a = await register(),
    b = await register(),
    token = a.accessToken;
  await post('/crm/fields', token, { key: 'score', label: 'Score', type: 'number' });
  await post('/automations', token, {
    name: 'Qualify new customer',
    enabled: true,
    trigger: 'crm.contacts.insert',
    conditions: {},
    actions: [
      { type: 'tag', tag: 'new-lead' },
      { type: 'task', title: 'Follow up', delayMinutes: 60 },
      {
        type: 'delay',
        delayMinutes: 1,
        actions: [{ type: 'note', text: 'Deferred follow-up fixture' }],
      },
    ],
  });
  const contact = await post('/crm/contacts', token, {
    name: 'Real local fixture',
    email: 'fixture-' + randomUUID() + '@example.test',
    attributes: { score: 5 },
  });
  await waitFor(async () => {
    const c = await req('/crm/contacts/' + contact.id, { token });
    return c.tags.includes('new-lead');
  });
  const timeline = await req(`/crm/contacts/${contact.id}/timeline`, { token });
  assert.equal(timeline.tasks.length, 1);
  // Advance only this local fixture's scheduled event; production code keeps the real schedule.
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "UPDATE domain_events SET available_at=now() WHERE type='automation.followup' AND payload->>'contactId'=$1 AND status='pending'",
      [contact.id],
    ),
  );
  await waitFor(async () => {
    const t = await req(`/crm/contacts/${contact.id}/timeline`, { token });
    return t.notes.some((n) => n.body === 'Deferred follow-up fixture');
  });
  await req('/crm/contacts/' + contact.id, { token: b.accessToken, status: 404 });
  await post('/crm/contacts', token, { name: 'Duplicate', email: contact.email }, 409);
  await post(
    '/crm/contacts',
    token,
    { name: 'Wrong field type', attributes: { score: 'wrong' } },
    400,
  );
  await post(
    '/crm/contacts/import',
    token,
    {
      contacts: [
        { name: 'Should roll back', email: 'rollback-' + randomUUID() + '@example.test' },
        { name: 'Duplicate import', email: contact.email },
      ],
    },
    409,
  );
  assert.equal((await req('/crm/contacts?q=Should%20roll%20back', { token })).total, 0);
  const pipeline = await post('/crm/pipelines', token, {
    name: 'Sales',
    stages: ['New', 'Offer', 'Won'],
  });
  const deal = await post('/crm/deals', token, {
    contactId: contact.id,
    pipelineId: pipeline.id,
    title: 'Local deal',
    stage: 'New',
    valueCents: 12500,
  });
  await req('/crm/deals/' + deal.id, {
    token,
    method: 'PATCH',
    body: { stage: 'Won', status: 'won' },
  });
  await post(
    '/crm/deals',
    b.accessToken,
    {
      contactId: contact.id,
      pipelineId: pipeline.id,
      title: 'Cross tenant',
      stage: 'New',
      valueCents: 1,
    },
    404,
  );
  await post('/crm/contacts/bulk', token, {
    ids: [contact.id],
    lifecycle: 'customer',
    addTags: ['bulk-fixture'],
  });
  assert.equal((await req('/crm/contacts/' + contact.id, { token })).lifecycle, 'customer');
  assert.ok((await req('/crm/contacts/' + contact.id, { token })).tags.includes('bulk-fixture'));
  await post(
    '/crm/contacts/bulk',
    token,
    { ids: [contact.id, randomUUID()], lifecycle: 'inactive' },
    404,
  );
  assert.equal((await req('/crm/contacts/' + contact.id, { token })).lifecycle, 'customer');
  await post(
    '/crm/contacts/bulk',
    b.accessToken,
    { ids: [contact.id], lifecycle: 'inactive' },
    404,
  );
  const revisedPipeline = { name: 'Sales revised', stages: ['New', 'Qualified'] };
  await req('/crm/pipelines/' + pipeline.id, {
    token,
    method: 'PATCH',
    body: revisedPipeline,
    status: 400,
  });
  assert.deepEqual(
    (await req('/crm/pipelines', { token })).find((p) => p.id === pipeline.id).stages,
    ['New', 'Offer', 'Won'],
  );
  await req('/crm/pipelines/' + pipeline.id, {
    token: b.accessToken,
    method: 'PATCH',
    body: revisedPipeline,
    status: 404,
  });
  await req('/crm/pipelines/' + pipeline.id, {
    token,
    method: 'PATCH',
    body: { ...revisedPipeline, replacements: { Won: 'Qualified' } },
  });
  assert.equal(
    (await req('/crm/deals', { token })).items.find((d) => d.id === deal.id).stage,
    'Qualified',
  );
  await req('/crm/pipelines/' + pipeline.id, { token, method: 'DELETE', status: 400 });
  const emptyPipeline = await post('/crm/pipelines', token, {
    name: 'Disposable',
    stages: ['A', 'B'],
  });
  await req('/crm/pipelines/' + emptyPipeline.id, { token, method: 'DELETE' });
  const channel = await post('/channels', token, { type: 'web', name: 'Campaign local widget' });
  await req('/delivery/policies/' + channel.id, {
    token,
    method: 'PUT',
    body: { intervalMs: 100, marketingEnabled: true },
  });
  const visitor = await post(`/widget/${channel.external_id}/session`, null, {});
  const inbound = await fetch(
    `${base}/widget/${channel.external_id}/messages?visitorId=${visitor.visitorId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
      body: JSON.stringify({ clientMsgId: randomUUID(), text: 'hello' }),
    },
  );
  assert.equal(inbound.status, 201);
  const conv = (await req('/conversations?channelId=' + channel.id, { token })).items[0];
  await req(`/crm/contacts/${conv.contact_id}/consent`, {
    token,
    method: 'PUT',
    body: {
      channelId: channel.id,
      status: 'opted_in',
      evidence: 'Local integration fixture: explicit opt-in',
    },
  });
  const campaign = await post('/campaigns', token, {
    name: 'Consented local campaign',
    channelId: channel.id,
    content: { text: 'Local campaign message' },
    filters: {},
  });
  const audience = await post('/campaigns/audience', token, { channelId: channel.id, filters: {} });
  assert.equal(audience.eligible, 1);
  await post(`/campaigns/${campaign.id}/schedule`, token, { at: new Date().toISOString() });
  await waitFor(async () => {
    const ledger = await req(`/campaigns/${campaign.id}/recipients`, { token });
    return ledger.items[0]?.status === 'queued';
  });
  const ledger = await req(`/campaigns/${campaign.id}/recipients`, { token });
  assert.equal(ledger.items[0].delivery_status, 'sent');
  const second = await post('/campaigns', token, {
    name: 'Frequency cap fixture',
    channelId: channel.id,
    content: { text: 'Should not send' },
    filters: {},
  });
  await post(`/campaigns/${second.id}/schedule`, token, { at: new Date().toISOString() });
  await waitFor(async () => {
    const r = await req(`/campaigns/${second.id}/recipients`, { token });
    return r.items[0]?.status === 'skipped';
  });
  await req(`/campaigns/${campaign.id}/recipients`, { token: b.accessToken, status: 404 });
  // Exercise the manual ambiguity workflow with an isolated local message fixture.
  const ambiguous = await db.withTenant(a.tenantId, async (c) => {
    await c.query("UPDATE messages SET status='queued' WHERE id=$1", [ledger.items[0].message_id]);
    return (
      await c.query(
        "INSERT INTO outbound_jobs(tenant_id,message_id,status) VALUES($1,$2,'ambiguous') RETURNING id",
        [a.tenantId, ledger.items[0].message_id],
      )
    ).rows[0];
  });
  await post(`/delivery/${ambiguous.id}/retry`, token, undefined, 400);
  await post(`/delivery/${ambiguous.id}/reconcile`, token, {
    result: 'failed',
    evidence: 'Local fixture: provider confirmed no send',
  });
  await post(`/delivery/${ambiguous.id}/retry`, token);
  const department = await post('/departments', token, {
    name: 'Support',
    slaMinutes: 30,
    members: [],
  });
  await req('/conversations/' + conv.id, {
    token,
    method: 'PATCH',
    body: { departmentId: department.id },
  });
  assert.equal((await req('/conversations/' + conv.id, { token })).sla_minutes, 30);
  const provider = await post('/agents/providers', token, {
    name: 'Local disabled provider fixture',
    kind: 'anthropic',
    model: 'fixture-only',
    apiKey: 'test-fixture-no-real-provider-key',
    enabled: false,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  });
  assert.equal(provider.enabled, false);
  assert.ok(!('credentials_enc' in provider));
  const agent = await post('/agents', token, {
    name: 'Local agent',
    instructions: 'Use workspace knowledge',
    sourceIds: [],
    providerId: provider.id,
    allowedTools: ['handoff_to_human', 'create_followup'],
    isDefault: true,
    enabled: true,
  });
  assert.equal((await req('/agents', { token })).agents[0].id, agent.id);
  await post('/channels/meta/start', token, { kind: 'facebook' }, 503);
  const wa = await post('/channels', token, {
    type: 'whatsapp',
    name: 'Blocked local provider fixture',
    credentials: {
      phoneNumberId: randomBytes(8).toString('hex'),
      accessToken: 'local-test-only-no-provider-calls',
    },
  });
  await post(`/channels/${wa.id}/templates`, token, {
    name: 'local_notice',
    language: 'ar',
    category: 'UTILITY',
    body: 'Hi {{1}}',
    examples: ['Customer'],
  });
  await post(`/channels/${wa.id}/templates/sync`, token, undefined, 503);
  await req('/channels/' + wa.id + '/templates', { token: b.accessToken, status: 404 });
  // A committed external-effect result survives rollback of the owning event transaction.
  const event = randomUUID();
  let calls = 0;
  await assert.rejects(
    db.withTenant(a.tenantId, () =>
      db.eventScope(event, async () => {
        await effects.execute(a.tenantId, { operation: 'test' }, async () => {
          calls++;
          return { ok: true };
        });
        throw new Error('Intentional rollback');
      }),
    ),
    /Intentional/,
  );
  const cached = await db.withTenant(a.tenantId, () =>
    db.eventScope(event, () =>
      effects.execute(a.tenantId, { operation: 'test' }, async () => {
        calls++;
        return { ok: false };
      }),
    ),
  );
  assert.deepEqual(cached, { ok: true });
  assert.equal(calls, 1);
  const uncertain = randomUUID();
  await assert.rejects(
    db.withTenant(a.tenantId, () =>
      db.eventScope(uncertain, () =>
        effects.execute(a.tenantId, { operation: 'uncertain' }, async () => {
          throw new Error('Unknown provider result');
        }),
      ),
    ),
  );
  await assert.rejects(
    db.withTenant(a.tenantId, () =>
      db.eventScope(uncertain, () =>
        effects.execute(a.tenantId, { operation: 'uncertain' }, async () => {
          throw new Error('Must not call again');
        }),
      ),
    ),
    /ambiguous/,
  );
  console.log(
    'PASS business smoke: CRM fields/duplicates/import rollback, pipeline, automations, consent campaign, frequency caps, departments/SLA, agents, Meta/template gates, tenant isolation, delayed follow-ups, audited delivery reconciliation, durable external effect cache and ambiguous replay refusal.',
  );
} finally {
  await db.onModuleDestroy();
}
