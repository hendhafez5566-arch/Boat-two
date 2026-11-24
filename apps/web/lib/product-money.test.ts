import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { productDecimal, productMinorUnits, productPriceAfterRates, productRateBps } from './product-money';
test('prices retain exact hundredths through edit/save including large values', () => {
  for (const value of ['0', '1', '15000', '999999999999999', '29']) {
    assert.equal(productMinorUnits(productDecimal(value)), value);
  }
  assert.equal(productMinorUnits('150.00'), '15000');
  assert.equal(productMinorUnits('1.1'), '110');
  assert.equal(productMinorUnits('0.29'), '29');
});
test('invalid or overprecise prices cannot silently round or truncate', () => {
  for (const value of ['1.001', '-1', '1e3', 'abc', '', '1,500', '10000000000000']) {
    assert.throws(() => productMinorUnits(value));
  }
});

test('display omits insignificant zeros without changing hundredths', () => {
  for (const [cents, display] of [['150000', '1500'], ['15050', '150.5'], ['15005', '150.05'], ['0', '0'], ['999999999999999', '9999999999999.99']]) {
    assert.equal(productDecimal(cents), display);
    assert.equal(productMinorUnits(display), cents);
  }
});

test('checkout percentages retain exact basis points and mirror checkout rounding', () => {
  assert.equal(productRateBps('5.25'), 525);
  assert.equal(productRateBps('100.00'), 10000);
  for (const value of ['100.01', '-1', '1.001', '']) {
    assert.throws(() => productRateBps(value));
  }
  assert.equal(productPriceAfterRates('10001', 500, 1000), '10451');
  assert.equal(productPriceAfterRates('101', 5000, 5000), '75');
});
