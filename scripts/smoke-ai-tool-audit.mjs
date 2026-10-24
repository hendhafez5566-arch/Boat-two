import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { env } = require('./dist/config/env.js');
const { DatabaseService } = require('./dist/database/database.service.js');
const { PlansService } = require('./dist/plans/plans.service.js');
const { ExternalEffects } = require('./dist/events/external-effect.js');
const { CryptoService } = require('./dist/messaging/crypto.service.js');
const { AiService, DEFAULT_SETTINGS } = require('./dist/ai/ai.service.js');
const { AiToolExecution } = require('./dist/ai/tool-execution.js');
const { AgentsController } = require('./dist/ai/agents.controller.js');
const { OpenAiProvider } = require('./dist/ai/providers/openai.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  crypto = new CryptoService(),
  tools = new AiToolExecution(db),
  controller = new AgentsController(db, plans, crypto);
const ai = new AiService(
    db,
    new ExternalEffects(db),
    plans,
    { search: async () => [] },
    crypto,
    tools,
  ),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const r = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `tool-${randomUUID()}@example.test`,
      password: randomBytes(20).toString('hex'),
      fullName: 'AI tool fixture',
      workspaceName: 'AI tool fixture',
    }),
  });
  assert.equal(r.status, 201);
  const a = await r.json();
  a.user = JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub;
  return a;
}
try {
  const a = await fixture(),
    b = await fixture();
  let provider, agent, contact;
  await db.withTenant(a.tenantId, async (c) => {
    provider = (
      await c.query(
        "INSERT INTO ai_providers(tenant_id,name,kind,model,credentials_enc,enabled,input_microusd_per_million,output_microusd_per_million) VALUES($1,'Mock provider','openai','mock-model',$2,true,1000000,2000000) RETURNING id",
        [a.tenantId, crypto.encrypt({ apiKey: 'local_mock_key_no_network' })],
      )
    ).rows[0].id;
    agent = (
      await c.query(
        "INSERT INTO ai_agents(tenant_id,name,provider_id,enabled,is_default,allowed_tools) VALUES($1,'Audited agent',$2,true,true,ARRAY['create_followup','tag_contact','handoff_to_human']) RETURNING id",
        [a.tenantId, provider],
      )
    ).rows[0].id;
    contact = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Current contact fixture') RETURNING id",
        [a.tenantId],
      )
    ).rows[0].id;
  });
  let calls = 0;
  OpenAiProvider.prototype.chat = async () => {
    calls++;
    return {
      text: 'Mocked response',
      inputTokens: 100,
      outputTokens: 50,
      stopReason: 'tool_use',
      toolCalls: [
        { name: 'create_followup', input: { title: 'Local private title', dueHours: 3 } },
        { name: 'tag_contact', input: { tag: 'qualified' } },
        { name: 'handoff_to_human', input: { reason: 'Human requested' } },
        { name: 'create_followup', input: { title: 'Must not execute', dueHours: 1 } },
        { name: 'unknown_tool', input: { customerSecret: 'never store this' } },
      ],
    };
  };
  env.AI_PROVIDER_CALLS_ENABLED = 'true';
  const result = await ai.answer({
    tenantId: a.tenantId,
    settings: { ...DEFAULT_SETTINGS, enabled: true },
    history: [{ role: 'user', text: 'Please follow up' }],
    question: 'Please follow up',
    contactId: contact,
  });
  assert.equal(result.failed, false);
  assert.equal(result.handoff, true);
  assert.equal(calls, 1);
  const audit = await controller.audits({ user: { tenantId: a.tenantId } }, {});
  assert.equal(audit.length, 5);
  assert.deepEqual(
    [...audit].sort((x, y) => x.tool_index - y.tool_index).map((r) => r.outcome),
    ['applied', 'applied', 'applied', 'limit', 'denied'],
  );
  assert.ok(!JSON.stringify(audit).includes('never store this'));
  assert.ok(!JSON.stringify(audit).includes('Local private title'));
  const run = (await db.withTenant(a.tenantId, (c) => c.query('SELECT * FROM ai_runs'))).rows[0];
  assert.equal(run.model, 'mock-model');
  assert.equal(Number(run.cost_microusd), 200);
  assert.equal(Number(run.input_rate_microusd), 1000000);
  assert.equal(Number(run.output_rate_microusd), 2000000);
  assert.equal(
    (
      await db.withTenant(a.tenantId, (c) =>
        c.query('SELECT * FROM crm_tasks WHERE contact_id=$1', [contact]),
      )
    ).rowCount,
    1,
  );
  const response = await tools.execute(a.tenantId, run.id, agent, contact, true, [
    { name: 'create_followup', input: { title: 'Local private title', dueHours: 3 } },
  ]);
  assert.equal(response.actions, 1);
  assert.equal(
    (await db.withTenant(a.tenantId, (c) => c.query('SELECT * FROM crm_tasks'))).rowCount,
    1,
    'Audit replay cannot duplicate CRM tasks',
  );
  await assert.rejects(
    () =>
      tools.execute(a.tenantId, run.id, agent, contact, true, [
        { name: 'create_followup', input: { title: 'Changed replay', dueHours: 3 } },
      ]),
    /changed its input/,
  );
  await assert.rejects(
    () => tools.execute(b.tenantId, run.id, null, undefined, true, []),
    /outside/,
  );
  assert.equal((await controller.audits({ user: { tenantId: b.tenantId } }, {})).length, 0);
  const second = (
    await db.withTenant(a.tenantId, (c) =>
      c.query(
        "INSERT INTO ai_runs(tenant_id,agent_id,model,status) VALUES($1,$2,'mock','completed') RETURNING id",
        [a.tenantId, agent],
      ),
    )
  ).rows[0].id;
  await tools.execute(a.tenantId, second, agent, contact, true, [
    { name: 'create_followup', input: { title: '', dueHours: 999 } },
    { name: 'tag_contact', input: { tag: 'qualified' } },
  ]);
  const secondAudit = await controller.audits(
    { user: { tenantId: a.tenantId } },
    { runId: second },
  );
  assert.deepEqual(
    secondAudit.sort((x, y) => x.tool_index - y.tool_index).map((r) => r.outcome),
    ['invalid', 'noop'],
  );
  await db.withTenant(a.tenantId, (c) =>
    c.query('UPDATE ai_agents SET allowed_tools=ARRAY[]::text[] WHERE id=$1', [agent]),
  );
  const third = (
    await db.withTenant(a.tenantId, (c) =>
      c.query(
        "INSERT INTO ai_runs(tenant_id,agent_id,model,status) VALUES($1,$2,'mock','completed') RETURNING id",
        [a.tenantId, agent],
      ),
    )
  ).rows[0].id;
  await tools.execute(a.tenantId, third, agent, contact, true, [
    { name: 'create_followup', input: { title: 'Revoked tool', dueHours: 1 } },
  ]);
  assert.equal(
    (await controller.audits({ user: { tenantId: a.tenantId } }, { runId: third }))[0].outcome,
    'denied',
  );
  console.log(
    'PASS AI tool audit: mocked generation, immutable cost-rate snapshots, applied/invalid/denied/limit/noop decisions, private input hashes, idempotent local effects, changed replay rejection, live permission recheck and tenant isolation.',
  );
} finally {
  env.AI_PROVIDER_CALLS_ENABLED = 'false';
  await db.onModuleDestroy();
}
