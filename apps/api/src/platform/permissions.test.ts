import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatorPermissions, platformPermissions } from './permissions';
test('operator scopes are explicit, additive and fail closed', () => {
  assert.deepEqual(operatorPermissions('{}', 'owner'), []);
  assert.deepEqual(operatorPermissions('{invalid', 'owner'), []);
  assert.deepEqual(operatorPermissions('{"owner":["support","invalid"]}', 'owner'), []);
  assert.deepEqual(operatorPermissions('{"owner":["toString"]}', 'owner'), []);
  assert.deepEqual(operatorPermissions('{"owner":["billing","security","billing"]}', 'owner'), [
    'subscriptions.write',
    'sessions.revoke',
  ]);
  assert.deepEqual(operatorPermissions('{"owner":["administrator"]}', 'owner'), [
    ...platformPermissions,
  ]);
  assert.deepEqual(operatorPermissions('{"owner":["administrator"]}', 'another'), []);
});
