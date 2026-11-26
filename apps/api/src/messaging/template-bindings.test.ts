import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { resolveTemplateBody, validateTemplateBindings } from './template-bindings';

function fixture(orders: { id: string; status: string }[]) {
  const queries: unknown[][] = [];
  const client = {
    query: async (_sql: string, params: unknown[]) => {
      queries.push(params);
      return {
        rows:
          queries.length === 1
            ? [
                {
                  name: 'QA Guest',
                  contact_id: 'contact',
                  channel_id: 'channel',
                  tenant_id: 'tenant',
                },
              ]
            : orders,
      };
    },
  } as unknown as PoolClient;
  return { client, queries };
}
test('template bindings resolve the customer and one unambiguous order in the conversation', async () => {
  const { client, queries } = fixture([{ id: 'order-qa', status: 'confirmed' }]);
  assert.deepEqual(
    await resolveTemplateBody(client, 'conversation', [
      'prefix literal',
      '{{contact.name}}',
      '{{order.id}}',
      '{{order.status}}',
    ]),
    ['prefix literal', 'QA Guest', 'order-qa', 'confirmed'],
  );
  assert.deepEqual(queries[1], ['tenant', 'contact', 'conversation', 'channel']);
});
test('missing or ambiguous order blocks delivery; unknown or embedded fields never interpolate', async () => {
  for (const orders of [
    [],
    [
      { id: '1', status: 'new' },
      { id: '2', status: 'confirmed' },
    ],
  ]) {
    await assert.rejects(
      resolveTemplateBody(fixture(orders).client, 'conversation', ['{{order.id}}']),
      /Required template field/,
    );
  }
  for (const invalid of ['{{contact.phone}}', 'Hello {{contact.name}}', '{{contact.attr.secret}}'])
    assert.throws(() => validateTemplateBindings([invalid]), /supported field by itself/);
});
test('literal parameters do not query customer records', async () => {
  const { client, queries } = fixture([]);
  assert.deepEqual(await resolveTemplateBody(client, 'conversation', ['QA-1400']), ['QA-1400']);
  assert.equal(queries.length, 0);
});
