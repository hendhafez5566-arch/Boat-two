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
const { OpenAiProvider } = require('./dist/ai/providers/openai.js');
const db = new DatabaseService(),
  plans = new PlansService(db),
  crypto = new CryptoService(),
  tools = new AiToolExecution(db);
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
  const a = await fixture();
  let contact;
  await db.withTenant(a.tenantId, async (c) => {
    const p = (
      await c.query(
        "INSERT INTO ai_providers(tenant_id,name,kind,model,credentials_enc,enabled,input_microusd_per_million,output_microusd_per_million) VALUES($1,'Mock replay','openai','mock',$2,true,1000000,2000000) RETURNING id",
        [a.tenantId, crypto.encrypt({ apiKey: 'fixture_key' })],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO ai_agents(tenant_id,name,provider_id,enabled,is_default,allowed_tools) VALUES($1,'Replay agent',$2,true,true,ARRAY['create_followup'])",
      [a.tenantId, p],
    );
    contact = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Replay contact') RETURNING id",
        [a.tenantId],
      )
    ).rows[0].id;
  });
  env.AI_PROVIDER_CALLS_ENABLED = 'true';
  let calls = 0;
  OpenAiProvider.prototype.chat = async () => {
    calls++;
    return {
      text: 'Fixture reply',
      inputTokens: 20,
      outputTokens: 10,
      toolCalls: [{ name: 'create_followup', input: { title: 'Fixture task', dueHours: 1 } }],
      stopReason: null,
    };
  };
  const p = {
    tenantId: a.tenantId,
    settings: { ...DEFAULT_SETTINGS, enabled: true },
    history: [{ role: 'user', text: 'Fixture' }],
    question: 'Fixture',
    contactId: contact,
  };
  for (let i = 0; i < 2; i++)
    assert.equal((await db.eventScope('fixture-replay', () => ai.answer(p))).failed, false);
  assert.equal(calls, 1);
  await db.withTenant(a.tenantId, async (c) => {
    assert.equal((await c.query('SELECT count(*)::int AS n FROM ai_runs')).rows[0].n, 1);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM crm_tasks')).rows[0].n, 1);
    assert.equal((await c.query('SELECT replies FROM ai_usage')).rows[0].replies, 1);
    assert.equal((await c.query('SELECT attempts FROM generation_usage')).rows[0].attempts, 1);
  });
  const usage = await ai.usage(a.tenantId);
  assert.equal(usage.attempts, 1);
  assert.equal(usage.reservedTokens, 0);
  console.log(
    'Generation runtime replay: one mocked call, one run, one tool task, one local usage charge and durable ledger/dashboard passed.',
  );
} finally {
  await db.onModuleDestroy();
}
