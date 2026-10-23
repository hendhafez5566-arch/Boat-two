import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
env.STRIPE_SECRET_KEY = 'sk_test_local_no_network';
env.STRIPE_WEBHOOK_SECRET = 'whsec_local_invoice_fixture';
const Stripe = require('stripe');
const { DatabaseService } = require('./dist/database/database.service.js');
const { BillingService } = require('./dist/billing/billing.service.js');
const db = new DatabaseService(),
  billing = new BillingService(db),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function request(path, token, body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(response.status, body ? 201 : 200);
  return response.json();
}
try {
  const a = await request('/auth/register', null, {
    email: `invoices-${randomUUID()}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Invoice fixture',
    workspaceName: 'Invoice fixture',
  });
  const b = await request('/auth/register', null, {
    email: `invoices-${randomUUID()}@example.test`,
    password: randomBytes(20).toString('hex'),
    fullName: 'Invoice isolation',
    workspaceName: 'Invoice isolation',
  });
  const customer = 'cus_fixture_' + randomUUID(),
    subscription = 'sub_fixture_' + randomUUID(),
    created = Math.floor(Date.now() / 1000);
  await db.withTenant(a.tenantId, (c) =>
    c.query('UPDATE subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2', [
      customer,
      subscription,
    ]),
  );
  const invoice = {
    id: 'in_fixture_' + randomUUID().replaceAll('-', ''),
    number: 'LOCAL-001',
    customer,
    subscription,
    currency: 'usd',
    amount_due: 5000,
    amount_paid: 0,
    amount_remaining: 5000,
    status: 'open',
    attempt_count: 1,
    created,
    hosted_invoice_url: 'https://invoice.stripe.com/i/local',
    invoice_pdf: 'https://evil.example.test/phishing.pdf',
    metadata: { tenantId: a.tenantId },
  };
  const event = (type, object, time) => ({
    id: 'evt_fixture_' + randomUUID(),
    object: 'event',
    type,
    created: time,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
  });
  async function deliver(e) {
    const payload = JSON.stringify(e),
      signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: env.STRIPE_WEBHOOK_SECRET,
      });
    return billing.handleWebhook(Buffer.from(payload), signature);
  }
  const failed = event('invoice.payment_failed', invoice, created);
  await deliver(failed);
  assert.equal((await deliver(failed)).duplicate, true);
  let result = await request('/billing/invoices?status=failed', a.accessToken);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].payment_failed, true);
  assert.equal(result.items[0].pdf_url, null);
  await deliver(event('invoice.updated', invoice, created));
  assert.equal(
    (await request('/billing/invoices?status=failed', a.accessToken)).total,
    1,
    'Equal-time generic update cannot erase failure',
  );
  const paid = {
    ...invoice,
    status: 'paid',
    amount_paid: 5000,
    amount_remaining: 0,
    status_transitions: { paid_at: created },
  };
  await deliver(event('invoice.paid', paid, created));
  result = await request('/billing/invoices?status=paid', a.accessToken);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].payment_failed, false);
  assert.equal(
    new Date(
      (
        await db.withTenant(a.tenantId, (c) =>
          c.query('SELECT paid_at FROM billing_invoices WHERE provider_id=$1', [invoice.id]),
        )
      ).rows[0].paid_at,
    ).getTime(),
    created * 1000,
  );
  assert.equal(Number(result.items[0].amount_paid), 5000);
  assert.equal(
    (await deliver(event('invoice.payment_failed', invoice, created - 1))).ignored,
    true,
  );
  assert.equal((await request('/billing/invoices', b.accessToken)).total, 0);
  assert.equal(
    (await request('/workspace', a.accessToken)).plan.status,
    'trialing',
    'Invoice updates do not override authoritative subscription state',
  );
  assert.equal(
    (
      await deliver(
        event(
          'invoice.paid',
          { ...paid, id: 'in_wrong_customer', customer: 'cus_wrong' },
          created + 1,
        ),
      )
    ).ignored,
    true,
  );
  await deliver(
    event(
      'customer.subscription.updated',
      {
        id: subscription,
        customer,
        status: 'active',
        metadata: {},
        items: { data: [] },
        cancel_at_period_end: true,
        current_period_end: created + 86400,
      },
      created + 2,
    ),
  );
  assert.equal(
    (await request('/workspace', a.accessToken)).plan.status,
    'active',
    'Customer-routed subscription events apply without tenant metadata',
  );
  assert.equal((await billing.status(a.tenantId)).subscription.cancelAtPeriodEnd, true);
  assert.equal(
    (await billing.status(a.tenantId)).configured,
    false,
    'Configured Stripe key does not bypass external gate',
  );
  await assert.rejects(
    () => billing.createPortal(a.tenantId),
    /External billing operations are disabled/,
  );
  console.log(
    'PASS invoices: signed local event ledger, replay/stale/equal-time failure/paid handling, link sanitization, customer ownership, tenant API isolation, subscription-state independence and external billing gates. No Stripe requests.',
  );
} finally {
  await db.onModuleDestroy();
}
