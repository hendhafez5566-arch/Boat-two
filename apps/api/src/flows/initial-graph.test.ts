import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialFlowGraph } from './initial-graph';
import { validateGraph } from './engine/validate';
import { createFlowSchema } from './flow-schemas';
test('section-specific creation produces localized complete input flows and preserves legacy greeting creation', () => {
  for (const language of ['ar', 'en'] as const) {
    const greeting = initialFlowGraph(language);
    assert.equal(greeting.nodes[0].type, 'message');
    assert.deepEqual(validateGraph(greeting).errors, []);
    const input = initialFlowGraph(language, 'user_input');
    assert.equal(input.nodes[0].type, 'user_input');
    assert.equal(input.nodes[0].data.questions[0].saveAs, 'customer_name');
    assert.deepEqual(validateGraph(input).errors, []);
    const draft = initialFlowGraph(language, 'whatsapp_flow');
    assert.equal(draft.nodes[0].type, 'whatsapp_flow');
    assert.ok(
      validateGraph(draft).errors.length > 0,
      'unconfigured provider form must not publish',
    );
  }
  assert.equal(
    createFlowSchema.safeParse({ name: 'Input', initialNodeType: 'user_input' }).success,
    true,
  );
  assert.equal(
    createFlowSchema.safeParse({ name: 'Unsafe', initialNodeType: 'unsupported' }).success,
    false,
  );
});
