import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = process.env.SMOKE_API_URL || 'http://localhost:4000';
async function request(path, { token, method = 'GET', body, headers = {}, status = 200 } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, status, `${method} ${path}: unexpected HTTP status`);
  return data;
}
const email = () => `core-${randomBytes(6).toString('hex')}@example.test`;
const password = randomBytes(20).toString('hex');
async function register() {
  return request('/auth/register', {
    method: 'POST',
    status: 201,
    body: {
      email: email(),
      password,
      fullName: 'Core smoke',
      workspaceName: 'Core smoke workspace',
    },
  });
}
const a = await register(),
  b = await register();
const token = a.accessToken;
assert.equal((await request('/health')).db, 'up');
await request('/workspace', {
  token,
  method: 'PATCH',
  body: {
    name: 'Core smoke updated',
    industry: 'Support',
    timezone: 'Africa/Cairo',
    language: 'ar',
    preferredPlan: 'starter',
  },
});
assert.equal((await request('/workspace', { token })).tenant.preferred_plan, 'starter');
const channel = await request('/channels', {
  token,
  method: 'POST',
  status: 201,
  body: { type: 'web', name: 'Core smoke widget' },
});
await request('/channels/' + channel.id, {
  token: b.accessToken,
  method: 'PATCH',
  status: 404,
  body: { name: 'forbidden' },
});
const templates = await request('/flows/templates', { token });
assert.ok(templates.length >= 3);
for (const template of templates) {
  const flow = await request('/flows', {
    token,
    method: 'POST',
    status: 201,
    body: { name: template.name, templateId: template.id },
  });
  const f = await request('/flows/' + flow.id, { token });
  const validation = await request('/flows/validate', {
    token,
    method: 'POST',
    status: 201,
    body: f.draft_graph,
  });
  assert.equal(validation.errors.length, 0);
  if (template.id !== 'support') continue;
  const url = '/flows/' + flow.id;
  await request(url, { token: b.accessToken, status: 404 });
  await request(url, {
    token,
    method: 'PATCH',
    body: { expectedUpdatedAt: f.updated_at, channelIds: [channel.id], name: 'Core support' },
  });
  await request(url, {
    token,
    method: 'PATCH',
    status: 409,
    body: { expectedUpdatedAt: f.updated_at, name: 'stale' },
  });
  const published = await request(url + '/publish', { token, method: 'POST', status: 201 });
  assert.equal(published.version, 1);
  const versions = await request(url + '/versions', { token });
  assert.equal(versions.length, 1);
  await request(url + '/versions/' + versions[0].id + '/restore', {
    token: b.accessToken,
    method: 'POST',
    status: 404,
  });
  await request(url + '/versions/' + versions[0].id + '/restore', {
    token,
    method: 'POST',
    status: 201,
  });
  const preview = await request(url + '/test', {
    token,
    method: 'POST',
    status: 201,
    body: { text: 'hello' },
  });
  assert.equal(preview.status, 'waiting');
  const visitor = await request(`/widget/${channel.external_id}/session`, {
    method: 'POST',
    status: 201,
    body: {},
  });
  const headers = { 'x-visitor-token': visitor.token };
  const path = `/widget/${channel.external_id}/messages?visitorId=${visitor.visitorId}`;
  const body = { clientMsgId: randomBytes(10).toString('hex'), text: 'hello' };
  await request(path, { method: 'POST', status: 201, headers, body });
  assert.equal(
    (await request(path, { method: 'POST', status: 201, headers, body })).duplicate,
    true,
  );
  let messages;
  for (let attempt = 0; attempt < 30; attempt++) {
    messages = await request(path, { headers });
    if (messages.messages.some((m) => m.senderType === 'bot')) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(
    messages.messages.some((m) => m.senderType === 'bot'),
    'Published flow must reply through the widget',
  );
  const list = await request('/conversations', { token });
  const conversation = list.items.find((c) => c.channel_id === channel.id);
  assert.ok(conversation);
  await request(`/conversations/${conversation.id}/takeover`, {
    token,
    method: 'POST',
    status: 201,
  });
  await request(`/conversations/${conversation.id}/messages`, {
    token,
    method: 'POST',
    status: 201,
    body: { text: 'Human reply' },
  });
  await request(`/conversations/${conversation.id}/notes`, {
    token,
    method: 'POST',
    status: 201,
    body: { text: 'Private note' },
  });
  const widget = await request(path, { headers });
  assert.ok(widget.messages.some((m) => m.content.text === 'Human reply'));
  assert.ok(!widget.messages.some((m) => m.content.text === 'Private note'));
  const bulk = await request('/conversations/bulk', {
    token: b.accessToken,
    method: 'POST',
    status: 201,
    body: { ids: [conversation.id], patch: { status: 'closed' } },
  });
  assert.equal(bulk.results[0].ok, false);
  assert.equal((await request('/conversations/' + conversation.id, { token })).status, 'open');
  await request('/conversations/bulk', {
    token,
    method: 'POST',
    status: 201,
    body: { ids: [conversation.id], patch: { status: 'closed' } },
  });
}
const invite = await request('/team/invitations', {
  token,
  method: 'POST',
  status: 201,
  body: { email: email(), role: 'agent' },
});
const invitationToken = new URL(invite.inviteUrl).searchParams.get('token');
const agent = await request('/auth/accept-invitation', {
  method: 'POST',
  status: 201,
  body: { token: invitationToken, password, fullName: 'Agent smoke' },
});
await request('/auth/accept-invitation', {
  method: 'POST',
  status: 400,
  body: { token: invitationToken, password, fullName: 'Replay' },
});
await request('/workspace', {
  token: agent.accessToken,
  method: 'PATCH',
  status: 403,
  body: { name: 'forbidden', timezone: 'UTC', language: 'en', preferredPlan: 'free' },
});
const me = await request('/auth/me', { token: agent.accessToken });
await request('/team/members/' + me.user.id, { token, method: 'DELETE' });
// Removing the member also revokes the backing session; access is rejected before role checks.
await request('/workspace', { token: agent.accessToken, status: 401 });
const audit = await request('/workspace/audit', { token });
assert.ok(audit.total > 0);
assert.ok(audit.items.some((x) => x.actor_name === 'Core smoke'));
const refreshed = await request('/auth/refresh', {
  method: 'POST',
  status: 200,
  body: { refreshToken: a.refreshToken },
});
assert.ok(refreshed.accessToken);
await request('/auth/refresh', {
  method: 'POST',
  status: 401,
  body: { refreshToken: a.refreshToken },
});
console.log(
  'PASS core smoke: settings, templates, conflict detection, versions, published widget bot, handoff, manual reply, private notes, cross-tenant denial, invitations, revoked access, audit, refresh replay.',
);
console.log(
  'Smoke fixtures retained in isolated development database; no provider calls were made.',
);
