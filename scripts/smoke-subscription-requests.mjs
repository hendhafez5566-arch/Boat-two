import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
env.STRIPE_SECRET_KEY = 'sk_test_local_no_network';
const { DatabaseService } = require('./dist/database/database.service.js');
const { ExternalEffects } = require('./dist/events/external-effect.js');
const { EventsService } = require('./dist/events/events.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { BillingService } = require('./dist/billing/billing.service.js');
const { SubscriptionRequests } = require('./dist/billing/subscription-requests.js');
const db = new DatabaseService(),
  events = new EventsService(db, new EventEmitter2()),
  billing = new BillingService(db, new ExternalEffects(db)),
  requests = new SubscriptionRequests(db, events, billing);
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `sub-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'Subscription fixture',
      workspaceName: 'Subscription fixture',
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
    customer = 'cus_' + randomUUID(),
    sub = 'sub_' + randomUUID();
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "UPDATE subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2,status='active'",
      [customer, sub],
    ),
  );
  const blocked = await requests.create(a.tenantId, a.user, { kind: 'cancel' });
  await requests.process({ tenantId: a.tenantId, id: blocked.id });
  const get = async (id) =>
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT * FROM billing_subscription_requests WHERE id=$1', [id]),
      )
    ).rows[0];
  assert.equal((await get(blocked.id)).status, 'blocked');
  await assert.rejects(() => requests.cancel(b.tenantId, blocked.id), /missing/);
  await requests.cancel(a.tenantId, blocked.id);
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  env.BILLING_SUBSCRIPTION_CHANGES_ENABLED = 'true';
  let writes = 0,
    providerCancel = false;
  billing.stripe.subscriptions.retrieve = async () => ({
    id: sub,
    customer,
    status: 'active',
    metadata: { planCode: 'free' },
    items: { data: [] },
    cancel_at_period_end: providerCancel,
  });
  billing.stripe.subscriptions.update = async (id, args, options) => {
    writes++;
    assert.equal(id, sub);
    assert.match(options.idempotencyKey, /^boat-subscription-/);
    providerCancel = args.cancel_at_period_end;
    return {
      id: sub,
      customer,
      status: 'active',
      metadata: { planCode: 'free' },
      items: { data: [] },
      cancel_at_period_end: providerCancel,
    };
  };
  const cancel = await requests.create(a.tenantId, a.user, { kind: 'cancel' });
  await assert.rejects(() => requests.create(a.tenantId, a.user, { kind: 'resume' }), /unresolved/);
  await Promise.all([
    requests.process({ tenantId: a.tenantId, id: cancel.id }),
    requests.process({ tenantId: a.tenantId, id: cancel.id }),
  ]);
  assert.equal(writes, 1);
  assert.equal((await get(cancel.id)).status, 'completed');
  assert.equal((await billing.status(a.tenantId)).subscription.cancelAtPeriodEnd, true);
  const resume = await requests.create(a.tenantId, a.user, { kind: 'resume' });
  await requests.process({ tenantId: a.tenantId, id: resume.id });
  assert.equal(writes, 2);
  assert.equal((await billing.status(a.tenantId)).subscription.cancelAtPeriodEnd, false);
  const uncertain = await requests.create(a.tenantId, a.user, { kind: 'cancel' });
  billing.stripe.subscriptions.update = async () => {
    writes++;
    throw new Error('provider timeout');
  };
  await requests.process({ tenantId: a.tenantId, id: uncertain.id });
  assert.equal((await get(uncertain.id)).status, 'ambiguous');
  await requests.process({ tenantId: a.tenantId, id: uncertain.id });
  assert.equal(writes, 3);
  await assert.rejects(() => requests.cancel(a.tenantId, uncertain.id), /missing/);
  await assert.rejects(() => requests.create(a.tenantId, a.user, { kind: 'resume' }), /unresolved/);
  assert.equal(
    (await db.withTenant(b.tenantId, (c) => c.query('SELECT * FROM billing_subscription_requests')))
      .rowCount,
    0,
  );
  // A disabled owner cannot execute a previously queued request.
  const c = await fixture();
  await db.withTenant(c.tenantId, (conn) =>
    conn.query(
      "UPDATE subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2,status='active'",
      ['cus_revoked', 'sub_revoked'],
    ),
  );
  const revoked = await requests.create(c.tenantId, c.user, { kind: 'cancel' });
  await db.withTenant(c.tenantId, (conn) =>
    conn.query("UPDATE memberships SET role='admin' WHERE user_id=$1", [c.user]),
  );
  await requests.process({ tenantId: c.tenantId, id: revoked.id });
  assert.equal(
    (
      await db.withTenant(c.tenantId, (conn) =>
        conn.query('SELECT status FROM billing_subscription_requests WHERE id=$1', [revoked.id]),
      )
    ).rows[0].status,
    'failed',
  );
  assert.equal(writes, 3);
  console.log(
    'PASS subscription requests: gates, cancellation/resume, concurrent execution, idempotency, revoked owner, uncertainty quarantine and tenant isolation; no Stripe network.',
  );
} finally {
  env.EXTERNAL_DELIVERY_ENABLED = 'false';
  env.BILLING_SUBSCRIPTION_CHANGES_ENABLED = 'false';
  await db.onModuleDestroy();
}
