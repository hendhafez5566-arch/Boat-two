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
    b = await fixture(),
    d = await fixture();
  const { GenerationBudget } = require('./dist/ai/generation-budget.js');
  const { GenerationController } = require('./dist/ai/generation.controller.js');
  const { ExternalEffects } = require('./dist/events/external-effect.js');
  const { createHash } = await import('node:crypto');
  const plans = { getTenantPlan: async () => ({ limits: { ai_credits: 10 } }) };
  const budget = new GenerationBudget(db, plans, new ExternalEffects(db)),
    ctl = new GenerationController(db, plans);
  const model = {
    model: 'mock',
    context_token_limit: 32000,
    max_output_tokens: 600,
    supports_tools: true,
    input_rate_microusd: 1000000,
    output_rate_microusd: 2000000,
  };
  const req = {
    system: 'fixture',
    messages: [{ role: 'user', content: 'local' }],
    maxTokens: 100,
    temperature: 0,
  };
  const response = {
    text: 'mock',
    toolCalls: [],
    inputTokens: 10,
    outputTokens: 5,
    stopReason: null,
  };
  await ctl.policy(a, { revision: 0, monthlyCalls: 1, monthlyTokens: 20000, monthlyCostUsd: 1 });
  let calls = 0;
  const results = await Promise.allSettled(
    ['race-a', 'race-b'].map((key) =>
      db.eventScope(key, () =>
        budget.execute(a.user.tenantId, req, model, async () => {
          calls++;
          return response;
        }),
      ),
    ),
  );
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(calls, 1);
  const status = await ctl.status(a);
  assert.equal(status.usage.attempts, 1);
  assert.equal(Number(status.usage.charged_tokens), 15);
  assert.equal(Number(status.usage.reserved_tokens), 0);
  assert.equal(Number(status.usage.charged_cost_microusd), 20);
  await assert.rejects(budget.reserve(a.user.tenantId, 'different', req, model));
  let unknownCalls = 0;
  const unknown = () =>
    db.eventScope('uncertain', () =>
      budget.execute(b.user.tenantId, req, model, async () => {
        unknownCalls++;
        throw new Error('mock timeout');
      }),
    );
  await assert.rejects(unknown());
  await assert.rejects(unknown());
  assert.equal(unknownCalls, 1);
  const held = (await ctl.status(b)).reservations[0];
  assert.equal(held.status, 'uncertain');
  assert.ok(Number(held.reserved_tokens) > 0);
  await assert.rejects(
    ctl.release(a, held.id, {
      confirmedNotBilled: true,
      evidence: 'Fixture provider confirms no charge',
    }),
  );
  await db.withTenant(b.user.tenantId, (c) =>
    c.query(
      "UPDATE generation_reservations SET updated_at=now()-interval '3 minutes' WHERE id=$1",
      [held.id],
    ),
  );
  await ctl.release(b, held.id, {
    confirmedNotBilled: true,
    evidence: 'Fixture provider confirms no charge',
  });
  await assert.rejects(unknown());
  assert.equal(unknownCalls, 1);
  assert.equal(Number((await ctl.status(b)).usage.reserved_tokens), 0);
  // Simulated crash after durable provider evidence but before settlement.
  const reserved = await budget.reserve(d.user.tenantId, 'generation:crash:0', req, model);
  await db.withTenant(d.user.tenantId, async (c) => {
    await c.query("UPDATE generation_reservations SET status='started' WHERE id=$1", [reserved.id]);
    await c.query(
      "INSERT INTO external_effects(tenant_id,effect_key,request_hash,status,result) VALUES($1,$2,$3,'completed',$4)",
      [
        d.user.tenantId,
        'generation:' + reserved.id + ':0',
        createHash('sha256')
          .update(JSON.stringify({ model, request: req }))
          .digest('hex'),
        JSON.stringify(response),
      ],
    );
  });
  const restored = await db.eventScope('crash', () =>
    budget.execute(d.user.tenantId, req, model, async () => {
      throw new Error('Must not call');
    }),
  );
  assert.equal(restored.response.text, 'mock');
  await db.eventScope('crash', () =>
    budget.execute(d.user.tenantId, req, model, async () => {
      throw new Error('Must not replay');
    }),
  );
  assert.equal((await ctl.status(d)).usage.attempts, 1);
  await assert.rejects(
    db.withTenant(d.user.tenantId, async () => {
      await db.eventScope('rollback', () =>
        budget.execute(d.user.tenantId, req, model, async () => response),
      );
      throw new Error('fixture rollback');
    }),
  );
  assert.equal((await ctl.status(d)).usage.attempts, 2);
  await assert.rejects(
    budget.reserve(d.user.tenantId, 'context', { ...req, maxTokens: 100000 }, model),
  );
  await ctl.policy(d, { revision: 0, monthlyCalls: null, monthlyTokens: null, monthlyCostUsd: 0 });
  await assert.rejects(budget.reserve(d.user.tenantId, 'cost', req, model));
  await assert.rejects(
    budget.reserve(d.user.tenantId, 'unknown-price', req, { ...model, input_rate_microusd: null }),
  );
  assert.ok(!(await ctl.status(b)).reservations.some((r) => r.id === reserved.id));
  await ctl.policy(b,{revision:0,monthlyCalls:null,monthlyTokens:0,monthlyCostUsd:null});
  await assert.rejects(budget.reserve(b.user.tenantId,'token-cap',req,model));
  const noPlan = new GenerationBudget(db,{getTenantPlan:async()=>({limits:{ai_credits:0}})},new ExternalEffects(db));
  await assert.rejects(noPlan.reserve(d.user.tenantId,'plan-cap',req,model));
  await assert.rejects(budget.reserve(d.user.tenantId,'tools',{...req,tools:[{name:'handoff_to_human',description:'fixture',input_schema:{}}]},{...model,supports_tools:false}));
  console.log(
    'Generation budgets: atomic race/call/token/cost caps, durable rollback, crash cached settlement/replay, unknown outcome hold, evidence release, input/capability guards and tenant isolation passed.',
  );
} finally {
  await db.onModuleDestroy();
}
