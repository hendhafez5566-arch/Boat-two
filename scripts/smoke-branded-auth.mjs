import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js'),
  { DatabaseService } = require('./dist/database/database.service.js'),
  { PlansService } = require('./dist/plans/plans.service.js'),
  { AuthService } = require('./dist/auth/auth.service.js'),
  { JwtService } = require('@nestjs/jwt');
const db = new DatabaseService(),
  auth = new AuthService(db, new JwtService({ secret: env.JWT_SECRET }), new PlansService(db));
const password = randomBytes(20).toString('hex');
async function fixture() {
  const email = `brand-${randomUUID()}@example.test`;
  return {
    ...(await auth.register({
      email,
      password,
      fullName: 'Brand fixture',
      workspaceName: 'Brand fixture',
    })),
    email,
  };
}
try {
  const a = await fixture(),
    b = await fixture(),
    hostname = 'auth-' + randomUUID() + '.example.test';
  await db.withTenant(a.tenantId, async (c) => {
    await c.query(
      "UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='business'),status='active'",
    );
    await c.query("INSERT INTO workspace_branding(tenant_id,name) VALUES($1,'Branded company')", [
      a.tenantId,
    ]);
    await c.query(
      "INSERT INTO workspace_domains(tenant_id,hostname,verification_token,status,verified_at,hosting_enabled) VALUES($1,$2,'mock-proof','verified',now(),true)",
      [a.tenantId, hostname],
    );
  });
  await assert.rejects(
    () => auth.login({ email: a.email, password, brandHostname: hostname }),
    /disabled/,
  );
  env.CUSTOM_DOMAINS_ENABLED = 'true';
  const signed = await auth.login({
    email: a.email,
    password,
    brandHostname: hostname,
    tenantId: b.tenantId,
  });
  assert.equal(signed.tenantId, a.tenantId);
  assert.equal(signed.workspaces.length, 1);
  await assert.rejects(
    () => auth.login({ email: b.email, password, brandHostname: hostname }),
    /No workspace/,
  );
  await assert.rejects(
    () =>
      auth.register({
        brandHostname: hostname,
        email: 'no@example.test',
        password,
        fullName: 'No',
        workspaceName: 'No',
      }),
    /invitation/,
  );
  const token = randomBytes(32).toString('hex');
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "INSERT INTO invitations(tenant_id,email,role,token_hash,expires_at) VALUES($1,$2,'agent',$3,now()+interval '1 day')",
      [a.tenantId, b.email, createHash('sha256').update(token).digest('hex')],
    ),
  );
  await assert.rejects(
    () =>
      auth.acceptInvitation({
        token,
        password,
        fullName: 'Invited user',
        brandHostname: 'unregistered.example.test',
      }),
    /unavailable/,
  );
  const accepted = await auth.acceptInvitation({
    token,
    password,
    fullName: 'Invited user',
    brandHostname: hostname,
  });
  assert.equal(accepted.tenantId, a.tenantId);
  const chosen = await auth.login({ email: b.email, password, brandHostname: hostname });
  assert.equal(chosen.tenantId, a.tenantId);
  assert.equal(chosen.workspaces.length, 1);
  await db.withTenant(a.tenantId, (c) =>
    c.query('UPDATE workspace_domains SET hosting_enabled=false WHERE hostname=$1', [hostname]),
  );
  await assert.rejects(
    () => auth.login({ email: a.email, password, brandHostname: hostname }),
    /unavailable/,
  );
  console.log(
    'PASS branded auth: disabled gate, eligible domain binding overrides tenant input, membership enforcement, invitation-only joining, workspace isolation and immediate revoked-domain denial. No DNS/provider calls.',
  );
} finally {
  env.CUSTOM_DOMAINS_ENABLED = 'false';
  await db.onModuleDestroy();
}
