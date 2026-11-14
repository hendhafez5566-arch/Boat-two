import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
async function api(path, token, body, status = 200) {
  const r = await fetch('http://127.0.0.1:4000' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (status >= 400) assert.equal(r.status, status);
  else assert.ok(r.ok, JSON.stringify(data));
  return data;
}
async function register() {
  return api('/auth/register', null, {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-' + randomUUID(),
    fullName: 'QA',
    workspaceName: 'Telegram QA',
  });
}
const owner = await register(),
  other = await register(),
  token = owner.accessToken;
const connect = (n) => ({ botToken: n + ':synthetic_test_token_123456789' });
await api('/channels/telegram/connect', null, connect('90000001'), 401);
await api('/channels/telegram/connect', token, { botToken: 'invalid' }, 400);
const saved = await api('/channels/telegram/connect', token, connect('90000001'));
assert.equal(saved.webhookReady, true);
let rows = await api('/channels', token);
assert.equal(rows.length, 1);
assert.equal(rows[0].name, 'Synthetic Bot 90000001');
assert.equal(rows[0].connectionHealth.state, 'connected');
assert.ok(!JSON.stringify(rows).includes('synthetic_test_token'));
await api('/channels/telegram/connect', token, connect('90000001'), 409);
await api('/channels/telegram/connect', other.accessToken, connect('90000001'), 409);
assert.equal((await api('/channels', other.accessToken)).length, 0);
const pending = await api('/channels/telegram/connect', token, connect('90000999'));
assert.equal(pending.webhookReady, false);
rows = await api('/channels', token);
assert.equal(rows.length, 2);
assert.equal(rows.find((r) => r.id === pending.id).connectionHealth.state, 'needs_action');
for (const [role, id, code] of [
  ['admin', '90000002', 200],
  ['agent', '90000003', 403],
]) {
  const inv = await api('/team/invitations', token, {
    email: role + '-' + randomUUID() + '@example.test',
    role,
    sendEmail: false,
  });
  const member = await api('/auth/accept-invitation', null, {
    token: new URL(inv.inviteUrl).searchParams.get('token'),
    password: 'Synthetic-' + randomUUID(),
    fullName: 'QA ' + role,
  });
  const result = await api('/channels/telegram/connect', member.accessToken, connect(id), code);
  if (role === 'admin') assert.equal(result.webhookReady, true);
}
console.log(
  'PASS: real HTTP auth, role guards, validation, provider identity/name, webhook setup/failure, redaction, duplicate protection and cross-tenant isolation. Provider mocked; no live acceptance.',
);
