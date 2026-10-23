import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { EventsService } = require('./dist/events/events.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { KnowledgeRetention } = require('./dist/ai/knowledge/retention.js');
const db = new DatabaseService(),
  retention = new KnowledgeRetention(db, new EventsService(db, new EventEmitter2()));
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `retention-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'Retention fixture',
      workspaceName: 'Retention fixture',
    }),
  });
  assert.equal(r.status, 201);
  const a = await r.json();
  a.user = JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub;
  return a;
}
try {
  const a = await fixture(),
    b = await fixture(),
    source = randomUUID();
  await db.withTenant(a.tenantId, async (c) => {
    await c.query(
      "INSERT INTO knowledge_sources(id,tenant_id,type,title,content,status,created_by) VALUES($1,$2,'text','Retention fixture','Current authoritative content must survive cleanup','ready',$3)",
      [source, a.tenantId, a.user],
    );
    await c.query(
      "INSERT INTO knowledge_jobs(tenant_id,source_id,status,raw_file,chunks,prepared,updated_at) SELECT $1,$2,'canceled',decode('616263','hex'),'[{\"content\":\"old job payload\"}]','[{\"vector\":[1]}]',now()-interval '60 days' FROM generate_series(1,120)",
      [a.tenantId, source],
    );
    const ids = (
      await c.query('SELECT id FROM knowledge_jobs WHERE source_id=$1 ORDER BY id LIMIT 2', [
        source,
      ])
    ).rows;
    for (let i = 0; i < 2; i++)
      await c.query(
        "INSERT INTO knowledge_extractions(tenant_id,source_id,job_id,source_revision,title,content,content_sha256,content_chars,created_at) VALUES($1,$2,$3,1,'Snapshot','Retained snapshot fixture','hash',25,now()-make_interval(days=>$4))",
        [a.tenantId, source, ids[i].id, i === 0 ? 60 : 40],
      );
    await c.query(
      "INSERT INTO knowledge_jobs(tenant_id,source_id,status,raw_file,updated_at) VALUES($1,$2,'failed',decode('616263','hex'),now()-interval '60 days'),($1,$2,'blocked',decode('616263','hex'),now()-interval '60 days')",
      [a.tenantId, source],
    );
  });
  const preview = await retention.preview(a.tenantId, 30);
  assert.equal(preview.jobs, 120);
  assert.equal(preview.extractions, 1);
  const run = await retention.create(a.tenantId, a.user, 30);
  await assert.rejects(() => retention.create(a.tenantId, a.user, 30), /pending/);
  await retention.process({ tenantId: a.tenantId, id: run.id });
  let state = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT * FROM knowledge_retention_runs WHERE id=$1', [run.id]),
    )
  ).rows[0];
  assert.equal(state.status, 'pending');
  assert.equal(state.jobs_purged, 100);
  await retention.process({ tenantId: a.tenantId, id: run.id });
  state = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT * FROM knowledge_retention_runs WHERE id=$1', [run.id]),
    )
  ).rows[0];
  assert.equal(state.status, 'completed');
  assert.equal(state.jobs_purged, 120);
  assert.equal(state.extractions_purged, 1);
  const remaining = await retention.preview(a.tenantId, 30);
  assert.equal(remaining.jobs, 0);
  assert.equal(remaining.extractions, 0);
  const snapshots = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT * FROM knowledge_extractions WHERE source_id=$1 ORDER BY created_at', [
        source,
      ]),
    )
  ).rows;
  assert.equal(snapshots[0].content, null);
  assert.ok(snapshots[0].purged_at);
  assert.equal(snapshots[1].content, 'Retained snapshot fixture');
  assert.equal(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query(
          "SELECT * FROM knowledge_jobs WHERE source_id=$1 AND status IN ('failed','blocked') AND raw_file IS NOT NULL",
          [source],
        ),
      )
    ).rowCount,
    2,
  );
  assert.equal(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT content FROM knowledge_sources WHERE id=$1', [source]),
      )
    ).rows[0].content,
    'Current authoritative content must survive cleanup',
  );
  assert.equal((await retention.preview(b.tenantId, 30)).jobs, 0);
  assert.equal(
    (await db.withTenant(b.tenantId, (c) => c.query('SELECT * FROM knowledge_retention_runs')))
      .rowCount,
    0,
  );
  console.log(
    'PASS knowledge retention: frozen cutoff, 100-item chunks, resumable/active protection, latest snapshot retention, hash/history tombstones, no source removal and tenant isolation.',
  );
} finally {
  await db.onModuleDestroy();
}
