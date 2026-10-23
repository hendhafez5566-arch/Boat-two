import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
const { DatabaseService } = require('./dist/database/database.service.js');
const { PlansService } = require('./dist/plans/plans.service.js');
const { EventsService } = require('./dist/events/events.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { KnowledgeService } = require('./dist/ai/knowledge/knowledge.service.js');
const { KnowledgeJobsController } = require('./dist/ai/knowledge/jobs.controller.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  events = new EventsService(db, new EventEmitter2());
const vector = Array(1536).fill(0);
vector[0] = 1;
let calls = 0;
const knowledge = new KnowledgeService(db, plans, events, {
    configured: true,
    embed: async (t, texts) => {
      calls++;
      return texts.map(() => vector);
    },
  }),
  jobs = new KnowledgeJobsController(db, events, plans);
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `file-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'File fixture',
      workspaceName: 'File fixture',
    }),
  });
  assert.equal(r.status, 201);
  const a = await r.json();
  a.user = JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub;
  return a;
}
const file = (text, name = 'fixture.txt') => ({ name, mime: 'text/plain', buf: Buffer.from(text) });
try {
  const a = await fixture(),
    b = await fixture(),
    first = 'Original file text remains available until the replacement index is ready.',
    next = 'Replacement file text is extracted durably before any paid embedding is attempted.';
  const source = await knowledge.createFromFile(a.tenantId, a.user, file(first));
  const pending = async () =>
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT * FROM knowledge_jobs WHERE source_id=$1 ORDER BY created_at DESC', [
          source.id,
        ]),
      )
    ).rows[0];
  await assert.rejects(
    () => knowledge.replaceFile(a.tenantId, a.user, source.id, 1, file(next)),
    /active indexing/,
  );
  env.AI_PROVIDER_CALLS_ENABLED = 'true';
  await knowledge.process({ tenantId: a.tenantId, jobId: (await pending()).id });
  assert.equal(calls, 1);
  const agent = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('INSERT INTO ai_agents(tenant_id,name,source_ids) VALUES($1,$2,$3) RETURNING id', [
        a.tenantId,
        'File-linked agent',
        [source.id],
      ]),
    )
  ).rows[0];
  const replaced = await knowledge.replaceFile(
    a.tenantId,
    a.user,
    source.id,
    1,
    file(next, 'new.txt'),
  );
  assert.equal(replaced.id, source.id);
  assert.equal(replaced.revision, 2);
  await assert.rejects(
    () => knowledge.replaceFile(a.tenantId, a.user, source.id, 1, file(next)),
    /changed/,
  );
  const oldIndex = async () =>
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT content FROM knowledge_chunks WHERE source_id=$1', [source.id]),
      )
    ).rows
      .map((r) => r.content)
      .join(' ');
  assert.match(await oldIndex(), /Original/);
  env.AI_PROVIDER_CALLS_ENABLED = 'false';
  await knowledge.process({ tenantId: a.tenantId, jobId: replaced.jobId });
  assert.equal(calls, 1);
  assert.equal((await pending()).status, 'blocked');
  assert.equal((await pending()).raw_file, null);
  assert.match(await oldIndex(), /Original/);
  const snapshots = await knowledge.extractions(a.tenantId, source.id);
  assert.equal(snapshots.length, 2);
  const second = snapshots.find((r) => r.source_revision === 2);
  assert.equal((await knowledge.extractions(a.tenantId, source.id, second.id)).content, next);
  const revision = await knowledge.revisionDetails(a.tenantId, source.id, 2);
  assert.equal(revision.file_bytes, Buffer.byteLength(next));
  assert.equal(revision.file_sha256, createHash('sha256').update(next).digest('hex'));
  await assert.rejects(() => knowledge.extractions(b.tenantId, source.id, second.id));
  const req = { user: { tenantId: a.tenantId } };
  await jobs.resume(req, replaced.jobId);
  env.AI_PROVIDER_CALLS_ENABLED = 'true';
  await knowledge.process({ tenantId: a.tenantId, jobId: replaced.jobId });
  assert.match(await oldIndex(), /Replacement/);
  assert.deepEqual(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT source_ids FROM ai_agents WHERE id=$1', [agent.id]),
      )
    ).rows[0].source_ids,
    [source.id],
  );
  const race = await Promise.allSettled([
    knowledge.replaceFile(
      a.tenantId,
      a.user,
      source.id,
      2,
      file('Concurrent file version one with enough readable text.'),
    ),
    knowledge.replaceFile(
      a.tenantId,
      a.user,
      source.id,
      2,
      file('Concurrent file version two with enough readable text.'),
    ),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.throws(
    () => knowledge.replaceFile(a.tenantId, a.user, source.id, 3, file('invalid', 'payload.exe')),
    /extension/,
  );
  console.log(
    'PASS file replacement: stable source/agent links, revisions and content hashes, active/stale/conflicting writes, prior-index preservation, durable extraction before blocked embedding, mocked publication and tenant isolation.',
  );
} finally {
  env.AI_PROVIDER_CALLS_ENABLED = 'false';
  await db.onModuleDestroy();
}
