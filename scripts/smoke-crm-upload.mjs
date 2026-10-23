import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = local('./dist/database/database.service.js'),
  { CrmJobs } = local('./dist/business/crm-jobs.js'),
  { CrmService } = local('./dist/business/crm.service.js'),
  { PlansService } = local('./dist/plans/plans.service.js'),
  { CrmRetentionController } = local('./dist/business/crm-retention.controller.js');
const db = new DatabaseService(),
  worker = new CrmJobs(db, { publish: async () => {} }, new CrmService(db, new PlansService(db))),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function call(path, token, body, method = body ? 'POST' : 'GET', status = body ? 201 : 200) {
  const r = await fetch(base + path, {
    method,
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
const register = () =>
  call('/auth/register', null, {
    email: `upload-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Upload fixture',
    workspaceName: 'Upload fixture',
  });
try {
  const a = await register(),
    b = await register(),
    fingerprint = randomBytes(32).toString('hex'),
    contacts = Array.from({ length: 250 }, (_, i) => ({
      name: 'Uploaded ' + i,
      email: `${randomUUID()}@example.test`,
    }));
  contacts.push(contacts[0]);
  const path = '/crm/jobs',
    job = await call(path + '/uploads', a.accessToken, { total: 251, fingerprint });
  assert.equal(job.status, 'uploading');
  assert.equal(
    (await call(path + '/uploads', a.accessToken, { total: 251, fingerprint })).id,
    job.id,
  );
  const send = (after, rows, token = a.accessToken, status = 201) =>
    call(path + '/' + job.id + '/upload', token, { after, rows }, 'POST', status);
  await send(0, contacts.slice(0, 100));
  await send(0, contacts.slice(0, 100));
  await send(0, [{ name: 'Changed retry' }], a.accessToken, 409);
  await send(101, [{ name: 'Out of order' }], a.accessToken, 400);
  await send(100, [contacts[100]], b.accessToken, 404);
  await worker.process({ tenantId: a.tenantId, jobId: job.id });
  assert.equal((await call('/crm/contacts', a.accessToken)).total, 0);
  await call(path + '/' + job.id + '/complete-upload', a.accessToken, undefined, 'POST', 400);
  const race = await Promise.all([
    send(100, contacts.slice(100, 200)),
    send(100, contacts.slice(100, 200)),
  ]);
  assert.ok(race.every((x) => x.uploaded === 200));
  await send(200, contacts.slice(200));
  assert.equal(
    (await call(path + '/' + job.id + '/complete-upload', a.accessToken, undefined, 'POST', 201))
      .queued,
    true,
  );
  assert.equal(
    (await call(path + '/' + job.id + '/complete-upload', a.accessToken, undefined, 'POST', 201))
      .queued,
    false,
  );
  for (let attempt = 0; attempt < 3; attempt++)
    await worker.process({ tenantId: a.tenantId, jobId: job.id });
  const result = await call(path + '/' + job.id + '/result', a.accessToken);
  assert.equal(result.processed, 251);
  assert.equal(result.succeeded, 250);
  assert.equal(result.errors.length, 1);
  assert.equal((await call('/crm/contacts', a.accessToken)).total, 250);
  const state = await db.withTenant(
    a.tenantId,
    async (c) =>
      (await c.query('SELECT pg_column_size(input) bytes FROM crm_jobs WHERE id=$1', [job.id]))
        .rows[0],
  );
  assert.ok(state.bytes < 1024);
  const other = await db.withTenant(
    b.tenantId,
    async (c) =>
      (await c.query('SELECT count(*)::int n FROM crm_import_rows WHERE job_id=$1', [job.id]))
        .rows[0].n,
  );
  assert.equal(other, 0);
  const canceled = await call(path + '/uploads', a.accessToken, {
    total: 2,
    fingerprint: randomBytes(32).toString('hex'),
  });
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE crm_jobs SET input=jsonb_set(input,'{uploadedBytes}','12000000') WHERE id=$1", [
      canceled.id,
    ]),
  );
  await call(
    path + '/' + canceled.id + '/upload',
    a.accessToken,
    { after: 0, rows: [{ name: 'Budget refused' }] },
    'POST',
    400,
  );
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE crm_jobs SET input=jsonb_set(input,'{uploadedBytes}','0') WHERE id=$1", [
      canceled.id,
    ]),
  );
  await call(path + '/' + canceled.id + '/upload', a.accessToken, {
    after: 0,
    rows: [{ name: 'Canceled row' }],
  });
  await call(path + '/' + canceled.id + '/cancel', a.accessToken, undefined, 'PATCH', 200);
  await call(
    path + '/' + canceled.id + '/upload',
    a.accessToken,
    { after: 1, rows: [{ name: 'Refused' }] },
    'POST',
    409,
  );
  await call(path + '/' + canceled.id + '/complete-upload', a.accessToken, undefined, 'POST', 409);
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE crm_jobs SET updated_at=now()-interval '120 days' WHERE id=$1", [canceled.id]),
  );
  await db.query('SELECT crm_history_drain(10000)');
  const req = {
      user: {
        tenantId: a.tenantId,
        userId: JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub,
      },
    },
    retention = new CrmRetentionController(db),
    preview = await retention.preview(req, { days: 90 });
  await retention.apply(req, { ...preview, confirmed: true });
  const remaining = await db.withTenant(
    a.tenantId,
    async (c) =>
      (await c.query('SELECT count(*)::int n FROM crm_import_rows WHERE job_id=$1', [canceled.id]))
        .rows[0].n,
  );
  assert.equal(remaining, 0);
  console.log(
    'CRM upload: durable resume, exact retry verification, concurrent duplicate chunks, ordered offsets, finalize-once, no early processing, 251 rows/250 successes/one duplicate, constant metadata, cancellation, retention and tenant isolation passed.',
  );
} finally {
  await db.onModuleDestroy();
}
