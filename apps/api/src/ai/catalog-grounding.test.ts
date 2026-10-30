/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from 'node:test';
import assert from 'node:assert/strict';
test('catalog grounding honors disabled agents and answers without invoking a paid provider or stale knowledge', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-only-secret-not-used-for-delivery',
    ENCRYPTION_KEY: '0'.repeat(64),
    EXTERNAL_DELIVERY_ENABLED: 'false',
    AI_PROVIDER_CALLS_ENABLED: 'false',
  });
  const { AiService, DEFAULT_SETTINGS } = await import('./ai.service');
  let enabled = false,
    catalogCalls = 0;
  const c = {
    query: async (sql: string) => ({
      rows: sql.includes('FROM ai_agents') ? [{ enabled }] : [],
      rowCount: 1,
    }),
  };
  const db: any = { withTenant: async (_tenant: string, fn: any) => fn(c) };
  const sources: any = {
    answer: async (tenant: string, q: string) => {
      assert.equal(tenant, 'tenant');
      assert.equal(q, 'سعر الثلاثي');
      catalogCalls++;
      return {
        text: 'ثلاثي: 12500 جنيه',
        handoff: false,
        failed: false,
        sources: [{ title: 'Approved catalog' }],
      };
    },
  };
  const service = new AiService(
    db,
    {} as any,
    {} as any,
    {
      search: () => {
        throw Error('Must not retrieve stale knowledge');
      },
    } as any,
    {} as any,
    {} as any,
    sources,
    {} as any,
  );
  const p = {
    tenantId: 'tenant',
    settings: { ...DEFAULT_SETTINGS, enabled: true },
    history: [{ role: 'user' as const, text: 'سعر الثلاثي' }],
    question: 'سعر الثلاثي',
  };
  const disabled = await service.answer(p);
  assert.equal(disabled.reason, 'agent_disabled');
  assert.equal(catalogCalls, 0);
  enabled = true;
  const reply = await service.answer(p);
  assert.equal(reply.text, 'ثلاثي: 12500 جنيه');
  assert.equal(reply.failed, false);
  assert.equal(catalogCalls, 1);
});
