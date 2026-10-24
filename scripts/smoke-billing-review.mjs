import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
env.STRIPE_SECRET_KEY = 'sk_test_mock_only';
const { Client } = require('pg'),
  { DatabaseService } = require('./dist/database/database.service.js'),
  { ExternalEffects } = require('./dist/events/external-effect.js'),
  { BillingService } = require('./dist/billing/billing.service.js'),
  { SubscriptionRequests } = require('./dist/billing/subscription-requests.js');
const db = new DatabaseService(),
  admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL }),
  billing = new BillingService(db, new ExternalEffects(db)),
  worker = new SubscriptionRequests(db, {}, billing);
try {
  await admin.connect();
  const tenant = randomUUID(),
    actor = randomUUID(),
    request = randomUUID(),
    customer = 'cus_' + randomUUID(),
    subscription = 'sub_' + randomUUID();
  await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Review fixture',$2)", [
    tenant,
    'review-' + tenant,
  ]);
  await admin.query(
    "INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'not-a-login-credential','Review fixture')",
    [actor, actor + '@example.test'],
  );
  await admin.query(
    "INSERT INTO subscriptions(tenant_id,plan_id,status,stripe_customer_id,stripe_subscription_id) SELECT $1,id,'active',$2,$3 FROM plans WHERE code='free'",
    [tenant, customer, subscription],
  );
  await admin.query(
    "INSERT INTO billing_subscription_requests(id,tenant_id,requested_by,kind,customer_id,subscription_id,status) VALUES($1,$2,$3,'cancel',$4,$5,'ambiguous')",
    [request, tenant, actor, customer, subscription],
  );
  await assert.rejects(
    () => db.query('SELECT platform_billing_review_queue()'),
    /permission denied/,
  );
  const enqueue = async () => {
    await admin.query('SET ROLE boat_platform');
    const id = (
      await admin.query(
        "SELECT platform_request_billing_evidence($1,$2,'Provider evidence fixture reason') AS id",
        [actor, request],
      )
    ).rows[0].id;
    await admin.query('RESET ROLE');
    return id;
  };
  const confirm = async (id) => {
    await admin.query('SET ROLE boat_platform');
    try {
      return await admin.query(
        "SELECT platform_confirm_billing_evidence($1,$2,'Reviewed provider evidence explicitly')",
        [actor, id],
      );
    } finally {
      await admin.query('RESET ROLE');
    }
  };
  const blocked = await enqueue();
  await db.eventScope(randomUUID(), () => worker.evidence({ tenantId: tenant, reviewId: blocked }));
  assert.equal(
    (await admin.query('SELECT status FROM billing_request_reviews WHERE id=$1', [blocked])).rows[0]
      .status,
    'blocked',
  );
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  let cancel = false,
    reads = 0;
  billing.stripe.subscriptions.retrieve = async () => {
    reads++;
    return {
      id: subscription,
      customer,
      status: 'active',
      cancel_at_period_end: cancel,
      items: { data: [] },
      lastResponse: { requestId: 'req_mock_evidence' },
    };
  };
  const no = await enqueue();
  await db.eventScope(randomUUID(), () => worker.evidence({ tenantId: tenant, reviewId: no }));
  await assert.rejects(() => confirm(no), /Fresh matching/);
  cancel = true;
  const yes = await enqueue();
  await db.eventScope(randomUUID(), () => worker.evidence({ tenantId: tenant, reviewId: yes }));
  assert.equal(reads, 2);
  await confirm(yes);
  await assert.rejects(() => confirm(yes), /Fresh matching/);
  assert.equal(
    (await admin.query('SELECT status FROM billing_subscription_requests WHERE id=$1', [request]))
      .rows[0].status,
    'completed',
  );
  assert.equal(
    (
      await admin.query(
        "SELECT * FROM platform_audit_logs WHERE action='billing.ambiguity_resolved' AND tenant_id=$1",
        [tenant],
      )
    ).rowCount,
    1,
  );
  const other = randomUUID();
  assert.equal(
    (await db.withTenant(other, (c) => c.query('SELECT * FROM billing_request_reviews'))).rowCount,
    0,
  );
  console.log(
    'PASS billing evidence: disabled reads, restricted operator functions, provider request evidence, mismatch quarantine, explicit approval, replay denial, immutable audit and tenant isolation. Mock SDK only; no financial writes.',
  );
} finally {
  env.EXTERNAL_DELIVERY_ENABLED = 'false';
  await admin.end();
  await db.onModuleDestroy();
}
