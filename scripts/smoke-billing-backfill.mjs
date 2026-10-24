import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
env.STRIPE_SECRET_KEY = 'sk_test_local_no_network';
const { DatabaseService } = require('./dist/database/database.service.js');
const { ExternalEffects } = require('./dist/events/external-effect.js');
const { BillingService } = require('./dist/billing/billing.service.js');
const { BillingReconciliation } = require('./dist/billing/reconciliation.js');
const { EventsService } = require('./dist/events/events.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const db = new DatabaseService(),
  events = new EventsService(db, new EventEmitter2());
const billing = new BillingService(db, new ExternalEffects(db));
const worker = new BillingReconciliation(db, billing, events);
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function register() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `backfill-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'Backfill fixture',
      workspaceName: 'Backfill fixture',
    }),
  });
  assert.equal(r.status, 201);
  return r.json();
}
try {
  const a = await register(),
    b = await register(),
    customer = 'cus_' + randomUUID(),
    sub = 'sub_' + randomUUID();
  await db.withTenant(a.tenantId, (c) =>
    c.query('UPDATE subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2', [
      customer,
      sub,
    ]),
  );
  await Promise.all([
    db.query('SELECT billing_schedule_due(100)'),
    db.query('SELECT billing_schedule_due(100)'),
  ]);
  const jobs = await db.withTenant(
    a.tenantId,
    async (c) =>
      (await c.query("SELECT * FROM billing_reconciliations WHERE status='pending'")).rows,
  );
  assert.equal(jobs.length, 1, 'Concurrent schedulers must create one pending job');
  const job = jobs[0];
  await worker.process({ tenantId: a.tenantId, id: job.id });
  assert.equal(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT status FROM billing_reconciliations WHERE id=$1', [job.id]),
      )
    ).rows[0].status,
    'blocked',
  );
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE billing_reconciliations SET status='pending' WHERE id=$1", [job.id]),
  );
  env.EXTERNAL_DELIVERY_ENABLED = 'true'; // Mock SDK methods only; never network.
  let reads = 0,
    pages = 0;
  billing.stripe.subscriptions.retrieve = async () => {
    reads++;
    return {
      id: sub,
      customer,
      status: 'active',
      metadata: { planCode: 'free' },
      items: { data: [] },
    };
  };
  billing.stripe.invoices.list = async (args) => {
    pages++;
    return {
      has_more: !args.starting_after,
      data: [
        {
          id: args.starting_after
            ? 'in_' + job.id.replaceAll('-', '') + '_2'
            : 'in_' + job.id.replaceAll('-', '') + '_1',
          customer,
          subscription: sub,
          status: 'paid',
          currency: 'usd',
          amount_due: 100,
          amount_paid: 100,
          amount_remaining: 0,
          created: Math.floor(Date.now() / 1000),
          attempt_count: 1,
        },
      ],
    };
  };
  await db.eventScope(randomUUID(), () => worker.process({ tenantId: a.tenantId, id: job.id }));
  let row = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT * FROM billing_reconciliations WHERE id=$1', [job.id]),
    )
  ).rows[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.invoice_pages, 1);
  assert.equal(row.subscription_synced, true);
  await db.eventScope(randomUUID(), () => worker.process({ tenantId: a.tenantId, id: job.id }));
  row = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT * FROM billing_reconciliations WHERE id=$1', [job.id]),
    )
  ).rows[0];
  assert.equal(row.status, 'completed');
  assert.equal(row.backfill_complete, true);
  assert.equal(row.invoice_pages, 2);
  assert.equal(reads, 1);
  assert.equal(pages, 2);
  assert.equal(
    (await db.withTenant(a.tenantId, (c) => c.query('SELECT * FROM billing_invoices'))).rowCount,
    2,
  );
  assert.equal(
    (await db.withTenant(b.tenantId, (c) => c.query('SELECT * FROM billing_invoices'))).rowCount,
    0,
  );
  assert.equal(
    (
      await db.withTenant(b.tenantId, (c) =>
        c.query('SELECT * FROM billing_reconciliations WHERE id=$1', [job.id]),
      )
    ).rowCount,
    0,
  );
  // A rolled-back transaction reuses the durable read result without a second provider call.
  const effectId = randomUUID();
  let calls = 0;
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      () =>
        db.withTenant(a.tenantId, () =>
          db.eventScope(effectId, async () => {
            await new ExternalEffects(db).execute(a.tenantId, { fixture: true }, async () => {
              calls++;
              return { ok: true };
            });
            throw new Error('rollback');
          }),
        ),
      /rollback/,
    );
  assert.equal(calls, 1);
  const ambiguous = randomUUID();
  await assert.rejects(
    () =>
      db.eventScope(ambiguous, () =>
        new ExternalEffects(db).execute(a.tenantId, { fixture: 'uncertain' }, async () => {
          throw new Error('timeout');
        }),
      ),
    /timeout/,
  );
  await assert.rejects(
    () =>
      db.eventScope(ambiguous, () =>
        new ExternalEffects(db).execute(a.tenantId, { fixture: 'uncertain' }, async () => {
          throw new Error('must not execute');
        }),
      ),
    /ambiguous/,
  );
  console.log(
    'PASS billing periodic/backfill: concurrent scheduler, disabled gate, paged progress, cached rollback, uncertainty suppression and tenant isolation; mocked SDK only.',
  );
} finally {
  env.EXTERNAL_DELIVERY_ENABLED = 'false';
  await db.onModuleDestroy();
}
