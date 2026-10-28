import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingMoney, billingDocument } from './billing-display';
test('billing amounts respect currency minor units and reject invalid input', () => {
  assert.match(billingMoney('12345', 'usd'), /123\.45/);
  assert.match(billingMoney('12345', 'JPY'), /12,345/);
  assert.match(billingMoney('12345', 'kwd'), /12\.345/);
  assert.equal(billingMoney('not a number', 'usd'), '—');
  assert.equal(billingMoney('123', 'invalid'), '—');
});
test('invoice documents reject script URLs, embedded credentials and lookalike hosts', () => {
  assert.equal(
    billingDocument('https://invoice.stripe.com/i/test'),
    'https://invoice.stripe.com/i/test',
  );
  for (const url of [
    'javascript:alert(1)',
    'http://stripe.com/a',
    'https://stripe.com.attacker.test/a',
    'https://name:secret@stripe.com/a',
    'https://example.com/invoice',
  ])
    assert.equal(billingDocument(url), null);
});
