import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { CrmJobsController, CrmJobs } = require('./dist/business/crm-jobs.js');
const db = new DatabaseService(),
  events = { publish: async () => {} };
const controller = new CrmJobsController(db, events),
  worker = new CrmJobs(db, events, {});
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const res = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `snapshot-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Snapshot fixture',
      workspaceName: 'Snapshot fixture',
    }),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  return {
    user: {
      tenantId: data.tenantId,
      userId: JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64url')).sub,
    },
  };
}
try {
  const a = await fixture(),
    b = await fixture();
  await db.withTenant(a.user.tenantId, (c) =>
    c.query(
      "INSERT INTO contacts(tenant_id,name) SELECT $1,'Before '||i FROM generate_series(1,251) i",
      [a.user.tenantId],
    ),
  );
  const job = await controller.create(a, { kind: 'export' });
  assert.equal(job.total, 251);
  await worker.process({ tenantId: a.user.tenantId, jobId: job.id });
  await db.withTenant(a.user.tenantId, (c) =>
    c.query("UPDATE contacts SET name='After',archived_at=now()"),
  );
  await worker.process({ tenantId: a.user.tenantId, jobId: job.id });
  const result = await controller.result(a, job.id);
  let after = 0;
  const paged = [];
  for (;;) {
    const page = await controller.result(a, job.id, { limit: 100, after });
    assert.ok(page.result.length <= 100);
    paged.push(...page.result);
    if (page.nextAfter === null) break;
    assert.ok(page.nextAfter > after);
    after = page.nextAfter;
  }
  assert.deepEqual(paged, result.result);
  assert.throws(() => controller.result(a, job.id, { limit: 0 }));
  assert.equal(result.result.length, 251);
  assert.ok(result.result.every((x) => x.name.startsWith('Before ') && x.archived_at === null));
  assert.ok(result.snapshot_at);
  assert.equal(new Set(result.result.map((x) => x.id)).size, 251);
  await assert.rejects(controller.result(b, job.id));
  const empty = await controller.create(a, { kind: 'export' });
  await worker.process({ tenantId: a.user.tenantId, jobId: empty.id });
  assert.deepEqual((await controller.result(a, empty.id)).result, []);
  console.log(
    'CRM paged results: 251 rows across worker and HTTP pages, mutation/archive isolation, timestamp, empty export and tenant isolation passed.',
  );
} finally {
  await db.onModuleDestroy();
}
