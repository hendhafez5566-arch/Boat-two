// Local-only full Nest/PGlite HTTP acceptance. No external providers or live data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const results = [];
async function api(path, token, body, method = body ? 'POST' : 'GET', status = 200) {
  const r = await fetch('http://127.0.0.1:4000' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.ok, status < 400, path + ': ' + JSON.stringify(data));
  if (status >= 400) assert.equal(r.status, status, path);
  return data;
}
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); }
}
async function owner() {
  return api('/auth/register', null, { email: randomUUID() + '@example.test',
    password: 'Isolated-' + randomUUID(), fullName: 'Signature QA Owner', workspaceName: 'Isolated Signature QA' });
}
const auth = await owner(), token = auth.accessToken;
const a = await api('/channels', token, { type: 'web', name: 'QA Signature A' });
const b = await api('/channels', token, { type: 'web', name: 'QA Signature B' });
await api('/workspace/onboarding/complete', token, {});
await api('/inbox/settings', token, { signature_enabled: false, signature_template: 'Signed {{agent.name}}' }, 'PUT');
const workspaceBefore = await api('/inbox/settings', token);
const conversations = [];
for (const channel of [a, b]) {
  const visitor = await api('/widget/' + channel.external_id + '/session', null, {});
  const r = await fetch('http://127.0.0.1:4000/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
      body: JSON.stringify({ text: 'Synthetic QA visitor', clientMsgId: randomUUID() }) });
  assert.ok(r.ok, await r.text());
  const rows = await api('/conversations', token);
  conversations.push((rows.items ?? rows).find((cv) => cv.channel_id === channel.id));
}
const [ca, cb] = conversations;
assert.ok(ca && cb);
const settingsPath = '/channels/' + a.id + '/bot-settings';
let saved;
await check('Saving a signature draft and reopening does not activate outgoing signatures', async () => {
  saved = await api(settingsPath, token, { general: { noMatchReply: false, getStartedEnabled: false }, sharedInbox: { signatureEnabled: true, humanSessionExpiryMinutes: 30 } }, 'PATCH');
  assert.deepEqual(await api(settingsPath, token), saved);
  await api('/conversations/' + ca.id + '/messages', token, { text: 'Before activation' });
  const messages = await api('/conversations/' + ca.id + '/messages', token);
  assert.ok(JSON.stringify(messages).includes('Before activation'));
  assert.equal(JSON.stringify(messages).includes('Signed Signature QA Owner'), false);
});
await check('Activation applies the signature through actual Inbox persistence and preserves CRM/handoff', async () => {
  const activation = await api(settingsPath + '/activate', token, saved);
  assert.ok(activation.scope.includes('sharedInbox.signatureEnabled'));
  assert.equal(activation.active.sharedInbox.humanSessionExpiryMinutes,30);
  await api('/conversations/' + ca.id + '/messages', token, { text: 'Activated reply' });
  const messages = await api('/conversations/' + ca.id + '/messages', token);
  assert.ok(JSON.stringify(messages).includes('Activated reply\\nSigned Signature QA Owner'));
  const cv = await api('/conversations/' + ca.id, token);
  assert.equal(cv.handled_by, 'human');
  assert.equal(cv.contact_id, ca.contact_id);
  assert.ok(await api('/crm/contacts/' + ca.contact_id + '/profile', token));
});
await check('Other channel and workspace settings are unchanged', async () => {
  await api('/conversations/' + cb.id + '/messages', token, { text: 'Other channel reply' });
  assert.equal(JSON.stringify(await api('/conversations/' + cb.id + '/messages', token)).includes('Signed Signature QA Owner'), false);
  assert.deepEqual(await api('/inbox/settings', token), workspaceBefore);
});
await check('Stale activation fails; draft edits do not replace the active signature until reactivation', async () => {
  const previous = saved;
  saved = await api(settingsPath, token, { sharedInbox: { signatureEnabled: false } }, 'PATCH');
  await api(settingsPath + '/activate', token, previous, 'POST', 409);
  await api('/conversations/' + ca.id + '/messages', token, { text: 'Still active' });
  assert.ok(JSON.stringify(await api('/conversations/' + ca.id + '/messages', token)).includes('Still active\\nSigned Signature QA Owner'));
  await api(settingsPath + '/activate', token, saved);
  await api('/conversations/' + ca.id + '/messages', token, { text: 'Disabled after activation' });
  assert.equal(JSON.stringify(await api('/conversations/' + ca.id + '/messages', token)).includes('Disabled after activation\\nSigned'), false);
});
await check('Cross-tenant settings and activation are denied', async () => {
  const other = await owner();
  await api(settingsPath, other.accessToken, null, 'GET', 404);
  await api(settingsPath, other.accessToken, { sharedInbox: { signatureEnabled: true, humanSessionExpiryMinutes: 30 } }, 'PATCH', 404);
  await api(settingsPath + '/activate', other.accessToken, saved, 'POST', 404);
});
for (const role of ['admin', 'agent']) await check(role + ' server authorization for settings/save/activate', async () => {
  const inv = await api('/team/invitations', token, { email: role + '-' + randomUUID() + '@example.test', role, sendEmail: false });
  const member = await api('/auth/accept-invitation', null, { token: new URL(inv.inviteUrl).searchParams.get('token'), password: 'Isolated-' + randomUUID(), fullName: 'QA ' + role });
  const expected = role === 'admin' ? 200 : 403;
  await api(settingsPath, member.accessToken, null, 'GET', expected);
  await api(settingsPath, member.accessToken, { sharedInbox: { signatureEnabled: false } }, 'PATCH', expected);
  await api(settingsPath + '/activate', member.accessToken, saved, 'POST', expected);
});
const output = { environment: 'local full Nest/PGlite; synthetic records; external sends disabled', results };
mkdirSync('docs/platform-fidelity-20261108', { recursive: true });
writeFileSync('docs/platform-fidelity-20261108/channel-signature-http.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
