import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { productDecimal, productMinorUnits } from './product-money';
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
