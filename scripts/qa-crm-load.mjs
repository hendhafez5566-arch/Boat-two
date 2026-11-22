import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const base = 'http://127.0.0.1:4000';
async function request(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, data: await response.json() };
}
async function setup(path, token, body) {
  const { status, data } = await request(path, token, body);
  assert.ok(status >= 200 && status < 300, path + ' ' + status);
  return data;
}

const workspaces = [];
for (let index = 0; index < 10; index++) {
  const session = await setup('/auth/register', null, {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-' + randomUUID(),
    fullName: 'Load test owner',
    workspaceName: 'Synthetic load company ' + index,
  });
  const token = session.accessToken;
  const me = await setup('/auth/me', token);
  const tenantId = me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
  const marker = await setup('/crm/contacts', token, { name: 'Load marker company ' + index });
  await setup('/__qa/crm', null, { tenantId, op: 'seed' });
  const firstPage = await setup('/crm/contacts?limit=1', token);
  assert.equal(firstPage.total, 3001);
  workspaces.push({ token, contactId: marker.id });
}

const workload = [
  { name: 'firstPage', path: () => '/crm/contacts?limit=25', expected: 200 },
  { name: 'search', path: () => '/crm/contacts?q=Load%20customer%202&limit=25', expected: 200 },
  { name: 'summary', path: () => '/crm/contacts-summary', expected: 200 },
  { name: 'page100', path: () => '/crm/contacts?page=100&limit=25&sort=name', expected: 200 },
  { name: 'profile', path: ({ contactId }) => '/crm/contacts/' + contactId + '/profile', expected: 200 },
  { name: 'noteWrite', path: ({ contactId }) => '/crm/contacts/' + contactId + '/notes', body: (i) => ({ text: 'Synthetic load note ' + i }), expected: 201 },
  { name: 'tenantIsolation', path: (_, i) => '/crm/contacts/' + workspaces[(i + 1) % 10].contactId + '/profile', expected: 404 },
];
const percentile = (values, p) => values.length ? Math.round(values[Math.ceil(values.length * p) - 1]) : null;
async function run(concurrency, count) {
  const start = performance.now();
  const records = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let i = next++; i < count; i = next++) {
      const operation = workload[i % workload.length];
      const workspace = workspaces[i % workspaces.length];
      const before = performance.now();
      let outcome;
      try {
        const { status, data } = await request(operation.path(workspace, i), workspace.token, operation.body?.(i));
        if (status !== operation.expected) outcome = 'HTTP ' + status;
        else if (['firstPage', 'page100'].includes(operation.name) && data.total !== 3001) outcome = 'invalid total';
        else if (operation.name === 'profile' && data.contact.id !== workspace.contactId) outcome = 'incorrect record';
        else if (operation.name === 'search' && !data.items.every((row) => row.name.startsWith('Load customer 2'))) outcome = 'invalid search';
        else outcome = 'ok';
      } catch (error) {
        outcome = error.name;
      }
      records.push({ name: operation.name, elapsed: performance.now() - before, outcome });
    }
  }));
  const summary = (rows) => {
    const times = rows.map((row) => row.elapsed).sort((a, b) => a - b);
    return {
      requests: rows.length,
      errors: rows.filter((row) => row.outcome !== 'ok').length,
      outcomes: Object.fromEntries([...new Set(rows.map((row) => row.outcome))].map((outcome) =>
        [outcome, rows.filter((row) => row.outcome === outcome).length])),
      p50ms: percentile(times, .5), p95ms: percentile(times, .95), p99ms: percentile(times, .99),
    };
  };
  return {
    concurrency, ...summary(records),
    requestsPerSecond: Math.round(count * 1000 / (performance.now() - start)),
    operations: Object.fromEntries(workload.map(({ name }) => [name, summary(records.filter((row) => row.name === name))])),
  };
}

await run(4, 28);
const stages = [[8, 140], [32, 280], [64, 560]];
if (process.env.CRM_LOAD_INCLUDE_128 === '1') stages.push([128, 896]);
for (const [concurrency, requests] of stages) {
  const result = await run(concurrency, requests);
  console.log(JSON.stringify(result));
  if (result.operations.tenantIsolation.outcomes['HTTP 200']) throw Error('Cross-tenant data returned');
}
