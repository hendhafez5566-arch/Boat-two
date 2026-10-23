import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
env.STRIPE_SECRET_KEY = 'sk_test_local_no_network';
env.STRIPE_WEBHOOK_SECRET = 'whsec_catalog_fixture';
const { Client } = require('pg'),
  Stripe = require('stripe');
const { DatabaseService } = require('./dist/database/database.service.js');
const { ExternalEffects } = require('./dist/events/external-effect.js');
const { BillingService } = require('./dist/billing/billing.service.js');
const { PlansService } = require('./dist/plans/plans.service.js');
const { SubscriptionRequests } = require('./dist/billing/subscription-requests.js');
const { EventsService } = require('./dist/events/events.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const db = new DatabaseService(),
  admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL }),
  billing = new BillingService(db, new ExternalEffects(db)),
  plans = new PlansService(db),
  requests = new SubscriptionRequests(db, new EventsService(db, new EventEmitter2()), billing);
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  suffix = randomUUID().replaceAll('-', '');
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `catalog-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'Catalog fixture',
      workspaceName: 'Catalog fixture',
    }),
  });
  assert.equal(r.status, 201);
  const a = await r.json();
  a.user = JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub;
  return a;
}
try {
  await admin.connect();
  const a = await fixture(),
    customer = 'cus_' + suffix,
    sub = 'sub_' + suffix,
    pcode = 'fixture_' + suffix,
    price = 'price_' + suffix,
    price2 = price + '_2';
  await admin.query(
    "INSERT INTO plans(code,name,price_cents,limits,features) VALUES($1,'Catalog fixture',1000,'{\"agents\":5}','{\"white_label\":true}')",
    [pcode],
  );
  await admin.query('SET ROLE boat_platform');
  await admin.query(
    "SELECT platform_publish_price($1,$2,$3,1000,'usd','month','Verified local test price evidence')",
    [a.user, pcode, price],
  );
  await assert.rejects(
    () =>
      admin.query(
        "SELECT platform_publish_price($1,$2,$3,2000,'usd','month','Cannot mutate existing price identifier')",
        [a.user, pcode, price],
      ),
    /duplicate/,
  );
  await admin.query('RESET ROLE');
  await assert.rejects(() => db.query('SELECT platform_price_catalog()'), /permission denied/);
  await assert.rejects(
    () => db.query('UPDATE billing_prices SET amount_cents=1 WHERE provider_id=$1', [price]),
    /permission denied/,
  );
  await db.withTenant(a.tenantId, (c) =>
    c.query('UPDATE subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2', [
      customer,
      sub,
    ]),
  );
  const created = Math.floor(Date.now() / 1000) - 100;
  async function deliver(status, stamp, providerPrice = price, metadata = { planCode: 'free' }) {
    const e = {
      id: 'evt_' + randomUUID(),
      type: 'customer.subscription.updated',
      created: stamp,
      data: {
        object: {
          id: sub,
          customer,
          status,
          metadata: { tenantId: a.tenantId, ...metadata },
          items: { data: [{ id: 'si_fixture', price: { id: providerPrice } }] },
          cancel_at_period_end: false,
        },
      },
    };
    const body = JSON.stringify(e),
      signature = Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: env.STRIPE_WEBHOOK_SECRET,
      });
    return billing.handleWebhook(Buffer.from(body), signature);
  }
  const effective = () => db.withTenant(a.tenantId, (c) => plans.getTenantPlan(c));
  await deliver('active', created);
  assert.equal(
    (await effective()).plan_code,
    pcode,
    'Provider price wins conflicting plan metadata',
  );
  assert.equal(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT stripe_current_price_id FROM subscriptions'),
      )
    ).rows[0].stripe_current_price_id,
    price,
  );
  const tie = await deliver('past_due', created);
  assert.equal(tie.ignored, true);
  assert.equal((await effective()).status, 'active');
  await deliver('past_due', created + 1);
  assert.equal((await effective()).plan_code, pcode);
  env.BILLING_PAST_DUE_GRACE_DAYS = 0;
  assert.equal((await effective()).plan_code, 'free');
  assert.equal((await effective()).delinquent_restricted, true);
  await deliver('active', created + 2);
  assert.equal((await effective()).plan_code, pcode);
  assert.equal((await billing.status(a.tenantId)).subscription.pastDueSince, null);
  await admin.query('SET ROLE boat_platform');
  await admin.query(
    "SELECT platform_publish_price($1,$2,$3,1500,'usd','month','New default price keeps old subscription price')",
    [a.user, pcode, price2],
  );
  await admin.query(
    "SELECT platform_retire_price($1,$2,'Retire old price but preserve subscriber mapping')",
    [a.user, price],
  );
  await admin.query('RESET ROLE');
  await deliver('active', created + 3);
  assert.equal(
    (await effective()).plan_code,
    pcode,
    'Retired price still maps existing subscribers',
  );
  assert.equal((await deliver('active', created + 4, 'price_unknown_' + suffix)).ignored, true);
  // Existing subscription can move to the new default price for the same plan.
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  env.BILLING_SUBSCRIPTION_CHANGES_ENABLED = 'true';
  // Same-plan repricing remains deliberately refused; test a distinct target plan.
  const target = pcode + '_target',
    targetPrice = price + '_target';
  await admin.query("INSERT INTO plans(code,name,price_cents) VALUES($1,'Target fixture',2200)", [
    target,
  ]);
  await admin.query('SET ROLE boat_platform');
  await admin.query(
    "SELECT platform_publish_price($1,$2,$3,2200,'usd','month','Verified target fixture price evidence')",
    [a.user, target, targetPrice],
  );
  await admin.query('RESET ROLE');
  billing.stripe.subscriptions.retrieve = async () => ({
    id: sub,
    customer,
    status: 'active',
    metadata: { planCode: pcode },
    items: { data: [{ id: 'si_fixture', price: { id: price } }] },
    cancel_at_period_end: false,
  });
  let writes = 0;
  billing.stripe.subscriptions.update = async (id, args) => {
    writes++;
    assert.equal(args.proration_behavior, 'none');
    assert.equal(args.payment_behavior, 'error_if_incomplete');
    assert.equal(args.items[0].price, targetPrice);
    return {
      id: sub,
      customer,
      status: 'active',
      metadata: args.metadata,
      items: { data: [{ id: 'si_fixture', price: { id: targetPrice } }] },
      cancel_at_period_end: false,
    };
  };
  const request = await requests.create(a.tenantId, a.user, {
    kind: 'change_plan',
    planCode: target,
  });
  await requests.process({ tenantId: a.tenantId, id: request.id });
  assert.equal(writes, 1);
  assert.equal((await effective()).plan_code, target);
  console.log(
    'PASS catalog/delinquency: immutable operator price registry, app-role denial, authoritative price mapping, retired prices, equal-time ambiguity, grace downgrade/recovery and mocked no-proration plan change.',
  );
} finally {
  env.EXTERNAL_DELIVERY_ENABLED = 'false';
  env.BILLING_SUBSCRIPTION_CHANGES_ENABLED = 'false';
  await admin.end();
  await db.onModuleDestroy();
}
