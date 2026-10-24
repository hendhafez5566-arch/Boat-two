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
  const { CrmRetentionController } = require('./dist/business/crm-retention.controller.js'),
    retention = new CrmRetentionController(db);
  let contact;
  await db.withTenant(a.user.tenantId, async (c) => {
    contact = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Retention fixture') RETURNING id",
        [a.user.tenantId],
      )
    ).rows[0].id;
  });
  await db.query('SELECT crm_history_drain(10000)');
  const { Client } = require('pg'),
    admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    for (const days of [102, 101, 100])
      await admin.query(
        "INSERT INTO crm_contact_history(change_id,tenant_id,contact_id,snapshot,deleted,recorded_at) SELECT nextval('crm_contact_changes_id_seq'),tenant_id,contact_id,snapshot,false,now()-make_interval(days=>$2) FROM crm_contact_history WHERE contact_id=$1 ORDER BY recorded_at DESC LIMIT 1",
        [contact, days],
      );
  } finally {
    await admin.end();
  }
  const completed = await controller.create(a, { kind: 'export' }),
    active = await controller.create(a, { kind: 'export' });
  await worker.process({ tenantId: a.user.tenantId, jobId: completed.id });
  await db.withTenant(a.user.tenantId, (c) =>
    c.query("UPDATE crm_jobs SET updated_at=now()-interval '120 days' WHERE id=ANY($1::uuid[])", [
      [completed.id, active.id],
    ]),
  );
  const preview = await retention.preview(a, { days: 90 });
  assert.equal(preview.historyRows, 2);
  assert.equal(preview.jobPayloads, 1);
  await assert.rejects(retention.apply(a, { ...preview, historyRows: 99, confirmed: true }));
  await assert.rejects(retention.apply(b, { ...preview, confirmed: true }));
  await retention.apply(a, { ...preview, confirmed: true });
  await assert.rejects(controller.result(a, completed.id));
  await db.withTenant(a.user.tenantId, async (c) => {
    assert.equal(
      (
        await c.query('SELECT count(*)::int AS n FROM crm_contact_history WHERE contact_id=$1', [
          contact,
        ])
      ).rows[0].n,
      2,
    );
    const job = (await c.query('SELECT * FROM crm_jobs WHERE id=$1', [active.id])).rows[0];
    assert.equal(job.expired_at, null);
    assert.equal(job.input.storage, 'ordinal_rows_v1');
    assert.equal(
      (await c.query('SELECT count(*)::int n FROM crm_export_rows WHERE job_id=$1', [active.id]))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await c.query('SELECT count(*)::int n FROM crm_export_rows WHERE job_id=$1', [completed.id]))
        .rows[0].n,
      0,
    );
    assert.equal((await c.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n, 1);
    assert.ok(
      (await c.query("SELECT 1 FROM audit_logs WHERE action='crm_retention_cleanup'")).rowCount,
    );
  });
  console.log(
    'CRM retention: exact preview guard, predecessor preservation, terminal payload expiration, active/contact preservation, audit and tenant isolation passed.',
  );
} finally {
  await db.onModuleDestroy();
}
