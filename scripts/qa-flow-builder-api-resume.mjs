// API-only continuation against the existing isolated full Nest/PGlite test server.
// No remote destinations, provider calls or Chromium dependency.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
  }
}
async function api(path, body, token, method = body ? 'POST' : 'GET', expected = 200) {
  const r = await fetch('http://localhost:4000' + path, {
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
const session = await api('/auth/register', {
    email: `flow-${randomUUID()}@example.test`,
    password: `Local-${randomUUID()}`,
    fullName: 'Flow QA Owner',
    workspaceName: 'Flow Builder isolated QA',
  }),
  token = session.accessToken;
const channel = await api('/channels', { type: 'web', name: 'Isolated Website' }, token);
await api('/workspace/onboarding/complete', {}, token);
let flow = await api(
  '/flows',
  { name: 'Flow Builder QA', language: 'en', channelIds: [channel.id] },
  token,
);
const graph = {
  startNodeId: 'start',
  nodes: [
    {
      id: 'start',
      type: 'message',
      position: { x: 500, y: 300 },
      data: { text: 'Hello from isolated Flow Builder' },
      edges: { next: 'end' },
    },
    { id: 'end', type: 'end', position: { x: 900, y: 300 }, data: {} },
  ],
  edges: [{ id: 'link', source: 'start', sourceHandle: 'next', target: 'end' }],
};
flow = await api(
  '/flows/' + flow.id,
  { graph, expectedUpdatedAt: flow.updated_at },
  token,
  'PATCH',
);

await check('Create, configure, connect, save and reopen preserve graph positions', async () => {
  const reopened = await api('/flows/' + flow.id, null, token);
  assert.equal(reopened.draft_graph.startNodeId, 'start');
  assert.equal(reopened.draft_graph.nodes[0].position.x, 500);
  assert.equal(reopened.draft_graph.nodes[0].edges.next, 'end');
});
await check('Actual simulator, publish, edit and republish create real versions', async () => {
  assert.ok(
    JSON.stringify(await api('/flows/' + flow.id + '/test', {}, token)).includes(
      'Hello from isolated Flow Builder',
    ),
  );
  let f = await api('/flows/' + flow.id, null, token);
  await api('/flows/' + flow.id + '/publish', { expectedUpdatedAt: f.updated_at }, token);
  f = await api('/flows/' + flow.id, null, token);
  const version = f.published_version;
  graph.nodes[0].data.text = 'Edited isolated reply';
  f = await api('/flows/' + flow.id, { graph, expectedUpdatedAt: f.updated_at }, token, 'PATCH');
  await api('/flows/' + flow.id + '/publish', { expectedUpdatedAt: f.updated_at }, token);
  f = await api('/flows/' + flow.id, null, token);
  assert.ok(f.published_version > version);
});
await check('Other tenant cannot read or mutate the graph', async () => {
  const other = await api('/auth/register', {
    email: randomUUID() + '@example.test',
    password: 'Local-' + randomUUID(),
    fullName: 'Other QA',
    workspaceName: 'Other QA',
  });
  await api('/flows/' + flow.id, null, other.accessToken, 'GET', 404);
  await api('/flows/' + flow.id, { name: 'forbidden' }, other.accessToken, 'PATCH', 404);
});
const roleTokens = {};
for (const role of ['admin', 'agent'])
  await check(role + ' mutation authorization on existing graph', async () => {
    const inv = await api(
      '/team/invitations',
      { email: `${role}-${randomUUID()}@example.test`, role, sendEmail: false },
      token,
    );
    const member = await api('/auth/accept-invitation', {
      token: new URL(inv.inviteUrl).searchParams.get('token'),
      password: `Local-${randomUUID()}`,
      fullName: 'QA ' + role,
    });
    roleTokens[role] = member.accessToken;
    const f = await api('/flows/' + flow.id, null, member.accessToken);
    await api(
      '/flows/' + flow.id,
      { name: f.name, expectedUpdatedAt: f.updated_at },
      member.accessToken,
      'PATCH',
      role === 'admin' ? 200 : 403,
    );
    await api(
      '/flows/' + flow.id + '/publish',
      {},
      member.accessToken,
      'POST',
      role === 'admin' ? 200 : 403,
    );
  });
await check('Published Webchat collects CRM identity and hands off with context', async () => {
  let f = await api('/flows/' + flow.id, null, token);
  const runtimeGraph = {
    startNodeId: 'ask',
    nodes: [
      {
        id: 'ask',
        type: 'question',
        position: { x: 100, y: 200 },
        data: {
          text: 'What is your test name?',
          answerType: 'text',
          saveAs: 'name',
          saveToSystem: 'name',
        },
        edges: { ok: 'reply' },
      },
      {
        id: 'reply',
        type: 'message',
        position: { x: 500, y: 200 },
        data: { text: 'Context received {{name}}' },
        edges: { next: 'staff' },
      },
      {
        id: 'staff',
        type: 'handoff',
        position: { x: 900, y: 200 },
        data: { message: 'A teammate will follow up' },
        edges: {},
      },
    ],
  };
  f = await api(
    '/flows/' + flow.id,
    { graph: runtimeGraph, expectedUpdatedAt: f.updated_at },
    token,
    'PATCH',
  );
  await api('/flows/' + flow.id + '/publish', { expectedUpdatedAt: f.updated_at }, token);
  const visitor = await api('/widget/' + channel.external_id + '/session', {});
  const send = async (text) => {
    const r = await fetch(
      'http://localhost:4000/widget/' +
        channel.external_id +
        '/messages?visitorId=' +
        visitor.visitorId,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
        body: JSON.stringify({ text, clientMsgId: randomUUID() }),
      },
    );
    assert.ok(r.ok, await r.text());
  };
  await send('Local QA hello');
  for (let i = 0; i < 80; i++) {
    const r = await fetch(
      'http://localhost:4000/widget/' +
        channel.external_id +
        '/messages?visitorId=' +
        visitor.visitorId,
      { headers: { 'x-visitor-token': visitor.token } },
    );
    if (JSON.stringify(await r.json()).includes('What is your test name?')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await send('Synthetic Flow Visitor');
  let convo;
  for (let i = 0; i < 80; i++) {
    const rows = await api('/conversations', null, token);
    convo = (rows.items ?? rows)[0];
    if (convo?.handled_by === 'human') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const detail = await api('/conversations/' + convo.id, null, token);
  assert.equal(detail.handled_by, 'human');
  const profile = await api('/crm/contacts/' + convo.contact_id + '/profile', null, token);
  assert.equal(profile.contact.name, 'Synthetic Flow Visitor');
  const messages = await api('/conversations/' + convo.id + '/messages', null, token);
  assert.ok(JSON.stringify(messages).includes('Synthetic Flow Visitor'));
});

let inputFlow;
await check('User Input Flow creates with a campaign name and reports no responses without inventing rows', async () => {
  inputFlow = await api(
    '/flows',
    {
      name: 'Isolated User Input Intake',
      initialNodeType: 'user_input',
      language: 'en',
      channelIds: [channel.id],
    },
    token,
  );
  const createdFlow = await api('/flows/' + inputFlow.id, null, token);
  assert.equal(createdFlow.draft_graph.nodes[0].data.name, 'Isolated User Input Intake');
  const report = await api('/flows/' + inputFlow.id + '/input-report', null, token);
  assert.deepEqual(report.records, []);
  assert.equal(report.fields[0].key, 'customer_name');
});

await check('Webchat User Input Flow validates answers, stores CRM fields, and appears in its report', async () => {
  const graph = {
    startNodeId: 'intake',
    nodes: [
      {
        id: 'intake',
        type: 'user_input',
        position: { x: 100, y: 200 },
        data: {
          name: 'Isolated User Input Intake',
          questions: [
            {
              id: 'test_name',
              text: 'What is your test name?',
              kind: 'text',
              saveAs: 'test_name',
            },
            {
              id: 'test_email',
              text: 'What is your test email?',
              kind: 'email',
              saveAs: 'email',
              saveToSystem: 'email',
              errorText: 'Enter a valid test email.',
              retries: 2,
            },
          ],
          doneText: 'Thanks {{test_name}}',
        },
        edges: { next: 'handoff' },
      },
      {
        id: 'handoff',
        type: 'handoff',
        position: { x: 500, y: 200 },
        data: { message: 'A teammate will follow up.' },
        edges: {},
      },
    ],
  };
  inputFlow = await api(
    '/flows/' + inputFlow.id,
    { graph, expectedUpdatedAt: inputFlow.updated_at },
    token,
    'PATCH',
  );
  await api('/flows/' + inputFlow.id + '/publish', { expectedUpdatedAt: inputFlow.updated_at }, token);
  const visitor = await api('/widget/' + channel.external_id + '/session', {});
  const send = async (text) => {
    const response = await fetch(
      'http://localhost:4000/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
        body: JSON.stringify({ text, clientMsgId: randomUUID() }),
      },
    );
    assert.ok(response.ok, await response.text());
  };
  const messages = async () => {
    const response = await fetch(
      'http://localhost:4000/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId,
      { headers: { 'x-visitor-token': visitor.token } },
    );
    assert.ok(response.ok);
    return response.json();
  };
  await send('Start isolated input');
  for (let i = 0; i < 80 && !JSON.stringify(await messages()).includes('What is your test name?'); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(JSON.stringify(await messages()).includes('What is your test name?'));
  await send('Synthetic Input Contact');
  for (let i = 0; i < 80 && !JSON.stringify(await messages()).includes('What is your test email?'); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(JSON.stringify(await messages()).includes('What is your test email?'));
  await send('not-an-email');
  for (let i = 0; i < 80 && !JSON.stringify(await messages()).includes('Enter a valid test email.'); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(JSON.stringify(await messages()).includes('Enter a valid test email.'));
  await send('synthetic-input@example.test');

  let finalMessages = '';
  for (let i = 0; i < 80; i++) {
    finalMessages = JSON.stringify(await messages());
    if (finalMessages.includes('Thanks Synthetic Input Contact')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(finalMessages.includes('Thanks Synthetic Input Contact'));
  const report = await api('/flows/' + inputFlow.id + '/input-report', null, token);
  assert.equal(report.records.length, 1);
  const contactId = report.records[0].contactId;
  const profile = await api('/crm/contacts/' + contactId + '/profile', null, token);
  assert.equal(profile.contact.name, 'Visitor');
  assert.equal(profile.contact.email, 'synthetic-input@example.test');
  assert.equal(profile.contact.attributes.test_name, 'Synthetic Input Contact');
  assert.equal(report.records[0].contactId, profile.contact.id);
  assert.deepEqual(report.records[0].answers, {
    test_name: 'Synthetic Input Contact',
    email: 'synthetic-input@example.test',
  });
  const timeline = await api('/crm/contacts/' + profile.contact.id + '/timeline', null, token);
  assert.equal(timeline.conversations[0].handled_by, 'human');
});

await check('User Input report is tenant-isolated and blocked for agents but available to admins', async () => {
  const other = await api('/auth/register', {
    email: randomUUID() + '@example.test',
    password: 'Local-' + randomUUID(),
    fullName: 'Other Input QA',
    workspaceName: 'Other Input QA',
  });
  await api('/flows/' + inputFlow.id + '/input-report', null, other.accessToken, 'GET', 404);
  await api('/flows/' + inputFlow.id + '/input-report', null, roleTokens.agent, 'GET', 403);
  const adminReport = await api('/flows/' + inputFlow.id + '/input-report', null, roleTokens.admin);
  assert.equal(adminReport.records.length, 1);
});

mkdirSync('docs/user-input-flow-20261107', { recursive: true });
writeFileSync(
  'docs/user-input-flow-20261107/api-journey.json',
  JSON.stringify(
    {
      results,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      scope: 'isolated HTTP; not UI acceptance',
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
