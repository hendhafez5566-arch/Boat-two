import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost } from './cost';
test('token cost uses configured per-million rates and keeps unknown prices unknown', () => {
  assert.equal(estimateCost(1000, 500, 3000000, 15000000), 10500);
  assert.equal(estimateCost(1000, 500, null, 15000000), null);
  assert.equal(estimateCost(100, 100, 0, 0), 0);
  assert.equal(estimateCost(-1, 0, 3000000, 15000000), null);
});
