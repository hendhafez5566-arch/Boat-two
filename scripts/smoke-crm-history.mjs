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
  let contact;
  await db.withTenant(a.user.tenantId, async (c) => {
    contact = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Historical before') RETURNING id",
        [a.user.tenantId],
      )
    ).rows[0].id;
  });
  await db.query('SELECT crm_history_drain(10000)');
  const asOf = (
    await db.query(
      'SELECT to_char(clock_timestamp() AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS at',
    )
  ).rows[0].at;
  await db.withTenant(a.user.tenantId, (c) =>
    c.query("UPDATE contacts SET name='Historical after',archived_at=now() WHERE id=$1", [contact]),
  );
  await db.query('SELECT crm_history_drain(10000)');
  const job = await controller.create(a, { kind: 'export', asOf });
  await worker.process({ tenantId: a.user.tenantId, jobId: job.id });
  const result = await controller.result(a, job.id);
  assert.equal(result.result.length, 1);
  assert.equal(result.result[0].name, 'Historical before');
  assert.equal(result.result[0].archived_at, null);
  await assert.rejects(controller.create(a, { kind: 'export', asOf: '2020-01-01T00:00:00Z' }));
  await assert.rejects(controller.create(a, { kind: 'export', asOf: '2099-01-01T00:00:00Z' }));
  const foreign = await controller.create(b, {
    kind: 'export',
    asOf: (
      await db.query(
        'SELECT to_char(clock_timestamp() AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS at',
      )
    ).rows[0].at,
  });
  await worker.process({ tenantId: b.user.tenantId, jobId: foreign.id });
  assert.deepEqual((await controller.result(b, foreign.id)).result, []);
  await assert.rejects(
    db.withTenant(a.user.tenantId, async (c) => {
      await c.query("UPDATE contacts SET name='Rolled back' WHERE id=$1", [contact]);
      throw new Error('fixture rollback');
    }),
  );
  await db.query('SELECT crm_history_drain(10000)');
  await db.withTenant(a.user.tenantId, async (c) => {
    assert.equal(
      (await c.query("SELECT 1 FROM crm_contact_history WHERE snapshot->>'name'='Rolled back'"))
        .rowCount,
      0,
    );
  });
  console.log(
    'CRM observed history: committed before/after snapshots, historical export values/filtering, coverage/future denial, rollback exclusion and tenant isolation passed.',
  );
} finally {
  await db.onModuleDestroy();
}
