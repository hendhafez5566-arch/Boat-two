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
  worker = new CrmJobs(db, events, {}),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `activity-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Activity fixture',
      workspaceName: 'Activity fixture',
    }),
  });
  assert.equal(r.status, 201);
  const a = await r.json();
  return {
    user: {
      tenantId: a.tenantId,
      userId: JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub,
    },
  };
}
try {
  const a = await fixture(),
    b = await fixture();
  let target, source;
  await db.withTenant(a.user.tenantId, async (c) => {
    target = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Activity target') RETURNING id",
        [a.user.tenantId],
      )
    ).rows[0].id;
    source = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name,merged_into_id) VALUES($1,'Original merged identity',$2) RETURNING id",
        [a.user.tenantId, target],
      )
    ).rows[0].id;
    const channel = (
      await c.query(
        "INSERT INTO channels(tenant_id,type,name,external_id) VALUES($1,'web','Activity fixture',$2) RETURNING id",
        [a.user.tenantId, randomUUID()],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO crm_notes(tenant_id,contact_id,body) SELECT $1,$2,'Retained note '||n FROM generate_series(1,260)n",
      [a.user.tenantId, target],
    );
    await c.query(
      "INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,'opted_in','Original opt-in')",
      [a.user.tenantId, source, channel],
    );
    await c.query(
      "UPDATE contact_consents SET status='opted_out',evidence='Later opt-out' WHERE contact_id=$1",
      [source],
    );
    await c.query(
      "INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at) VALUES($1,$2,'Current task',now())",
      [a.user.tenantId, target],
    );
    const pipeline = (
      await c.query(
        "INSERT INTO crm_pipelines(tenant_id,name,stages) VALUES($1,'Activity pipeline','[\"new\"]') RETURNING id",
        [a.user.tenantId],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO crm_deals(tenant_id,contact_id,pipeline_id,title,stage) VALUES($1,$2,$3,'Current deal','new')",
      [a.user.tenantId, target, pipeline],
    );
    await c.query('INSERT INTO conversations(tenant_id,channel_id,contact_id) VALUES($1,$2,$3)', [
      a.user.tenantId,
      channel,
      target,
    ]);
    await c.query(
      "INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES($1,'fixture.activity',$2,$3,$4)",
      [
        a.user.tenantId,
        target,
        JSON.stringify({ contactId: source, secretShouldNotBeExported: 'local-only-sentinel' }),
        randomUUID(),
      ],
    );
  });
  await db.query('SELECT crm_history_drain(10000)');
  const job = await controller.create(a, { kind: 'activity_export', contactId: target });
  assert.ok(job.total >= 268);
  await db.withTenant(a.user.tenantId, (c) =>
    c.query("UPDATE crm_notes SET body='Mutated after freeze' WHERE contact_id=$1", [target]),
  );
  for (let i = 0; i < Math.ceil(job.total / 250); i++)
    await worker.process({ tenantId: a.user.tenantId, jobId: job.id });
  const result = await controller.result(a, job.id),
    kinds = new Set(result.result.map((x) => x.kind));
  for (const kind of [
    'profile_history',
    'consent_history',
    'note',
    'task_current',
    'deal_current',
    'conversation',
    'event',
  ])
    assert.ok(kinds.has(kind), kind);
  assert.equal(result.result.filter((x) => x.kind === 'note').length, 260);
  assert.ok(
    result.result
      .filter((x) => x.kind === 'note')
      .every((x) => x.data.body.startsWith('Retained note ')),
  );
  assert.ok(
    result.result.some(
      (x) =>
        x.kind === 'consent_history' &&
        x.data.contact_id === source &&
        x.data.status === 'opted_out',
    ),
  );
  assert.ok(!JSON.stringify(result).includes('local-only-sentinel'));
  assert.equal(result.contact_id, target);
  assert.match(result.history_semantics, /retained_observed/);
  await assert.rejects(controller.result(b, job.id));
  await assert.rejects(controller.create(b, { kind: 'activity_export', contactId: target }));
  await assert.rejects(controller.create(a, { kind: 'activity_export', contactId: source }));
  await assert.rejects(
    controller.create(a, {
      kind: 'activity_export',
      contactId: target,
      from: '2026-10-24T00:00:00Z',
      to: '2026-10-23T00:00:00Z',
    }),
  );
  const empty = await controller.create(a, {
    kind: 'activity_export',
    contactId: target,
    from: '2099-01-01T00:00:00Z',
  });
  await worker.process({ tenantId: a.user.tenantId, jobId: empty.id });
  assert.deepEqual((await controller.result(a, empty.id)).result, []);
  console.log(
    'CRM activity: complete 260-note frozen export, merged original consent/history, current tasks/deals, conversation/event metadata without raw event secrets, bounded worker pages, date range, empty export and tenant isolation passed.',
  );
} finally {
  await db.onModuleDestroy();
}
