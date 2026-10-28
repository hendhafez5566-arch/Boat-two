import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContactField, type ContactField } from './inbox-contact-fields';
const field = (type: ContactField['type']): ContactField => ({
  id: 'field',
  key: 'value',
  label: 'Value',
  type,
});
test('field edits preserve zero and false instead of erasing them', () => {
  assert.equal(parseContactField(field('number'), '0'), 0);
  assert.equal(parseContactField(field('number'), '-12.5'), -12.5);
  assert.equal(parseContactField(field('boolean'), 'false'), false);
  assert.equal(parseContactField(field('boolean'), 'true'), true);
  assert.equal(parseContactField(field('text'), '  text  '), '  text  ');
});
test('clearing a field is explicit null for the partial profile update', () => {
  for (const type of ['text', 'number', 'date', 'boolean'] as const)
    assert.equal(parseContactField(field(type), ''), null);
});
test('rejects invalid dates numbers and boolean strings before persisting', () => {
  assert.throws(() => parseContactField(field('number'), 'Infinity'));
  assert.throws(() => parseContactField(field('number'), 'abc'));
  assert.throws(() => parseContactField(field('boolean'), 'yes'));
  assert.throws(() => parseContactField(field('date'), '2026-02-29'));
  assert.throws(() => parseContactField(field('date'), '2026-04-31'));
  assert.throws(() => parseContactField(field('date'), '28/10/2026'));
  assert.equal(parseContactField(field('date'), '2028-02-29'), '2028-02-29');
  assert.throws(() => parseContactField(field('text'), 'x'.repeat(2001)));
});
