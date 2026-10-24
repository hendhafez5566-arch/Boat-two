import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepUpDigest } from './step-up';
test('operation grants bind method, target and complete body with canonical object keys', () => {
  const digest = stepUpDigest('PATCH', '/platform/users/one', {
    reason: 'reviewed',
    settings: { a: 1, b: [2, 3] },
  });
  assert.equal(
    digest,
    stepUpDigest('patch', '/platform/users/one', {
      settings: { b: [2, 3], a: 1 },
      reason: 'reviewed',
    }),
  );
  for (const changed of [
    stepUpDigest('POST', '/platform/users/one', {
      reason: 'reviewed',
      settings: { a: 1, b: [2, 3] },
    }),
    stepUpDigest('PATCH', '/platform/users/two', {
      reason: 'reviewed',
      settings: { a: 1, b: [2, 3] },
    }),
    stepUpDigest('PATCH', '/platform/users/one', {
      reason: 'reviewed',
      settings: { a: 1, b: [3, 2] },
    }),
  ])
    assert.notEqual(digest, changed);
});
