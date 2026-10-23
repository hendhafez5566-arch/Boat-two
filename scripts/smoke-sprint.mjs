import { URLSearchParams } from 'node:url';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const db = new DatabaseService();
const base = process.env.SMOKE_API_URL || 'http://localhost:4110';
async function req(path, token, method = 'GET', body, status = 200) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json();
  assert.equal(res.status, status, `${method} ${path}: ${result.message || ''}`);
  return result;
}
const post = (path, token, body, status = 201) => req(path, token, 'POST', body, status);
async function register() {
  return post('/auth/register', null, {
    email: `sprint-${randomUUID()}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Local sprint fixture',
    workspaceName: 'Local sprint fixture',
  });
}
async function wait(check) {
  for (let i = 0; i < 120; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error('Worker condition timed out');
}
try {
  const a = await register(),
    b = await register(),
    token = a.accessToken;
  const target = await post('/crm/contacts', token, {
    name: 'Canonical',
    phone: '+20 (100) 123-4567',
  });
  await post(
    '/crm/contacts',
    token,
    { name: 'Normalized duplicate', phone: '٠٠٢٠١٠٠١٢٣٤٥٦٧' },
    409,
  );
  const channel = await post('/channels', token, { type: 'web', name: 'Local merge widget' });
  const visitor = await post(`/widget/${channel.external_id}/session`, null, {});
  const inbound = await fetch(
    `${base}/widget/${channel.external_id}/messages?visitorId=${visitor.visitorId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
      body: JSON.stringify({ clientMsgId: randomUUID(), text: 'Local fixture' }),
    },
  );
  assert.equal(inbound.status, 201);
  const conversation = (await req('/conversations', token)).items[0],
    sourceId = conversation.contact_id;
  const pipeline = await post('/crm/pipelines', token, {
    name: 'Local sales',
    stages: ['New', 'Won'],
  });
  const deal = await post('/crm/deals', token, {
    contactId: sourceId,
    pipelineId: pipeline.id,
    title: 'Preserved deal',
    stage: 'New',
    valueCents: 100,
  });
  await post('/crm/tasks', token, {
    contactId: sourceId,
    title: 'Preserved task',
    dueAt: new Date(Date.now() + 3600000).toISOString(),
  });
  await post(`/crm/contacts/${sourceId}/notes`, token, { text: 'Preserved source note' });
  await req(`/crm/contacts/${sourceId}/consent`, token, 'PUT', {
    channelId: channel.id,
    status: 'opted_out',
    evidence: 'Local fixture opt-out evidence',
  });
  await req(`/crm/contacts/${target.id}/consent`, token, 'PUT', {
    channelId: channel.id,
    status: 'opted_in',
    evidence: 'Local fixture opt-in evidence',
  });
  const historical = await post('/campaigns', token, {
    name: 'Historical local ledger',
    channelId: channel.id,
    filters: {},
    content: { text: 'No external dispatch' },
  });
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "INSERT INTO campaign_recipients(tenant_id,campaign_id,contact_id,status) VALUES($1,$2,$3,'queued'),($1,$2,$4,'skipped')",
      [a.tenantId, historical.id, sourceId, target.id],
    ),
  );
  await post(
    `/crm/contacts/${target.id}/merge`,
    b.accessToken,
    { sourceId, evidence: 'Cross tenant merge rejection' },
    404,
  );
  await post(`/crm/contacts/${target.id}/merge`, token, {
    sourceId,
    evidence: 'Verified local duplicate ownership',
  });
  const timeline = await req(`/crm/contacts/${target.id}/timeline`, token);
  assert.ok(timeline.conversations.some((row) => row.id === conversation.id));
  assert.ok(timeline.deals.some((row) => row.id === deal.id));
  assert.ok(timeline.tasks.some((row) => row.title === 'Preserved task'));
  assert.ok(timeline.notes.some((row) => row.body === 'Preserved source note'));
  assert.equal(timeline.consent[0].status, 'opted_out');
  assert.equal((await req('/crm/contacts/' + sourceId, token)).merged_into_id, target.id);
  const ledger = await db.withTenant(a.tenantId, (c) =>
    c.query(
      'SELECT contact_id,canonical_contact_id FROM campaign_recipients WHERE campaign_id=$1',
      [historical.id],
    ),
  );
  assert.equal(ledger.rows.length, 2);
  assert.ok(ledger.rows.every((row) => row.canonical_contact_id === target.id));
  assert.ok(ledger.rows.some((row) => row.contact_id === sourceId));
  await req(`/crm/contacts/${target.id}/archive`, token, 'PATCH', { archived: true });
  assert.equal((await req('/crm/contacts', token)).total, 0);
  assert.equal((await req('/crm/contacts?archived=archived', token)).total, 1);
  await req(`/crm/contacts/${target.id}/archive`, token, 'PATCH', { archived: false });
  assert.equal((await req('/crm/contacts', token)).total, 1);
  await post('/crm/fields', token, { key: 'score', label: 'Score', type: 'number' });
  await post('/crm/contacts/bulk', token, { ids: [target.id], attributes: { score: 42 } });
  assert.equal((await req('/crm/contacts/' + target.id, token)).attributes.score, 42);
  await post(
    '/crm/contacts/bulk',
    token,
    { ids: [target.id], attributes: { score: 'wrong-type' } },
    400,
  );
  assert.equal((await req('/crm/contacts/' + target.id, token)).attributes.score, 42);
  const optOut = await fetch(
    `${base}/widget/${channel.external_id}/opt-out?visitorId=${visitor.visitorId}`,
    { method: 'POST', headers: { 'x-visitor-token': visitor.token } },
  );
  assert.equal(optOut.status, 201);
  const deniedOptOut = await fetch(
    `${base}/widget/${channel.external_id}/opt-out?visitorId=${visitor.visitorId}`,
    { method: 'POST', headers: { 'x-visitor-token': 'invalid' } },
  );
  assert.equal(deniedOptOut.status, 401);
  const prefix = randomUUID();
  const rows = Array.from({ length: 125 }, (_, i) => ({
    name: 'Import ' + i,
    email: `${prefix}-${i}@example.test`,
  }));
  rows.push(rows[0]);
  const job = await post('/crm/jobs', token, { kind: 'import', contacts: rows });
  await wait(
    async () =>
      (await req('/crm/jobs', token)).find((row) => row.id === job.id)?.status === 'completed',
  );
  const imported = await req(`/crm/jobs/${job.id}/result`, token);
  assert.equal(imported.succeeded, 125);
  assert.equal(imported.errors.length, 1);
  assert.equal(imported.processed, 126);
  const exported = await post('/crm/jobs', token, { kind: 'export' });
  await wait(
    async () =>
      (await req('/crm/jobs', token)).find((row) => row.id === exported.id)?.status === 'completed',
  );
  assert.equal((await req(`/crm/jobs/${exported.id}/result`, token)).result.length, 126);
  await req(`/crm/jobs/${exported.id}/result`, b.accessToken, 'GET', undefined, 404);
  const canceled = await post('/crm/jobs', token, { kind: 'export' });
  await req('/crm/jobs/' + canceled.id + '/cancel', token, 'PATCH');
  const agent = await post('/agents', token, { name: 'Scoped disabled assistant', enabled: false });
  const provider = await post('/agents/providers', token, {
    name: 'Local disabled OpenAI',
    kind: 'openai',
    apiKey: 'fixture-not-a-real-provider-key',
    model: 'gpt-4o-mini',
    enabled: false,
  });
  const rotated = await post('/agents/providers/' + provider.id + '/rotate', token, {
    apiKey: 'fixture-rotated-not-a-real-key',
  });
  assert.equal(rotated.key_version, 2);
  assert.ok(!JSON.stringify(await req('/agents', token)).includes('fixture-rotated'));
  const route = await post('/agents/routes', token, {
    scope: 'channel',
    scopeId: channel.id,
    agentId: agent.id,
  });
  assert.equal((await req('/agents/routes', token)).length, 1);
  await post(
    '/agents/routes',
    b.accessToken,
    { scope: 'channel', scopeId: channel.id, agentId: agent.id },
    404,
  );
  await req('/agents/routes/' + route.id, token, 'DELETE');
  const rule = await post('/automations', token, {
    name: 'OR branch fixture',
    trigger: 'crm.contacts.insert',
    enabled: true,
    conditions: { anyOf: [{ tag: 'never-match' }, { lifecycle: 'lead' }] },
    actions: [
      {
        type: 'branch',
        conditions: { tag: 'vip' },
        then: [{ type: 'note', text: 'Matched branch fixture' }],
        otherwise: [{ type: 'note', text: 'Wrong branch fixture' }],
      },
    ],
  });
  const branchContact = await post('/crm/contacts', token, {
    name: 'Branch customer',
    tags: ['vip'],
  });
  await wait(async () =>
    (await req(`/crm/contacts/${branchContact.id}/timeline`, token)).notes.some(
      (note) => note.body === 'Matched branch fixture',
    ),
  );
  assert.ok(
    !(await req(`/crm/contacts/${branchContact.id}/timeline`, token)).notes.some(
      (note) => note.body === 'Wrong branch fixture',
    ),
  );
  const scheduledRule = await post('/automations', token, {
    name: 'Cancelable schedule',
    trigger: 'automation.scheduled',
    enabled: true,
    conditions: {},
    actions: [{ type: 'note', text: 'Should not execute' }],
  });
  await post('/automations/' + scheduledRule.id + '/schedule', token, {
    contactId: target.id,
    at: new Date(Date.now() + 3600000).toISOString(),
  });
  const schedule = (await req('/automations/schedules', token)).find(
    (row) => row.status === 'pending',
  );
  await req('/automations/schedules/' + schedule.id, token, 'PATCH', {
    at: new Date(Date.now() + 7200000).toISOString(),
  });
  await req('/automations/schedules/' + schedule.id, token, 'PATCH', { cancel: true });
  await req(`/crm/contacts/${target.id}/consent`, token, 'PUT', {
    channelId: channel.id,
    status: 'opted_in',
    evidence: 'Explicit local fixture re-consent',
  });
  const campaign = await post('/campaigns', token, {
    name: 'Editable draft',
    channelId: channel.id,
    content: { text: 'First copy' },
  });
  const update = {
    name: 'Revised draft',
    channelId: channel.id,
    content: { text: 'Revised copy' },
    revision: campaign.revision,
  };
  await req('/campaigns/' + campaign.id, token, 'PATCH', update);
  await req('/campaigns/' + campaign.id, token, 'PATCH', update, 400);
  await post('/campaigns/' + campaign.id + '/schedule', token, {
    at: new Date(Date.now() + 3600000).toISOString(),
  });
  await post('/campaigns/' + campaign.id + '/schedule', token, {
    at: new Date(Date.now() + 7200000).toISOString(),
  });
  assert.equal((await req('/campaigns', token)).find((row) => row.id === campaign.id).revision, 3);
  await req('/campaigns/' + campaign.id + '/cancel', token, 'PATCH');
  const range = new URLSearchParams({
    from: new Date(Date.now() - 86400000).toISOString(),
    to: new Date(Date.now() + 86400000).toISOString(),
  });
  const report = await req('/reports?' + range, token);
  assert.ok(report.daily.some((row) => row.inbound >= 1));
  assert.ok(report.sales.some((row) => row.deals >= 1));
  assert.ok(report.automation.some((row) => row.name === rule.name));
  assert.deepEqual((await req('/reports?' + range, b.accessToken)).daily, []);
  console.log(
    'PASS sprint smoke: normalized duplicates; merge preserves conversations, deals, tasks, consent and original campaign ledgers; archive/restore; durable multi-batch import/export and row errors; tenant isolation; OpenAI key rotation and agent routing; OR and branch actions; schedule reschedule/cancel; campaign edit/revision/reschedule; real reports. No external provider calls.',
  );
} finally {
  await db.onModuleDestroy();
}
