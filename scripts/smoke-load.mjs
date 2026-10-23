import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function register(name) {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `load-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Local load fixture',
      workspaceName: name,
    }),
  });
  assert.equal(r.status, 201);
  return r.json();
}
try {
  const a = await register('Bounded load workspace'),
    b = await register('Isolated load workspace');
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "INSERT INTO contacts(tenant_id,name) SELECT $1,'Synthetic load contact '||lpad(n::text,4,'0') FROM generate_series(1,2000) n",
      [a.tenantId],
    ),
  );
  const timings = [],
    concurrency = 8,
    requests = 160;
  let next = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < requests) {
        const index = next++,
          foreign = index % 8 === 0,
          started = performance.now();
        const response = await fetch(base + '/crm/contacts?limit=25&page=' + ((index % 20) + 1), {
          headers: { Authorization: 'Bearer ' + (foreign ? b : a).accessToken },
        });
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.ok(data.items.length <= 25);
        assert.equal(data.total, foreign ? 0 : 2000);
        if (!foreign)
          assert.ok(data.items.every((row) => row.name.startsWith('Synthetic load contact ')));
        timings.push(performance.now() - started);
      }
    }),
  );
  timings.sort((x, y) => x - y);
  const elapsedMs = performance.now() - start,
    result = {
      fixtureContacts: 2000,
      requests,
      concurrency,
      elapsedMs: Math.round(elapsedMs),
      requestsPerSecond: Number(((requests * 1000) / elapsedMs).toFixed(2)),
      p50Ms: Math.round(timings[Math.floor(timings.length * 0.5)]),
      p95Ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
      maxMs: Math.round(timings.at(-1)),
      tenantIsolation: true,
      failures: 0,
      scope:
        'Local bounded authenticated CRM reads only; no production capacity claim or provider calls',
    };
  if (process.env.BOAT_LOAD_REPORT)
    await writeFile(process.env.BOAT_LOAD_REPORT, JSON.stringify(result, null, 2) + '\n');
  assert.ok(result.maxMs < 10000, 'Bounded local read should complete within ten seconds');
  console.log(JSON.stringify(result));
} finally {
  await db.onModuleDestroy();
}
