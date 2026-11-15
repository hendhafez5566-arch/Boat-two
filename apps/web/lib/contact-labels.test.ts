import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectContactLabels, contactAttributes } from './contact-labels';
test('label collection keeps stored labels and pending input while enforcing API bounds', () => {
  assert.deepEqual(collectContactLabels(['VIP', 'سياحة'], 'VIP، متابعة, جديد'), [
    'VIP',
    'سياحة',
    'متابعة',
    'جديد',
  ]);
  assert.throws(
    () => collectContactLabels([], Array.from({ length: 31 }, (_, i) => 'tag' + i).join(',')),
    /LABEL_COUNT/,
  );
  assert.throws(() => collectContactLabels([], 'a'.repeat(51)), /LABEL_LENGTH/);
});
test('advanced attributes reject arrays and nested values without silently dropping data', () => {
  assert.deepEqual(contactAttributes('{"kept":"value","number":0,"flag":false,"empty":null}'), {
    kept: 'value',
    number: 0,
    flag: false,
    empty: null,
  });
  for (const value of ['[]', 'null', '{"nested":{}}', '{broken'])
    assert.throws(() => contactAttributes(value));
});
