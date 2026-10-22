import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const db = new DatabaseService();
const base = process.env.SMOKE_API_URL || 'http://localhost:4000';
async function wait(fn) {
  for (let i = 0; i < 100; i++) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for durable state');
}
try {
  const response = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'reliability-' + randomUUID() + '@example.test',
      password: randomBytes(20).toString('hex'),
      fullName: 'Reliability fixture',
      workspaceName: 'Reliability fixture',
    }),
  });
  assert.equal(response.status, 201);
  const a = await response.json();
  let release;
  let inserted;
  const insertedGate = new Promise((r) => (inserted = r)),
    releaseGate = new Promise((r) => (release = r));
  const late = db.detached(a.tenantId, async (c) => {
    const row = (
      await c.query('INSERT INTO realtime_events(tenant_id,payload) VALUES($1,$2) RETURNING id', [
        a.tenantId,
        JSON.stringify({
          type: 'conversation',
          conversationId: randomUUID(),
          reason: 'late commit test',
        }),
      ])
    ).rows[0];
    inserted(row.id);
    await releaseGate;
    return row.id;
  });
  const lateSource = await insertedGate;
  const earlySource = await db.detached(
    a.tenantId,
    async (c) =>
      (
        await c.query('INSERT INTO realtime_events(tenant_id,payload) VALUES($1,$2) RETURNING id', [
          a.tenantId,
          JSON.stringify({
            type: 'conversation',
            conversationId: randomUUID(),
            reason: 'early commit test',
          }),
        ])
      ).rows[0].id,
  );
  const earlyCursor = await wait(async () => {
    await db.query('SELECT materialize_realtime(1000)');
    return db.detached(
      a.tenantId,
      async (c) =>
        (await c.query('SELECT id FROM stream_events WHERE source_id=$1', [earlySource])).rows[0]
          ?.id,
    );
  });
  release();
  await late;
  const lateCursor = await wait(async () => {
    await db.query('SELECT materialize_realtime(1000)');
    return db.detached(
      a.tenantId,
      async (c) =>
        (await c.query('SELECT id FROM stream_events WHERE source_id=$1', [lateSource])).rows[0]
          ?.id,
    );
  });
  assert.ok(
    BigInt(lateCursor) > BigInt(earlyCursor),
    'Replay cursor must follow commit visibility, not source sequence allocation',
  );
  const after = await db.detached(
    a.tenantId,
    async (c) =>
      (await c.query('SELECT source_id FROM stream_events WHERE id>$1', [earlyCursor])).rows,
  );
  assert.ok(after.some((x) => String(x.source_id) === String(lateSource)));
  // Independent connections contend for the same conversation lock; no in-memory mutex is involved.
  let unlock;
  let locked;
  const lockedGate = new Promise((r) => (locked = r)),
    unlockGate = new Promise((r) => (unlock = r));
  const conversation = randomUUID();
  const owner = db.conversation(a.tenantId, conversation, async () => {
    locked();
    await unlockGate;
  });
  await lockedGate;
  let secondEntered = false;
  const second = db.detached(a.tenantId, async () =>
    db.conversation(a.tenantId, conversation, async () => {
      secondEntered = true;
    }),
  );
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(secondEntered, false);
  unlock();
  await owner;
  await second;
  assert.equal(secondEntered, true);
  console.log(
    'PASS reliability: independent PostgreSQL conversation locks and replay of late-committing realtime events without cursor loss.',
  );
} finally {
  await db.onModuleDestroy();
}
