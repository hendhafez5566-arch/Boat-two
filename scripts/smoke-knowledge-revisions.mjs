import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { PlansService } = require('./dist/plans/plans.service.js');
const { EventsService } = require('./dist/events/events.service.js');
const { KnowledgeService } = require('./dist/ai/knowledge/knowledge.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { env } = require('./dist/config/env.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  events = new EventsService(db, new EventEmitter2()),
  base = process.env.SMOKE_API_URL || 'http://localhost:4124';
const vector = Array(1536).fill(0);
vector[0] = 1;
let embeddingCalls = 0;
const knowledge = new KnowledgeService(db, plans, events, {
  configured: true,
  embed: async () => {
    embeddingCalls++;
    return [vector];
  },
});
const original = env.AI_PROVIDER_CALLS_ENABLED;
async function req(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, status, method + ' ' + path + ': ' + data.message);
  return data;
}
try {
  const register = () =>
    req(
      '/auth/register',
      null,
      'POST',
      {
        email: `revision-${randomUUID()}@example.test`,
        password: randomBytes(20).toString('hex'),
        fullName: 'Knowledge revision fixture',
        workspaceName: 'Knowledge revision fixture',
      },
      201,
    );
  const a = await register(),
    b = await register();
  const initialContent = 'Initial knowledge content retained for revision and search validation.';
  const source = await req(
      '/ai/knowledge',
      a.accessToken,
      'POST',
      { type: 'text', title: 'First revision', content: initialContent },
      201,
    ),
    path = '/ai/knowledge/' + source.id;
  assert.equal(source.revision, 1);
  await req(path + '/edit', b.accessToken, 'GET', undefined, 404);
  await req(
    path,
    a.accessToken,
    'PATCH',
    { type: 'text', title: 'Blocked edit', content: initialContent, expectedRevision: 1 },
    409,
  );
  const firstJob = (await req('/ai/knowledge-jobs', a.accessToken)).jobs.find(
    (job) => job.source_id === source.id,
  );
  await req('/ai/knowledge-jobs/' + firstJob.id + '/cancel', a.accessToken, 'POST', undefined, 201);
  const edited = await req(path, a.accessToken, 'PATCH', {
    type: 'text',
    title: 'Second revision',
    content: 'Updated source content with enough information for our local test.',
    expectedRevision: 1,
  });
  assert.equal(edited.revision, 2);
  await req(
    path,
    a.accessToken,
    'PATCH',
    { type: 'text', title: 'Stale edit', content: initialContent, expectedRevision: 1 },
    409,
  );
  const detail = await req(path + '/edit', a.accessToken);
  assert.equal(detail.history.length, 2);
  assert.equal((await req(path + '/revisions/1', a.accessToken)).content, initialContent);
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE knowledge_jobs SET status='failed' WHERE id=$1", [firstJob.id]),
  );
  await req('/ai/knowledge-jobs/' + firstJob.id + '/resume', a.accessToken, 'POST', undefined, 400);
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      'INSERT INTO knowledge_chunks(tenant_id,source_id,chunk_index,content,search_text,embedding) VALUES($1,$2,0,$3,$3,$4::vector)',
      [a.tenantId, source.id, 'retained reference knowledge', JSON.stringify(vector)],
    ),
  );
  env.AI_PROVIDER_CALLS_ENABLED = 'true';
  assert.equal((await knowledge.search(a.tenantId, 'reference')).length, 1);
  await req(path + '/archive', a.accessToken, 'PATCH', { archived: true });
  const beforeArchivedSearch = embeddingCalls;
  assert.equal(
    (await knowledge.search(a.tenantId, 'reference')).length,
    0,
    'Archived source is excluded from vector and keyword retrieval',
  );
  assert.equal(
    embeddingCalls,
    beforeArchivedSearch,
    'Archived-only knowledge does not spend query embedding budget',
  );
  assert.equal((await req(path + '/edit', a.accessToken)).history.length, 2);
  const retained = await db.withTenant(a.tenantId, (c) =>
    c.query('SELECT count(*)::int AS n FROM knowledge_chunks WHERE source_id=$1', [source.id]),
  );
  assert.equal(retained.rows[0].n, 1);
  await req(path + '/reindex', a.accessToken, 'POST', undefined, 400);
  await req(path + '/archive', a.accessToken, 'PATCH', { archived: false });
  assert.equal((await knowledge.search(a.tenantId, 'reference')).length, 1);
  const queued = await req(path + '/reindex', a.accessToken, 'POST', undefined, 201);
  assert.ok(queued.jobId);
  await db.withTenant(a.tenantId, (c) =>
    c.query('UPDATE knowledge_jobs SET source_revision=1 WHERE id=$1', [queued.jobId]),
  );
  await knowledge.process({ tenantId: a.tenantId, jobId: queued.jobId });
  const old = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT status FROM knowledge_jobs WHERE id=$1', [queued.jobId]),
    )
  ).rows[0];
  assert.equal(old.status, 'canceled');
  console.log(
    'PASS knowledge revisions: active-job conflict, optimistic source saves, immutable history, stale resume/worker rejection, cross-tenant denial, archive/restore and retained-but-excluded vector/keyword index. All embeddings mocked.',
  );
} finally {
  env.AI_PROVIDER_CALLS_ENABLED = original;
  await db.onModuleDestroy();
}
