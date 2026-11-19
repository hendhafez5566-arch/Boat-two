import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
const results = [];
async function api(path, token, body, method = body ? 'POST' : 'GET', status = 200) {
  const r = await fetch('http://127.0.0.1:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = r.status === 204 ? null : await r.json();
  assert.equal(r.ok, status < 400, path + ': ' + JSON.stringify(data));
  if (status >= 400) assert.equal(r.status, status);
  return data;
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
  }
}
const register = () =>
  api('/auth/register', null, {
    email: randomUUID() + '@example.test',
    password: 'Isolated-' + randomUUID(),
    fullName: 'Channel QA Owner',
    workspaceName: 'Isolated Channel QA',
  });
const owner = await register(),
  token = owner.accessToken;
let channel;
await check(
  'Create website channel and reopen preserves real settings without claiming connectivity',
  async () => {
    channel = await api('/channels', token, {
      type: 'web',
      name: 'Synthetic Website',
      settings: {
        title: 'Synthetic title',
        direction: 'rtl',
        allowedOrigins: ['https://example.test'],
      },
    });
    const row = (await api('/channels', token)).find((c) => c.id === channel.id);
    assert.equal(row.settings.title, 'Synthetic title');
    assert.equal(row.connectionHealth.state, 'needs_action');
    assert.ok(row.widgetSnippet.includes(row.external_id));
  },
);
await check('Update and reopen preserve widget fields and truthful paused state', async () => {
  await api(
    '/channels/' + channel.id,
    token,
    { name: 'Updated synthetic', status: 'disabled', settings: { title: 'Updated widget' } },
    'PATCH',
  );
  let row = (await api('/channels', token)).find((c) => c.id === channel.id);
  assert.equal(row.name, 'Updated synthetic');
  assert.equal(row.settings.title, 'Updated widget');
  assert.deepEqual(row.settings.allowedOrigins, ['https://example.test']);
  assert.equal(row.connectionHealth.state, 'disconnected');
  await api('/channels/' + channel.id, token, { status: 'active' }, 'PATCH');
  row = (await api('/channels', token)).find((c) => c.id === channel.id);
  assert.equal(row.connectionHealth.state, 'needs_action');
});
await check(
  'Invalid settings and synthetic Telegram token are rejected before any provider call',
  async () => {
    await api('/channels/' + channel.id, token, { name: '' }, 'PATCH', 400);
    await api(
      '/channels/' + channel.id,
      token,
      { settings: { allowedOrigins: ['not-a-url'] } },
      'PATCH',
      400,
    );
    await api(
      '/channels',
      token,
      { type: 'telegram', name: 'Invalid fixture', credentials: { botToken: 'invalid' } },
      'POST',
      400,
    );
  },
);
await check('Channel metadata stays isolated across companies', async () => {
  const other = await register();
  assert.equal((await api('/channels', other.accessToken)).length, 0);
  await api('/channels/' + channel.id, other.accessToken, { name: 'forbidden' }, 'PATCH', 404);
});
for (const role of ['admin', 'agent'])
  await check(role + ' channel mutation authorization', async () => {
    const invitation = await api('/team/invitations', token, {
      email: role + '-' + randomUUID() + '@example.test',
      role,
      sendEmail: false,
    });
    const member = await api('/auth/accept-invitation', null, {
      token: new URL(invitation.inviteUrl).searchParams.get('token'),
      password: 'Isolated-' + randomUUID(),
      fullName: 'QA ' + role,
    });
    const code = role === 'admin' ? 200 : 403;
    await api(
      '/channels/' + channel.id,
      member.accessToken,
      { name: 'Synthetic role check' },
      'PATCH',
      code,
    );
    await api(
      '/channels',
      member.accessToken,
      { type: 'web', name: 'Synthetic ' + role },
      'POST',
      code,
    );
  });
const output = {
  environment: 'local Nest/PGlite with external delivery disabled; synthetic accounts only',
  results,
  providerConnection: 'BLOCKED: no real credential, webhook or provider mutation attempted',
  browserAcceptance: 'Not a browser interaction test',
};
mkdirSync('docs/platform-fidelity-20261108', { recursive: true });
writeFileSync(
  'docs/platform-fidelity-20261108/channels-http.json',
  JSON.stringify(output, null, 2),
);
console.log(JSON.stringify(output, null, 2));
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
