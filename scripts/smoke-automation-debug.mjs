import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js'),
  { PlansService } = local('./dist/plans/plans.service.js'),
  { AutomationService } = local('./dist/business/automation.service.js'),
  { ExternalEffects } = local('./dist/events/external-effect.js'),
  { CryptoService } = local('./dist/messaging/crypto.service.js');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  engine = new AutomationService(
    db,
    new PlansService(db),
    { publish: async () => {} },
    new ExternalEffects(db),
    new CryptoService(),
  );
async function call(path, body, token) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
try {
  const a = await call('/auth/register', {
    email: `debug-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Debug fixture',
    workspaceName: 'Debug fixture',
  });
  const ct = await call('/crm/contacts', { name: 'Debug contact' }, a.accessToken),
    rule = await call(
      '/automations',
      {
        name: 'Delayed debug',
        enabled: true,
        trigger: 'automation.scheduled',
        conditions: {},
        actions: [{ type: 'note', text: 'Not automatically scheduled' }],
      },
      a.accessToken,
    );
  const event = await db.withTenant(
    a.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key,available_at) VALUES($1,'automation.followup',$2,'{}',$3,now()+interval '1 day') RETURNING id",
          [a.tenantId, ct.id, randomUUID()],
        )
      ).rows[0].id,
  );
  const input = {
    tenantId: a.tenantId,
    contactId: ct.id,
    eventId: event,
    ruleId: rule.id,
    ruleRevision: 1,
    actionPath: 'root.0.actions',
    actions: [
      {
        type: 'branch',
        conditions: {},
        then: [{ type: 'http', url: 'https://example.test/no-network', body: '{}' }],
        otherwise: [],
      },
    ],
  };
  await assert.rejects(engine.followup(input), /disabled/);
  const failure = (await call('/automations/failures', undefined, a.accessToken)).find(
    (x) => x.event_id === event,
  );
  assert.ok(failure);
  assert.equal(failure.action_path, 'root.0.actions.0.then.0');
  assert.equal(failure.action_type, 'http');
  assert.equal(failure.rule_revision, 1);
  assert.ok(!JSON.stringify(failure).includes('no-network'));
  await engine.followup({
    ...input,
    actions: [{ type: 'note', text: 'Recovered delayed action' }],
  });
  assert.ok(
    (await call('/automations/failures', undefined, a.accessToken)).find((x) => x.id === failure.id)
      .resolved_at,
  );
  console.log(
    'Automation debug: delayed nested HTTP failure records exact path/type/original revision without action body/URL, persists through rollback, and resolves after safe local recovery. No external calls.',
  );
} finally {
  await db.onModuleDestroy();
}
