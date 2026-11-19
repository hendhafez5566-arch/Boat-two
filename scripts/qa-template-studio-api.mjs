import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const results = [];
async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const r = await fetch('http://127.0.0.1:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.ok, expected < 400, path + ': ' + JSON.stringify(data));
  if (expected >= 400) assert.equal(r.status, expected);
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
    fullName: 'Template QA Owner',
    workspaceName: 'Template QA',
  });
const owner = await register(),
  token = owner.accessToken;
const channel = await api('/__qa/templates/channel', token, {}),
  path = '/channels/' + channel.id + '/templates';
const draft = {
  name: 'synthetic_mixed',
  language: 'ar',
  category: 'MARKETING',
  body: 'Synthetic {{1}}',
  examples: ['QA'],
  header: {
    type: 'HEADER',
    format: 'DOCUMENT',
    example: { header_handle: ['synthetic-upload-handle'] },
  },
  footer: 'Synthetic footer',
  buttons: [{ type: 'URL', text: 'Open item', url: 'https://example.test/item' }],
};
let saved;
await check(
  'Create and reopen preserve supported mixed template fields and provider examples',
  async () => {
    saved = await api(path, token, draft);
    const list = await api(path, token);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, saved.id);
    assert.equal(list[0].body, draft.body);
    assert.equal(list[0].status, 'DRAFT');
    assert.equal(list[0].components[0].example.header_handle[0], 'synthetic-upload-handle');
    assert.equal(list[0].components[3].buttons[0].url, 'https://example.test/item');
  },
);
await check('Edit persists revision and stale edits are rejected', async () => {
  const old = saved;
  saved = await api(
    path + '/' + saved.id,
    token,
    { revision: saved.revision, draft: { ...draft, footer: 'Updated footer' } },
    'PATCH',
  );
  assert.equal(saved.revision, old.revision + 1);
  await api(path + '/' + saved.id, token, { revision: old.revision, draft }, 'PATCH', 409);
  assert.equal(
    (await api(path, token))[0].components.find((c) => c.type === 'FOOTER').text,
    'Updated footer',
  );
});
await check('Invalid variables, media samples and unsupported OTP are rejected', async () => {
  for (const change of [
    { examples: [] },
    { header: { type: 'HEADER', format: 'IMAGE' } },
    { category: 'AUTHENTICATION' },
  ])
    await api(path, token, { ...draft, ...change }, 'POST', 400);
  assert.equal((await api(path, token)).length, 1);
});
await check('Other tenant cannot read or mutate this channel', async () => {
  const other = await register();
  await api(path, other.accessToken, null, 'GET', 404);
  await api(
    path + '/' + saved.id,
    other.accessToken,
    { revision: saved.revision, draft },
    'PATCH',
    404,
  );
});
for (const role of ['admin', 'agent'])
  await check(role + ' server permissions for create and edit', async () => {
    const inv = await api('/team/invitations', token, {
      email: role + '-' + randomUUID() + '@example.test',
      role,
      sendEmail: false,
    });
    const member = await api('/auth/accept-invitation', null, {
      token: new URL(inv.inviteUrl).searchParams.get('token'),
      password: 'Isolated-' + randomUUID(),
      fullName: 'QA ' + role,
    });
    const code = role === 'admin' ? 200 : 403;
    await api(path, member.accessToken, null, 'GET', code);
    await api(path, member.accessToken, { ...draft, name: 'qa_' + role }, 'POST', code);
    await api(
      path + '/' + saved.id,
      member.accessToken,
      { revision: saved.revision, draft },
      'PATCH',
      code,
    );
  });
await check('Provider submission stays gated and never reports false approval', async () => {
  await api(path + '/' + saved.id + '/submit', token, {}, 'POST', 503);
  assert.equal((await api(path, token)).find((t) => t.id === saved.id).status, 'DRAFT');
});
const output = {
  environment: 'isolated full Nest/PGlite; synthetic WhatsApp channel; no provider calls',
  results,
  providerAcceptance: 'BLOCKED: no real provider submission attempted',
  browserVisualAcceptance: 'NOT RUN on modified source',
};
mkdirSync('docs/platform-fidelity-20261108', { recursive: true });
writeFileSync(
  'docs/platform-fidelity-20261108/template-studio-http.json',
  JSON.stringify(output, null, 2),
);
console.log(JSON.stringify(output, null, 2));
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
