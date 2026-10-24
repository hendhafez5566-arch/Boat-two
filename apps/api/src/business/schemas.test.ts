import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionsSchema, conditionWhere, actionSchema } from './schemas';
test('nested AND/OR conditions compile to bound SQL and reject excessive depth', () => {
  const value = "x%' OR 1=1 --";
  const parsed = conditionsSchema.parse({ allOf: [{ anyOf: [{ tag: 'vip' }, { q: value }] }] });
  const compiled = conditionWhere(parsed);
  assert.ok(compiled.sql.includes(' OR '));
  assert.ok(compiled.params.some((v) => typeof v === 'string' && v.includes('OR 1=1')));
  assert.ok(!compiled.sql.includes(value));
  let deep: unknown = { tag: 'vip' };
  for (let i = 0; i < 7; i++) deep = { allOf: [deep] };
  assert.equal(conditionsSchema.safeParse(deep).success, false);
});
test('recursive automation branches/delays keep HTTPS policy and bounded nesting', () => {
  const nested = {
    type: 'branch',
    conditions: {},
    then: [
      {
        type: 'delay',
        delayMinutes: 5,
        actions: [
          { type: 'branch', conditions: { tag: 'vip' }, then: [{ type: 'note', text: 'Hello' }] },
        ],
      },
    ],
  };
  assert.equal(actionSchema.safeParse(nested).success, true);
  assert.equal(
    actionSchema.safeParse({ type: 'http', url: 'http://example.test', body: '' }).success,
    false,
  );
  let deep: unknown = { type: 'note', text: 'end' };
  for (let i = 0; i < 7; i++) deep = { type: 'delay', delayMinutes: 1, actions: [deep] };
  assert.equal(actionSchema.safeParse(deep).success, false);
});
