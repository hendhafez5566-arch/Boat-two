import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js'),
  { DatabaseService } = require('./dist/database/database.service.js'),
  { PlansService } = require('./dist/plans/plans.service.js'),
  { AuthService } = require('./dist/auth/auth.service.js'),
  { JwtService } = require('@nestjs/jwt'),
  { EventsService } = require('./dist/events/events.service.js'),
  { EventEmitter2 } = require('@nestjs/event-emitter'),
  { ExternalEffects } = require('./dist/events/external-effect.js'),
  { CryptoService } = require('./dist/messaging/crypto.service.js'),
  { AutomationService } = require('./dist/business/automation.service.js'),
  { OperationsController } = require('./dist/business/operations.controller.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  events = new EventsService(db, new EventEmitter2()),
  auth = new AuthService(db, new JwtService({ secret: env.JWT_SECRET }), plans),
  ops = new OperationsController(db, plans, events, {}),
  engine = new AutomationService(db, plans, events, new ExternalEffects(db), new CryptoService());
async function fixture() {
  return auth.register({
    email: 'nested-' + randomUUID() + '@example.test',
    password: randomBytes(20).toString('hex'),
    fullName: 'Nested fixture',
    workspaceName: 'Nested fixture',
  });
}
try {
  const a = await fixture(),
    b = await fixture(),
    req = { user: { tenantId: a.tenantId } },
    other = { user: { tenantId: b.tenantId } };
  const input = {
    name: 'Nested actual execution',
    enabled: true,
    trigger: 'crm.contacts.insert',
    conditions: {
      allOf: [{ anyOf: [{ tag: 'vip' }, { lifecycle: 'customer' }] }, { q: 'Nested contact' }],
    },
    actions: [
      {
        type: 'branch',
        conditions: { tag: 'vip' },
        then: [
          { type: 'tag', tag: 'first' },
          {
            type: 'branch',
            conditions: { tag: 'first' },
            then: [{ type: 'note', text: 'Nested branch actually executed' }],
            otherwise: [{ type: 'note', text: 'Must not execute' }],
          },
        ],
        otherwise: [],
      },
      {
        type: 'delay',
        delayMinutes: 5,
        actions: [
          { type: 'branch', conditions: { tag: 'first' }, then: [{ type: 'tag', tag: 'delayed' }] },
        ],
      },
    ],
  };
  const rule = await ops.create(req, input);
  assert.equal(rule.revision, 1);
  const contact = (
    await db.withTenant(a.tenantId, (c) =>
      c.query(
        "INSERT INTO contacts(tenant_id,name,tags) VALUES($1,'Nested contact',ARRAY['vip']) RETURNING id",
        [a.tenantId],
      ),
    )
  ).rows[0].id;
  const event = (
    await db.withTenant(a.tenantId, (c) =>
      c.query("SELECT id FROM domain_events WHERE aggregate_id=$1 AND type='crm.contacts.insert'", [
        contact,
      ]),
    )
  ).rows[0].id;
  await engine.handle({
    id: event,
    tenantId: a.tenantId,
    type: 'crm.contacts.insert',
    payload: { contactId: contact },
  });
  const notes = (
    await db.withTenant(a.tenantId, (c) =>
      c.query('SELECT body FROM crm_notes WHERE contact_id=$1', [contact]),
    )
  ).rows;
  assert.deepEqual(
    notes.map((n) => n.body),
    ['Nested branch actually executed'],
  );
  const delayed = (
    await db.withTenant(a.tenantId, (c) =>
      c.query("SELECT * FROM domain_events WHERE aggregate_id=$1 AND type='automation.followup'", [
        contact,
      ]),
    )
  ).rows[0];
  assert.ok(delayed);
  await engine.followup({
    tenantId: a.tenantId,
    contactId: contact,
    actions: delayed.payload.actions,
    eventId: delayed.id,
    ruleId: rule.id,
  });
  assert.ok(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT tags FROM contacts WHERE id=$1', [contact]),
      )
    ).rows[0].tags.includes('delayed'),
  );
  const saved = await ops.update(req, rule.id, {
    ...input,
    expectedRevision: 1,
    canvasPositions: { 'root.0': { x: 22, y: 40 } },
  });
  assert.equal(saved.revision, 2);
  assert.equal(saved.canvas_positions['root.0'].x, 22);
  await assert.rejects(
    () => ops.update(req, rule.id, { ...input, expectedRevision: 1 }),
    /Workflow changed/,
  );
  assert.equal((await ops.versions(req, rule.id)).length, 2);
  assert.equal((await ops.versions(other, rule.id)).length, 0);
  await engine.handle({
    id: event,
    tenantId: a.tenantId,
    type: 'crm.contacts.insert',
    payload: { contactId: contact },
  });
  assert.equal(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT * FROM crm_notes WHERE contact_id=$1', [contact]),
      )
    ).rowCount,
    1,
  );
  console.log(
    'PASS nested automations: recursive conditions, actual nested branch and delayed branch execution, root replay suppression, saved layout, revision conflict, immutable history and tenant isolation. No external calls.',
  );
} finally {
  await db.onModuleDestroy();
}
