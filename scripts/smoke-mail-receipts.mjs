import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const db = new DatabaseService();
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
    b = await fixture(),
    { MailReceiptController, MailReviewController } = require('./dist/mail/receipts.controller.js'),
    { env } = require('./dist/config/env.js'),
    { createHmac } = await import('node:crypto');
  const receipt = new MailReceiptController(db),
    review = new MailReviewController(db);
  env.EMAIL_RECEIPT_SECRET = 'local_receipt_signing_fixture_32_characters';
  const job = await db.withTenant(
    a.user.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO invitation_mail_jobs(tenant_id,status,provider_id) VALUES($1,'accepted','provider-fixture') RETURNING id",
          [a.user.tenantId],
        )
      ).rows[0].id,
  );
  const event = {
    eventId: 'delivered-fixture',
    tenantId: a.user.tenantId,
    jobId: job,
    providerId: 'provider-fixture',
    status: 'delivered',
    occurredAt: new Date(Date.now() - 60000).toISOString(),
  };
  const signed = (body) => {
    const rawBody = Buffer.from(JSON.stringify(body)),
      timestamp = Math.floor(Date.now() / 1000).toString();
    return {
      rawBody,
      headers: {
        'x-boat-timestamp': timestamp,
        'x-boat-signature': createHmac('sha256', env.EMAIL_RECEIPT_SECRET)
          .update(timestamp + '.')
          .update(rawBody)
          .digest('hex'),
      },
    };
  };
  assert.throws(() => receipt.receipt(signed(event), event));
  env.EMAIL_RECEIPTS_ENABLED = 'true';
  const bad = signed(event);
  bad.headers['x-boat-signature'] = '0'.repeat(64);
  assert.throws(() => receipt.receipt(bad, event));
  await receipt.receipt(signed(event), event);
  assert.equal((await receipt.receipt(signed(event), event)).duplicate, true);
  const stale = {
    ...event,
    eventId: 'stale-bounce',
    status: 'bounced',
    occurredAt: new Date(Date.now() - 120000).toISOString(),
  };
  await receipt.receipt(signed(stale), stale);
  await db.withTenant(a.user.tenantId, async (c) =>
    assert.equal(
      (await c.query('SELECT delivery_status FROM invitation_mail_jobs WHERE id=$1', [job])).rows[0]
        .delivery_status,
      'delivered',
    ),
  );
  const newer = {
    ...event,
    eventId: 'new-bounce',
    status: 'bounced',
    occurredAt: new Date(Date.now() - 30000).toISOString(),
  };
  await receipt.receipt(signed(newer), newer);
  const changed = { ...event, status: 'failed' };
  await assert.rejects(receipt.receipt(signed(changed), changed));
  const foreign = { ...event, tenantId: b.user.tenantId, eventId: 'foreign' };
  await assert.rejects(receipt.receipt(signed(foreign), foreign));
  const ambiguous = await db.withTenant(
    a.user.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO invitation_mail_jobs(tenant_id,status,payload_enc) VALUES($1,'ambiguous','local-fixture-only') RETURNING id",
          [a.user.tenantId],
        )
      ).rows[0].id,
  );
  const evidence = {
    ...event,
    eventId: 'ambiguous-evidence',
    jobId: ambiguous,
    providerId: 'confirmed-provider',
  };
  await receipt.receipt(signed(evidence), evidence);
  const unresolved = await db.withTenant(
    a.user.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO invitation_mail_jobs(tenant_id,status,payload_enc) VALUES($1,'ambiguous','local-fixture-only') RETURNING id",
          [a.user.tenantId],
        )
      ).rows[0].id,
  );
  await assert.rejects(
    review.reconcile(b, unresolved, {
      outcome: 'not_sent',
      evidence: 'Provider evidence fixture confirms not sent',
    }),
  );
  await review.reconcile(a, unresolved, {
    outcome: 'not_sent',
    evidence: 'Provider evidence fixture confirms not sent',
  });
  await db.withTenant(a.user.tenantId, async (c) => {
    assert.equal(
      (await c.query('SELECT delivery_status FROM invitation_mail_jobs WHERE id=$1', [job])).rows[0]
        .delivery_status,
      'bounced',
    );
    const resolved = (
      await c.query('SELECT status,payload_enc,provider_id FROM invitation_mail_jobs WHERE id=$1', [
        ambiguous,
      ])
    ).rows[0];
    assert.equal(resolved.status, 'accepted');
    assert.equal(resolved.payload_enc, null);
    assert.equal(resolved.provider_id, 'confirmed-provider');
    assert.equal(
      (await c.query('SELECT status FROM invitation_mail_jobs WHERE id=$1', [unresolved])).rows[0]
        .status,
      'canceled',
    );
    assert.equal((await c.query('SELECT count(*)::int AS n FROM mail_receipts')).rows[0].n, 4);
  });
  console.log(
    'Mail receipts: gate/signature, immutable dedupe/body guard, delivery/bounce ordering, ambiguous evidence, no-resend review and tenant isolation passed. No emails sent.',
  );
} finally {
  await db.onModuleDestroy();
}
