import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const base = process.env.SMOKE_API_URL || 'http://localhost:4117';
async function request(path, token, method = 'GET', body, status = 200) {
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
const post = (path, token, body, status = 201) => request(path, token, 'POST', body, status);
async function register() {
  return post('/auth/register', null, {
    email: `work-${randomUUID()}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Work fixture',
    workspaceName: 'Work fixture',
  });
}
const a = await register(),
  b = await register(),
  token = a.accessToken,
  me = await request('/auth/me', token);
const contact = await post('/crm/contacts', token, { name: 'Work customer' }),
  pipeline = await post('/crm/pipelines', token, { name: 'Work pipeline', stages: ['New', 'Won'] });
const deal = await post('/crm/deals', token, {
  contactId: contact.id,
  pipelineId: pipeline.id,
  title: 'Initial work deal',
  stage: 'New',
  valueCents: 100,
});
const updated = await request('/crm/deals/' + deal.id, token, 'PATCH', {
  title: 'Closed work deal',
  stage: 'Won',
  status: 'won',
  valueCents: 25000,
  currency: 'EUR',
  ownerId: me.user.id,
  expectedUpdatedAt: deal.updated_at,
});
assert.equal(updated.owner_id, me.user.id);
assert.equal(updated.currency, 'EUR');
await request(
  '/crm/deals/' + deal.id,
  token,
  'PATCH',
  { title: 'Stale overwrite', expectedUpdatedAt: '2000-01-01T00:00:00.000Z' },
  400,
);
assert.equal(
  (await request('/crm/deals?status=won&ownerId=' + me.user.id + '&q=Closed', token)).total,
  1,
);
assert.equal((await request('/crm/deals?status=open', token)).total, 0);
assert.equal((await request('/crm/deals/export?status=won', token)).items.length, 1);
await request('/crm/deals/' + deal.id, b.accessToken, 'PATCH', { title: 'Cross tenant' }, 404);
const task = await post('/crm/tasks', token, {
  contactId: contact.id,
  title: 'Original task',
  dueAt: '2026-11-01T12:00:00.000Z',
});
const changed = await request('/crm/tasks/' + task.id, token, 'PATCH', {
  title: 'Rescheduled task',
  dueAt: '2026-12-01T12:00:00.000Z',
  assignedTo: me.user.id,
  status: 'done',
  expectedUpdatedAt: task.updated_at,
});
assert.equal(changed.assigned_to, me.user.id);
assert.equal((await request('/crm/tasks?dueTo=2026-11-30T00%3A00%3A00.000Z', token)).total, 0);
assert.equal((await request('/crm/tasks?status=done&ownerId=' + me.user.id, token)).total, 1);
assert.equal((await request('/crm/tasks/export?status=done', token)).items.length, 1);
await request('/crm/tasks/' + task.id, token, 'PATCH', { assignedTo: randomUUID() }, 400);
await request('/crm/tasks/' + task.id, b.accessToken, 'PATCH', { status: 'open' }, 404);
console.log(
  'PASS CRM work: filtered/paged sales and follow-ups, full deal/task editing, optimistic revision checks, assignment validation, filtered exports and tenant isolation. No external calls.',
);
