import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function call(path, token, body, status = body ? 201 : 200) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
const a = await call('/auth/register', null, {
  email: `flow-locales-${randomUUID()}@example.test`,
  password: randomUUID() + randomUUID(),
  fullName: 'Local template fixture',
  workspaceName: 'Local template fixture',
});
const list = await call('/flows/templates?language=en', a.accessToken);
assert.equal(list.length, 3);
assert.ok(!/[\u0600-\u06ff]/.test(JSON.stringify(list)));
const identity = (graph) => ({
  start: graph.startNodeId,
  nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, edges: n.edges })),
});
for (const template of list) {
  const en = await call('/flows', a.accessToken, {
      name: template.name,
      templateId: template.id,
      language: 'en',
    }),
    ar = await call('/flows', a.accessToken, {
      name: 'Arabic ' + template.id,
      templateId: template.id,
      language: 'ar',
    });
  const english = (await call('/flows/' + en.id, a.accessToken)).draft_graph,
    arabic = (await call('/flows/' + ar.id, a.accessToken)).draft_graph;
  assert.ok(!/[\u0600-\u06ff]/.test(JSON.stringify(english)));
  assert.ok(/[\u0600-\u06ff]/.test(JSON.stringify(arabic)));
  assert.deepEqual(identity(english), identity(arabic));
  const preview = await call('/flows/' + en.id + '/test', a.accessToken, { text: 'Hello' });
  assert.ok(preview.transcript.length);
  assert.ok(
    !/[\u0600-\u06ff]/.test(JSON.stringify(preview.transcript.filter((x) => x.role === 'bot'))),
  );
}
const blank = await call('/flows', a.accessToken, { name: 'English blank', language: 'en' });
assert.equal(
  (await call('/flows/' + blank.id, a.accessToken)).draft_graph.nodes[0].data.text,
  'Hello! How can I help you?',
);
await call('/flows', a.accessToken, { name: 'Unsupported locale', language: 'fr' }, 400);
console.log(
  'Flow locales: all three English catalog/templates and actual engine previews contain English starter content; Arabic originals and graph IDs/edges preserved; English blank and invalid locale checks passed. No external calls.',
);
