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
  await db.withTenant(a.tenantId, async c => {
    const provider = (await c.query("INSERT INTO ai_providers(tenant_id,name,kind,model,credentials_enc,enabled) VALUES($1,'Mock failure','openai','mock',$2,true) RETURNING id",[a.tenantId,crypto.encrypt({ apiKey:'fixture_no_network' })])).rows[0].id;
    await c.query("INSERT INTO ai_agents(tenant_id,name,provider_id,enabled,is_default,allowed_tools) VALUES($1,'Failure fixture',$2,true,true,ARRAY[]::text[])",[a.tenantId,provider]);
  });
  let calls=0;
  OpenAiProvider.prototype.chat=async()=>{ calls++; throw new Error('private_provider_body_must_not_be_saved'); };
  env.AI_PROVIDER_CALLS_ENABLED='true';
  const params = { tenantId:a.tenantId,settings:{...DEFAULT_SETTINGS,enabled:true},history:[{role:'user',text:'local test'}],question:'local test' };
  const failed=await ai.answer(params);
  assert.equal(failed.failed,true); assert.equal(failed.handoff,true); assert.equal(calls,1);
  await db.withTenant(a.tenantId,async c=>{
    const runs=(await c.query('SELECT * FROM ai_runs')).rows;
    assert.equal(runs.length,1);assert.equal(runs[0].status,'failed');assert.equal(runs[0].error,'provider_error');assert.equal(runs[0].cost_microusd,null);
    assert.ok(!JSON.stringify(runs).includes('private_provider_body'));
  });
  OpenAiProvider.prototype.chat=async()=>{ calls++;return {text:'Recovered',inputTokens:10,outputTokens:5,toolCalls:[]}; };
  const recovered=await ai.answer({...params,question:'new local request'});
  assert.equal(recovered.failed,false);assert.equal(calls,2);
  OpenAiProvider.prototype.chat=async()=>{ calls++; throw new Error('mock failure'); };
  const noHandoff=await ai.answer({...params,settings:{...params.settings,handoff_enabled:false}});
  assert.equal(noHandoff.failed,true);assert.equal(noHandoff.handoff,false);
  console.log('AI failure audit: sanitized failed run, unknown cost preserved, human handoff, no automatic retry and subsequent mocked recovery passed.');
} finally { await db.onModuleDestroy(); }
