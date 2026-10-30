import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingMoney, billingDocument, billingDate } from './billing-display';
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

test('subscription dates use explicit language, named months and saved account timezone', () => {
  assert.equal(billingDate('2026-11-07T22:30:00Z', 'en', 'Africa/Cairo'), '8 November 2026');
  assert.match(billingDate('2026-11-07T22:30:00Z', 'ar', 'Africa/Cairo'), /نوفمبر/);
  assert.equal(billingDate('invalid', 'ar', 'UTC'), '—');
  assert.equal(billingDate('2026-11-07', 'en', 'invalid'), '—');
});
