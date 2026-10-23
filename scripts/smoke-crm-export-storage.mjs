import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js'),
  { CrmJobsController, CrmJobs } = local('./dist/business/crm-jobs.js');
const db = new DatabaseService(),
  events = { publish: async () => {} },
  controller = new CrmJobsController(db, events),
  worker = new CrmJobs(db, events, {});
try {
  const r = await fetch((process.env.SMOKE_API_URL || 'http://localhost:4122') + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `export-storage-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Storage fixture',
      workspaceName: 'Storage fixture',
    }),
  });
  assert.equal(r.status, 201);
  const a = await r.json(),
    req = {
      user: {
        tenantId: a.tenantId,
        userId: JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub,
      },
    };
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "INSERT INTO contacts(tenant_id,name) SELECT $1,'Frozen '||n FROM generate_series(1,5000) n",
      [a.tenantId],
    ),
  );
  const job = await controller.create(req, { kind: 'export' });
  assert.equal(job.total, 5000);
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE contacts SET name='Mutated after snapshot'"),
  );
  for (let n = 0; n < 10; n++)
    await Promise.all([
      worker.process({ tenantId: a.tenantId, jobId: job.id }),
      worker.process({ tenantId: a.tenantId, jobId: job.id }),
    ]);
  await worker.process({ tenantId: a.tenantId, jobId: job.id });
  const state = await db.withTenant(a.tenantId, async (c) => ({
    job: (
      await c.query(
        'SELECT status,processed,succeeded,pg_column_size(input) AS bytes,result FROM crm_jobs WHERE id=$1',
        [job.id],
      )
    ).rows[0],
    count: (await c.query('SELECT count(*)::int n FROM crm_export_rows WHERE job_id=$1', [job.id]))
      .rows[0].n,
  }));
  assert.equal(state.job.status, 'completed');
  assert.equal(state.job.processed, 5000);
  assert.equal(state.job.succeeded, 5000);
  assert.equal(state.count, 5000);
  assert.ok(state.job.bytes < 1024);
  assert.deepEqual(state.job.result, []);
  const seen = new Set();
  let after = 0;
  do {
    const page = await controller.result(req, job.id, { after, limit: 137 });
    assert.ok(page.result.length <= 137);
    for (const row of page.result) {
      assert.ok(row.name.startsWith('Frozen '));
      assert.ok(!seen.has(row.id));
      seen.add(row.id);
    }
    after = page.nextAfter;
  } while (after !== null);
  assert.equal(seen.size, 5000);
  // Storage is append-only for the application role; immutable snapshots cannot be rewritten.
  await assert.rejects(
    db.withTenant(a.tenantId, (c) =>
      c.query("UPDATE crm_export_rows SET payload='{}' WHERE job_id=$1", [job.id]),
    ),
  );
  // Backward-compatible legacy job results remain readable.
  const legacy = await db.withTenant(
    a.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO crm_jobs(tenant_id,kind,status,input,result,total,processed,succeeded) VALUES($1,'export','completed','{}','[{\"name\":\"Legacy row\"}]',1,1,1) RETURNING id",
          [a.tenantId],
        )
      ).rows[0],
  );
  assert.equal((await controller.result(req, legacy.id)).result[0].name, 'Legacy row');
  console.log(
    'CRM ordinal storage: 5000 frozen profiles, concurrent workers/replay, constant-size metadata/no result JSON copying, exact complete bounded paging, immutable payload and legacy compatibility passed.',
  );
} finally {
  await db.onModuleDestroy();
}
