import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
const { DatabaseService } = require('./dist/database/database.service.js');
const { EventsService } = require('./dist/events/events.service.js');
const { DomainHosting } = require('./dist/workspace/domain-hosting.js');
const { EventEmitter2 } = require('@nestjs/event-emitter');
const db = new DatabaseService(),
  events = new EventsService(db, new EventEmitter2()),
  hosting = new DomainHosting(db, events),
  base = process.env.SMOKE_API_URL || 'http://localhost:4123';
const originalDomains = env.CUSTOM_DOMAINS_ENABLED,
  originalExternal = env.EXTERNAL_DELIVERY_ENABLED;
async function request(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, status, data.message);
  return data;
}
try {
  const register = () =>
    request(
      '/auth/register',
      null,
      'POST',
      {
        email: `hosting-${randomUUID()}@example.test`,
        password: randomBytes(20).toString('hex'),
        fullName: 'Hosting fixture',
        workspaceName: 'Hosting fixture',
      },
      201,
    );
  const a = await register(),
    b = await register();
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='business'),status='active'",
    ),
  );
  await request('/workspace/branding', a.accessToken, 'PATCH', {
    name: 'Isolated branded host',
    logoUrl: null,
    primaryColor: '#123456',
    widgetTitle: 'Local branded title',
  });
  const domain = await request(
    '/workspace/branding/domains',
    a.accessToken,
    'POST',
    { hostname: 'local-' + randomUUID() + '.example.test' },
    201,
  );
  const path = '/workspace/branding/domains/' + domain.id + '/hosting';
  await request(path, a.accessToken, 'PATCH', { enabled: true }, 400);
  await request(path, b.accessToken, 'PATCH', { enabled: true }, 404);
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE workspace_domains SET status='verified',verified_at=now() WHERE id=$1", [
      domain.id,
    ]),
  );
  const enabled = await request(path, a.accessToken, 'PATCH', { enabled: true });
  assert.equal(enabled.hosting_enabled, true);
  await assert.rejects(() => hosting.resolve(domain.hostname), /disabled/);
  env.CUSTOM_DOMAINS_ENABLED = 'true';
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  assert.equal((await hosting.resolve(domain.hostname)).name, 'Isolated branded host');
  hosting.proof = async () => false;
  await hosting.recheck({ tenantId: a.tenantId, id: domain.id, version: enabled.hosting_version });
  await assert.rejects(() => hosting.resolve(domain.hostname), /eligible/);
  hosting.proof = async () => true;
  await hosting.recheck({ tenantId: a.tenantId, id: domain.id, version: enabled.hosting_version });
  assert.equal((await hosting.resolve(domain.hostname)).primaryColor, '#123456');
  await db.withTenant(a.tenantId, (c) =>
    c.query("UPDATE workspace_domains SET verified_at=now()-interval '25 hours' WHERE id=$1", [
      domain.id,
    ]),
  );
  await assert.rejects(() => hosting.resolve(domain.hostname), /eligible/);
  await hosting.recheck({ tenantId: a.tenantId, id: domain.id, version: enabled.hosting_version });
  await db.withTenant(a.tenantId, (c) => c.query("UPDATE subscriptions SET status='canceled'"));
  await assert.rejects(() => hosting.resolve(domain.hostname), /eligible/);
  await db.withTenant(a.tenantId, (c) => c.query("UPDATE subscriptions SET status='active'"));
  await request(path, a.accessToken, 'PATCH', { enabled: false });
  await hosting.recheck({ tenantId: a.tenantId, id: domain.id, version: enabled.hosting_version });
  await assert.rejects(() => hosting.resolve(domain.hostname), /eligible/);
  const scheduled = await db.withTenant(a.tenantId, (c) =>
    c.query(
      "SELECT count(*)::int AS n FROM domain_events WHERE type='domain.ownership_recheck' AND aggregate_id=$1",
      [domain.id],
    ),
  );
  assert.ok(scheduled.rows[0].n >= 1);
  await request('/domains/tls-allow?domain=' + domain.hostname, null, 'GET', undefined, 404);
  console.log(
    'PASS domain hosting: verified-only activation, cross-tenant denial, global gate, brand resolution, mocked ownership recovery/expiry, downgrade denial, versioned outbox rechecks and disable. No DNS, certificate issuance or live ingress activation.',
  );
} finally {
  env.CUSTOM_DOMAINS_ENABLED = originalDomains;
  env.EXTERNAL_DELIVERY_ENABLED = originalExternal;
  await db.onModuleDestroy();
}
