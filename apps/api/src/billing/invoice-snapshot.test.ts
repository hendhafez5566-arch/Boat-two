import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSnapshot, safeInvoiceUrl } from './invoice-snapshot';
test('invoice links allow only authenticated HTTPS Stripe hosts', () => {
  assert.equal(
    safeInvoiceUrl('https://invoice.stripe.com/i/test'),
    'https://invoice.stripe.com/i/test',
  );
  for (const value of [
    'https://stripe.com.evil.test/a',
    'https://user:secret@stripe.com/a',
    'javascript:alert(1)',
    'http://invoice.stripe.com/a',
  ])
    assert.equal(safeInvoiceUrl(value), null);
});
test('invoice snapshots reject malformed amounts and prioritize paid over equal-time failures', () => {
  const invoice = {
    id: 'in_test',
    currency: 'usd',
    amount_due: 100,
    amount_paid: 0,
    amount_remaining: 100,
    created: 1,
    status: 'open',
  };
  assert.equal(invoiceSnapshot('invoice.updated', { ...invoice, amount_due: -1 }), null);
  assert.equal(invoiceSnapshot('invoice.updated', { ...invoice, currency: 'invalid' }), null);
  const failed = invoiceSnapshot('invoice.payment_failed', invoice)!,
    updated = invoiceSnapshot('invoice.updated', invoice)!,
    paid = invoiceSnapshot('invoice.paid', invoice)!;
  assert.ok(paid.rank > failed.rank && failed.rank > updated.rank);
  assert.equal(paid.status, 'paid');
});

test('licensed subscription quantity is preserved and metered/invalid changes require review', async () => {
  const { licensedQuantity } = await import('./subscription-policy');
  assert.equal(licensedQuantity({ quantity: 5 }), 5);
  assert.equal(licensedQuantity({}), 1);
  for (const quantity of [0, -1, 1.5, 1000001, NaN])
    assert.throws(() => licensedQuantity({ quantity }));
  assert.throws(() =>
    licensedQuantity({ quantity: 1, price: { recurring: { usage_type: 'metered' } } }),
  );
});
