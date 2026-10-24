import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { PlansService } = require('./dist/plans/plans.service.js');
const { EventsService } = require('./dist/events/events.service.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const { DomainHosting, DomainHostingController } = require('./dist/workspace/domain-hosting.js');
const { DomainTransfers } = require('./dist/workspace/domain-transfers.js');
const { BrandingController } = require('./dist/workspace/branding.controller.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  hosting = new DomainHosting(db, new EventsService(db, new EventEmitter2())),
  transfers = new DomainTransfers(db, plans, hosting),
  controller = new DomainHostingController(db, hosting, plans),
  branding = new BrandingController(db, plans);
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `transfer-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'Domain transfer fixture',
      workspaceName: 'Domain transfer fixture',
    }),
  });
  assert.equal(r.status, 201);
  return r.json();
}
const req = (a) => ({ user: { tenantId: a.tenantId, role: 'owner' } });
try {
  const a = await fixture(),
    b = await fixture(),
    c = await fixture();
  for (const actor of [a, b])
    await db.withTenant(actor.tenantId, (conn) =>
      conn.query(
        "UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='business'),status='active'",
      ),
    );
  const original = randomBytes(24).toString('hex');
  const domain = (
    await db.withTenant(a.tenantId, (conn) =>
      conn.query(
        "INSERT INTO workspace_domains(tenant_id,hostname,verification_token,status,verified_at,hosting_enabled) VALUES($1,$2,$3,'verified',now(),true) RETURNING *",
        [a.tenantId, 'transfer-' + randomUUID() + '.example.test', original],
      ),
    )
  ).rows[0];
  const started = await transfers.start(a.tenantId, domain.id, b.tenantId);
  assert.ok(started.transferSecret);
  assert.equal(
    (
      await db.withTenant(a.tenantId, (conn) =>
        conn.query('SELECT hosting_enabled FROM workspace_domains WHERE id=$1', [domain.id]),
      )
    ).rows[0].hosting_enabled,
    false,
  );
  await assert.rejects(
    () => controller.set(req(a), domain.id, { enabled: true }),
    /pending transfer/,
  );
  await assert.rejects(
    () => transfers.start(a.tenantId, domain.id, b.tenantId),
    /existing transfer/,
  );
  await assert.rejects(() => transfers.accept(c.tenantId, started.id, started.transferSecret));
  await assert.rejects(
    () => transfers.accept(b.tenantId, started.id, 'a'.repeat(32)),
    /unavailable/,
  );
  hosting.proof = async () => false;
  await assert.rejects(
    () => transfers.accept(b.tenantId, started.id, started.transferSecret),
    /TXT/,
  );
  let expectedProof;
  hosting.proof = async (host, token) => {
    assert.equal(host, domain.hostname);
    assert.notEqual(token, original);
    expectedProof = token;
    return true;
  };
  const results = await Promise.allSettled([
    transfers.accept(b.tenantId, started.id, started.transferSecret),
    transfers.accept(b.tenantId, started.id, started.transferSecret),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (
      await db.withTenant(a.tenantId, (conn) =>
        conn.query('SELECT * FROM workspace_domains WHERE id=$1', [domain.id]),
      )
    ).rowCount,
    0,
  );
  let moved = (
    await db.withTenant(b.tenantId, (conn) =>
      conn.query('SELECT * FROM workspace_domains WHERE id=$1', [domain.id]),
    )
  ).rows[0];
  assert.equal(moved.verification_token, expectedProof);
  assert.equal(moved.status, 'verified');
  assert.equal(moved.hosting_enabled, false);
  assert.ok(moved.hosting_version > domain.hosting_version);
  await assert.rejects(
    () => transfers.accept(b.tenantId, started.id, started.transferSecret),
    /unavailable/,
  );
  assert.equal(
    (
      await db.withTenant(c.tenantId, (conn) =>
        conn.query('SELECT * FROM workspace_domain_transfers'),
      )
    ).rowCount,
    0,
  );
  await branding.revoke(req(b), domain.id);
  const reclaimed = await transfers.reclaim(b.tenantId, domain.id);
  assert.equal(reclaimed.status, 'pending');
  assert.notEqual(reclaimed.verification_token, expectedProof);
  await assert.rejects(() => transfers.reclaim(a.tenantId, domain.id));
  moved = (
    await db.withTenant(b.tenantId, (conn) =>
      conn.query('SELECT * FROM workspace_domains WHERE id=$1', [domain.id]),
    )
  ).rows[0];
  assert.equal(moved.hosting_enabled, false);
  assert.equal(moved.verified_at, null);
  // Source revocation cancels a pending transfer, so stale TXT/secret cannot complete it.
  await db.withTenant(b.tenantId, (conn) =>
    conn.query("UPDATE workspace_domains SET status='verified',verified_at=now() WHERE id=$1", [
      domain.id,
    ]),
  );
  const next = await transfers.start(b.tenantId, domain.id, a.tenantId);
  await branding.revoke(req(b), domain.id);
  await assert.rejects(
    () => transfers.accept(a.tenantId, next.id, next.transferSecret),
    /unavailable/,
  );
  assert.equal(
    (
      await db.withTenant(a.tenantId, (conn) =>
        conn.query("SELECT * FROM audit_logs WHERE action='domain.transferred_out'"),
      )
    ).rowCount,
    1,
  );
  console.log(
    'PASS domains: explicit transfer approval, fresh mocked DNS, secret/tenant checks, atomic concurrent acceptance, disabled hosting, revocation cancellation, reclaim token rotation and audit preservation. No real DNS/TLS activated.',
  );
} finally {
  await db.onModuleDestroy();
}
