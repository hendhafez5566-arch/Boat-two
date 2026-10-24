import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function request(path, body, token, method = 'POST', status = 201) {
  const res = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
}
const fixture = () => request('/auth/register', {
  email: `provider-${randomUUID()}@example.test`, password: randomUUID() + randomUUID(),
  fullName: 'Provider fixture', workspaceName: 'Provider fixture',
});
const a = await fixture(), b = await fixture(), token = a.accessToken;
const p = await request('/agents/providers', { name: 'Local mock', kind: 'openai', model: 'mock', apiKey: 'local_fixture_no_network' }, token);
const list = () => request('/agents', undefined, token, 'GET', 200);
let row = (await list()).providers.find(x => x.id === p.id);
assert.equal(row.revision, 1); assert.equal(row.supports_tools, true);
await request('/agents/providers/' + p.id, { name: 'Forbidden' }, token, 'PATCH', 400);
row = await request('/agents/providers/' + p.id, { revision: 1, name: 'Edited', model: 'mock-v2', supportsTools: false, inputUsdPerMillion: 2 }, token, 'PATCH', 200);
await request('/agents/providers/' + p.id, { revision: 1, enabled: true }, token, 'PATCH', 409);
await request('/agents', { name: 'Incompatible', providerId: p.id, enabled: true }, token, 'POST', 400);
const agent = await request('/agents', { name: 'Compatible', providerId: p.id, allowedTools: [], enabled: true }, token);
await request('/agents/providers/' + p.id, { enabled: true }, b.accessToken, 'PATCH', 404);
await request('/agents/providers/' + p.id + '/retire', { revision: row.revision }, token);
await request('/agents/providers/' + p.id, { enabled: true }, token, 'PATCH', 400);
await request('/agents/providers/' + p.id + '/rotate', { apiKey: 'replacement_fixture_key' }, token, 'POST', 404);
await request('/agents', { name: 'Retired', providerId: p.id }, token, 'POST', 400);
const result = await list();
assert.ok(result.agents.some(x => x.id === agent.id));
assert.ok(result.providers.find(x => x.id === p.id).retired_at);
assert.ok(!JSON.stringify(result).includes('local_fixture_no_network'));
console.log('Provider lifecycle: edits, conflicts, tool compatibility, retirement, key denial, retained agents and tenant isolation passed. No external calls.');
