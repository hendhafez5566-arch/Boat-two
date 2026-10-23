import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const base = process.env.SMOKE_API_URL || 'http://localhost:4119';
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
  return post('/auth/register', null, {
    email: `department-${randomUUID()}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Department fixture',
    workspaceName: 'Department fixture',
  });
}
const a = await register(),
  b = await register(),
  token = a.accessToken,
  me = await req('/auth/me', token);
const department = await post('/departments', token, {
  name: 'Support fixture',
  slaMinutes: 60,
  members: [me.user.id],
});
const updated = await req('/departments/' + department.id, token, 'PATCH', {
  name: 'Renamed support',
  slaMinutes: 30,
  members: [],
  expectedUpdatedAt: department.updated_at,
});
assert.equal(updated.name, 'Renamed support');
assert.deepEqual((await req('/departments', token))[0].members, []);
await req(
  '/departments/' + department.id,
  token,
  'PATCH',
  {
    name: 'Stale edit',
    slaMinutes: 30,
    members: [],
    expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
  },
  400,
);
await req(
  '/departments/' + department.id,
  b.accessToken,
  'PATCH',
  { name: 'Cross tenant', slaMinutes: 30, members: [] },
  404,
);
const channel = await post('/channels', token, { type: 'web', name: 'Department fixture widget' }),
  visitor = await post('/widget/' + channel.external_id + '/session', null, {});
const incoming = await fetch(
  `${base}/widget/${channel.external_id}/messages?visitorId=${visitor.visitorId}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
    body: JSON.stringify({ clientMsgId: randomUUID(), text: 'Support request fixture' }),
  },
);
assert.equal(incoming.status, 201);
const conversation = (await req('/conversations', token)).items[0];
await req('/conversations/' + conversation.id, token, 'PATCH', { departmentId: department.id });
const range =
  'from=' +
  encodeURIComponent(new Date(Date.now() - 3600000).toISOString()) +
  '&to=' +
  encodeURIComponent(new Date(Date.now() + 3600000).toISOString());
let metrics = (await req('/departments/metrics?' + range, token))[0];
assert.equal(metrics.conversations, 1);
assert.equal(metrics.responded, 0);
assert.equal(metrics.unanswered, 1);
await post('/conversations/' + conversation.id + '/messages', token, {
  text: 'Public staff response fixture',
});
metrics = (await req('/departments/metrics?' + range, token))[0];
assert.equal(metrics.responded, 1);
assert.equal(metrics.unanswered, 0);
assert.ok(metrics.average_response_seconds >= 0);
await req('/departments/' + department.id + '/archive', token, 'PATCH', { archived: true });
assert.equal((await req('/departments', token)).length, 0);
assert.equal((await req('/departments?includeArchived=true', token)).length, 1);
await req(
  '/conversations/' + conversation.id,
  token,
  'PATCH',
  { departmentId: department.id },
  400,
);
assert.equal((await req('/departments/metrics?' + range, token))[0].conversations, 1);
await req('/departments/' + department.id + '/archive', token, 'PATCH', { archived: false });
await req('/conversations/' + conversation.id, token, 'PATCH', { departmentId: department.id });
console.log(
  'PASS departments: membership/SLA editing, stale revision rejection, archive/restore, preserved conversation links, blocked archived assignment, real first-response aggregates and tenant isolation. No external delivery.',
);
