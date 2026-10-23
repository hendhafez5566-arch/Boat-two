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
    b = await fixture();
  const {
      IntegrationSecretsController,
    } = require('./dist/business/integration-secrets.controller.js'),
    { CryptoService } = require('./dist/messaging/crypto.service.js'),
    { AutomationService } = require('./dist/business/automation.service.js'),
    { ExternalEffects } = require('./dist/events/external-effect.js'),
    { env } = require('./dist/config/env.js'),
    { actionSchema } = require('./dist/business/schemas.js'),
    { integrationHeaders } = require('./dist/business/integration-auth.js');
  const crypto = new CryptoService(),
    ctl = new IntegrationSecretsController(db, crypto),
    safe = require('./dist/flows/http-safe.js'),
    { createHmac } = await import('node:crypto');
  const hmac = await ctl.create(a, {
    name: 'HMAC fixture',
    value: 'local_signing_fixture',
    authType: 'hmac_sha256',
    allowedHosts: ['api.example.test'],
  });
  const basic = await ctl.create(a, {
    name: 'Basic fixture',
    value: 'fixture:password',
    authType: 'basic',
    allowedHosts: ['api.example.test'],
  });
  const header = await ctl.create(a, {
    name: 'Header fixture',
    value: 'fixture-key',
    authType: 'header',
    headerName: 'X-API-Key',
    allowedHosts: ['api.example.test'],
  });
  assert.equal(
    integrationHeaders({ auth_type: 'basic', value: 'fixture:password' }, '').Authorization,
    'Basic ' + Buffer.from('fixture:password').toString('base64'),
  );
  assert.equal(
    integrationHeaders({ auth_type: 'header', header_name: 'X-API-Key', value: 'fixture-key' }, '')[
      'X-API-Key'
    ],
    'fixture-key',
  );
  assert.throws(() =>
    ctl.create(a, {
      name: 'Bad',
      value: 'key',
      authType: 'header',
      headerName: 'Host',
      allowedHosts: ['api.example.test'],
    }),
  );
  await assert.rejects(ctl.update(a, basic.id, { value: 'no-colon' }));
  await assert.rejects(ctl.update(b, header.id, { value: 'no-access' }));
  for (const headers of [
    { Authorization: 'bad' },
    { Host: 'bad' },
    { 'X-Request-Source': 'bad\r\nInjected: yes' },
  ])
    assert.equal(
      actionSchema.safeParse({
        type: 'http',
        url: 'https://api.example.test/hook',
        body: 'fixture',
        headers,
      }).success,
      false,
    );
  let captured,
    calls = 0;
  safe.safeHttpRequest = async (spec) => {
    calls++;
    captured = spec;
    return { ok: true, status: 200, body: { accepted: true } };
  };
  env.EXTERNAL_DELIVERY_ENABLED = 'true';
  const service = new AutomationService(
    db,
    { getTenantPlan: async () => ({ features: { automations: true } }) },
    {},
    new ExternalEffects(db),
    crypto,
  );
  const contact = await db.withTenant(
    a.user.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO contacts(tenant_id,name) VALUES($1,'Auth fixture') RETURNING id",
          [a.user.tenantId],
        )
      ).rows[0].id,
  );
  const event = {
    tenantId: a.user.tenantId,
    contactId: contact,
    eventId: randomUUID(),
    actions: [
      {
        type: 'http',
        url: 'https://api.example.test/hook',
        body: 'fixture-body',
        secretId: hmac.id,
        headers: { 'X-Request-Source': 'fixture' },
      },
    ],
  };
  await db.eventScope('auth-fixture', () => service.followup(event));
  await db.eventScope('auth-fixture', () => service.followup(event));
  assert.equal(calls, 1);
  assert.equal(
    captured.headers['X-Boat-Signature'],
    createHmac('sha256', 'local_signing_fixture')
      .update(captured.headers['X-Boat-Timestamp'] + '.fixture-body')
      .digest('hex'),
  );
  assert.equal(captured.headers['X-Request-Source'], 'fixture');
  await assert.rejects(
    db.eventScope('wrong-host', () =>
      service.followup({
        ...event,
        actions: [{ ...event.actions[0], url: 'https://other.example.test/hook' }],
      }),
    ),
  );
  const list = await ctl.list(a);
  assert.ok(!JSON.stringify(list).includes('local_signing_fixture'));
  assert.equal(list.find((x) => x.id === hmac.id).auth_type, 'hmac_sha256');
  console.log(
    'Integration auth: encrypted Basic/API-key/HMAC, signed timestamp/body, safe static headers, forbidden header/CRLF/host/tenant denial and cached replay passed. HTTP helper mocked only.',
  );
} finally {
  await db.onModuleDestroy();
}
