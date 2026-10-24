import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');
const { parseWhatsApp } = require('./dist/messaging/webhook-parsers.js');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.SMOKE_API_URL || 'http://localhost:4000';
async function api(path, token, method = 'GET', body, status = 200) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, status, `${method} ${path}: unexpected status`);
  return data;
}
async function scoped(tenant, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function waitFor(fn) {
  for (let n = 0; n < 100; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Worker did not reach the expected state');
}
try {
  const user = await api(
    '/auth/register',
    null,
    'POST',
    {
      email: `worker-${randomBytes(8).toString('hex')}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'Worker smoke',
      workspaceName: 'Worker smoke',
    },
    201,
  );
  const token = user.accessToken;
  // Explicit local test fixture; no provider send is possible: no flow or AI is enabled here.
  const phone = randomBytes(8).toString('hex');
  const ch = await api(
    '/channels',
    token,
    'POST',
    {
      type: 'whatsapp',
      name: 'Worker local fixture',
      credentials: { phoneNumberId: phone, accessToken: 'smoke-test-only-token-not-real' },
    },
    201,
  );
  await api('/channels/' + ch.id, token, 'PATCH', { status: 'disabled' });
  const event = parseWhatsApp({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phone },
              messages: [
                {
                  id: 'worker-' + randomBytes(8).toString('hex'),
                  from: 'test-visitor',
                  type: 'text',
                  text: { body: 'Worker integration fixture' },
                },
              ],
            },
          },
        ],
      },
    ],
  })[0];
  const job = await scoped(
    user.tenantId,
    async (c) =>
      (
        await c.query(
          'INSERT INTO webhook_jobs(tenant_id,channel_id,dedupe_key,payload) VALUES($1,$2,$3,$4) RETURNING id',
          [user.tenantId, ch.id, randomBytes(16).toString('hex'), JSON.stringify(event)],
        )
      ).rows[0],
  );
  await waitFor(async () =>
    scoped(user.tenantId, async (c) => {
      const row = (await c.query('SELECT status,attempts FROM webhook_jobs WHERE id=$1', [job.id]))
        .rows[0];
      if (row.status === 'failed') {
        assert.equal(row.attempts, 5);
        return true;
      }
      if (row.status === 'pending')
        await c.query('UPDATE webhook_jobs SET available_at=now() WHERE id=$1', [job.id]);
      return false;
    }),
  );
  const history = await api(`/channels/${ch.id}/webhook-jobs`, token);
  assert.equal(history[0].status, 'failed');
  await api('/channels/' + ch.id, token, 'PATCH', { status: 'active' });
  await api(`/channels/${ch.id}/webhook-jobs/${job.id}/retry`, token, 'POST', undefined, 201);
  await waitFor(async () =>
    scoped(
      user.tenantId,
      async (c) =>
        (await c.query('SELECT status FROM webhook_jobs WHERE id=$1', [job.id])).rows[0].status ===
        'completed',
    ),
  );
  const conversations = await api('/conversations', token);
  assert.equal(conversations.items.length, 1);
  const messages = await api(`/conversations/${conversations.items[0].id}/messages`, token);
  assert.equal(messages.items.filter((m) => m.direction === 'in').length, 1);
  console.log(
    'PASS worker integration: parsed provider event, five failed attempts, dead-letter listing, manual retry, durable completion and actual inbound persistence. No provider calls made.',
  );
} finally {
  await pool.end();
}
