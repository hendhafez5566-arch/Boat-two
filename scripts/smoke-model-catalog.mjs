import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const db = new DatabaseService();
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const res = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `snapshot-${randomUUID()}@example.test`, password: randomUUID()+randomUUID(), fullName: 'Snapshot fixture', workspaceName: 'Snapshot fixture' }) });
  assert.equal(res.status, 201); const data = await res.json();
  return { user: { tenantId: data.tenantId, userId: JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64url')).sub } };
}
try {
  const a=await fixture(), b=await fixture();
  const { AgentsController }=require('./dist/ai/agents.controller.js');
  const { CryptoService }=require('./dist/messaging/crypto.service.js');
  const ctl=new AgentsController(db,{},new CryptoService());
  const p=await ctl.provider(a,{name:'Catalog fixture',kind:'openai',model:'mock',apiKey:'fixture_no_network',inputUsdPerMillion:1,outputUsdPerMillion:2});
  let versions=await ctl.models(a);const initial=versions.find(v=>v.provider_id===p.id);
  assert.equal(initial.max_output_tokens,600);assert.equal(Number(initial.input_rate_microusd),1000000);
  await ctl.providerStatus(a,p.id,{revision:1,model:'mock-v2',contextTokenLimit:8192,maxOutputTokens:1000,inputUsdPerMillion:3});
  versions=(await ctl.models(a)).filter(v=>v.provider_id===p.id);
  assert.equal(versions.length,2);assert.equal(versions[0].max_output_tokens,1000);assert.equal(versions[0].model,'mock-v2');
  assert.equal(Number(versions[1].input_rate_microusd),1000000);
  await assert.rejects(ctl.providerStatus(a,p.id,{revision:2,contextTokenLimit:1024,maxOutputTokens:1024}));
  assert.ok(!(await ctl.models(b)).some(v=>v.provider_id===p.id));
  await assert.rejects(db.withTenant(a.user.tenantId,c=>c.query('UPDATE ai_model_versions SET model=$2 WHERE id=$1',[initial.id,'tamper'])));
  console.log('Model catalog: immutable pricing/capability versions, context/output validation, migration trigger and tenant isolation passed.');
} finally { await db.onModuleDestroy(); }
