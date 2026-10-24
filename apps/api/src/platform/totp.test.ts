import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTotpSecret, totp, matchingTotpStep } from './totp';
test('TOTP matches RFC 6238 SHA1 vectors', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  for (const [seconds, expected] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ] as const)
    assert.equal(totp(secret, Math.floor(seconds / 30), 8), expected);
});
test('TOTP allows only adjacent windows and fixed six-digit codes', () => {
  const secret = newTotpSecret(),
    step = 100000;
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(matchingTotpStep(secret, totp(secret, step), step * 30000), step);
  assert.equal(matchingTotpStep(secret, totp(secret, step - 1), step * 30000), step - 1);
  assert.equal(matchingTotpStep(secret, totp(secret, step + 1), step * 30000), step + 1);
  assert.equal(matchingTotpStep(secret, 'abc123', step * 30000), null);
  assert.equal(matchingTotpStep(secret, '1234567', step * 30000), null);
  assert.throws(() => totp('invalid', step));
});
