import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatorPermissions, platformPermissions } from './permissions';
test('operator scopes are explicit, additive and fail closed', () => {
  assert.deepEqual(operatorPermissions('{}', 'owner'), []);
  assert.deepEqual(operatorPermissions('{invalid', 'owner'), []);
  assert.deepEqual(operatorPermissions('{"owner":["support","invalid"]}', 'owner'), []);
  assert.deepEqual(operatorPermissions('{"owner":["toString"]}', 'owner'), []);
  const combined = operatorPermissions('{"owner":["billing","security","billing"]}', 'owner');
  for (const permission of [
    'subscriptions.write',
    'sessions.revoke',
    'companies.read',
    'users.read',
    'audit.read',
    'reports.read',
  ])
    assert.ok(combined.includes(permission as (typeof combined)[number]));
  assert.equal(new Set(combined).size, combined.length);
  assert.ok(!operatorPermissions('{"owner":["support"]}', 'owner').includes('audit.read'));
  assert.ok(!operatorPermissions('{"owner":["catalog"]}', 'owner').includes('users.read'));
  assert.deepEqual(operatorPermissions('{"owner":["administrator"]}', 'owner'), [
    ...platformPermissions,
  ]);
  assert.deepEqual(operatorPermissions('{"owner":["administrator"]}', 'another'), []);
});
