import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
// Isolated test-process configuration only. No Stripe API requests occur.
env.STRIPE_SECRET_KEY = 'sk_test_fixture_no_network_calls';
env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture_local_only';
const Stripe = require('stripe');
const { DatabaseService } = require('./dist/database/database.service.js');
const { BillingService } = require('./dist/billing/billing.service.js');
const db = new DatabaseService(),
  billing = new BillingService(db),
  base = process.env.SMOKE_API_URL || 'http://localhost:4111';
async function req(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${result.message || ''}`);
  return result;
}
try {
  const a = await req(
      '/auth/register',
      null,
      'POST',
      {
        email: `billing-${randomUUID()}@example.test`,
        password: randomBytes(20).toString('hex'),
        fullName: 'Local billing fixture',
        workspaceName: 'Local billing fixture',
      },
      201,
    ),
    token = a.accessToken;
  await req(
    '/workspace/branding',
    token,
    'PATCH',
    {
      name: 'Blocked branding',
      logoUrl: null,
      primaryColor: '#123456',
      widgetTitle: 'Local fixture',
    },
    403,
  );
  const subId = 'sub_fixture_' + randomUUID(),
    customer = 'cus_fixture_' + randomUUID(),
    created = Math.floor(Date.now() / 1000);
  const subscription = {
    id: subId,
    customer,
    status: 'active',
    metadata: { tenantId: a.tenantId, planCode: 'business' },
    items: { data: [] },
  };
  const event = (type, object, time = created) => ({
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
  const active = event('customer.subscription.updated', subscription);
  await assert.rejects(
    () => billing.handleWebhook(Buffer.from(JSON.stringify(active)), 'invalid'),
    /Invalid signature/,
  );
  await deliver(active);
  assert.equal((await deliver(active)).duplicate, true);
  assert.equal((await req('/workspace', token)).plan.plan_code, 'business');
  await req('/workspace/branding', token, 'PATCH', {
    name: 'Local branded company',
    logoUrl: null,
    primaryColor: '#123456',
    widgetTitle: 'Local branded widget',
  });
  assert.equal((await req('/workspace/branding', token)).branding.primary_color, '#123456');
  const channel = await req(
    '/channels',
    token,
    'POST',
    { type: 'web', name: 'Local branding fixture' },
    201,
  );
  const config = await req('/widget/' + channel.external_id + '/config', null);
  assert.equal(config.color, '#123456');
  assert.equal(config.title, 'Local branded widget');
  const domain = await req(
    '/workspace/branding/domains',
    token,
    'POST',
    { hostname: 'fixture-' + randomUUID() + '.example.com' },
    201,
  );
  assert.equal(domain.status, 'pending');
  await req('/workspace/branding/domains/' + domain.id + '/verify', token, 'POST', undefined, 400);
  await req('/workspace/branding/domains/' + domain.id + '/revoke', token, 'PATCH');
  await deliver(event('invoice.payment_failed', { customer }, created + 1));
  assert.equal((await req('/workspace', token)).plan.status, 'active');
  const canceled = event('customer.subscription.deleted', subscription, created + 3);
  await deliver(canceled);
  const stale = await deliver(event('customer.subscription.updated', subscription, created + 2));
  assert.equal(stale.ignored, true);
  assert.equal(
    (await deliver(event('customer.subscription.updated', subscription, created + 3))).ignored,
    true,
  );
  assert.equal((await req('/workspace/branding', token)).enabled, false);
  assert.equal((await req('/widget/' + channel.external_id + '/config', null)).color, '#2563eb');
  const events = await req('/billing/events', token);
  assert.equal(events.length, 5);
  assert.equal(events.filter((e) => e.status === 'processed').length, 2);
  console.log(
    'PASS billing/branding smoke: signed local Stripe fixtures, invalid signature rejection, atomic event dedupe, stale/equal-time cancellation protection, payment failure ledger, plan-gated branding and widget fallback, domain creation/revoke and missing TXT rejection. No provider API calls or live DNS ownership claims.',
  );
} finally {
  await db.onModuleDestroy();
}
