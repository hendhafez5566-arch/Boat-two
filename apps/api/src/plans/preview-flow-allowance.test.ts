import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_FLOW_LIMIT, previewFlowAllowance } from './preview-flow-allowance';

test('one-time preview allowance is bounded, scoped to valid unexpired settings', () => {
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const valid = { previewFlowAllowance: { limit: PREVIEW_FLOW_LIMIT, expiresAt: '2026-11-28T12:00:00.000Z' } };
  assert.deepEqual(previewFlowAllowance(valid, now), valid.previewFlowAllowance);
  assert.equal(previewFlowAllowance(valid, now + 4 * 86400000), null);
  assert.equal(previewFlowAllowance({ previewFlowAllowance: { ...valid.previewFlowAllowance, limit: 2000 } }, now), null);
  assert.equal(previewFlowAllowance({ previewFlowAllowance: { limit: 20, expiresAt: '2031-01-01' } }, now), null);
  assert.equal(previewFlowAllowance({}, now), null);
  assert.equal(previewFlowAllowance(null, now), null);
});
