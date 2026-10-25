import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionHealth, HEALTH_TTL_MS } from './connection-health';

test('local activation and website creation never establish provider connectivity', () => {
  assert.equal(connectionHealth({ type: 'whatsapp', status: 'active' }).state, 'needs_action');
  assert.equal(connectionHealth({ type: 'web', status: 'active' }).reason, 'widget_installation_required');
});
test('provider evidence expires; disabled channels override even fresh evidence', () => {
  const now = Date.now();
  const row = { type: 'whatsapp', status: 'active', settings: { connectionHealth: { state: 'connected', checkedAt: new Date(now).toISOString(), reason: 'provider_verified' } } };
  assert.equal(connectionHealth(row, now).state, 'connected');
  assert.equal(connectionHealth(row, now + HEALTH_TTL_MS + 1).state, 'needs_action');
  assert.equal(connectionHealth(row, now - 1).state, 'needs_action');
  assert.equal(connectionHealth({ ...row, status: 'disabled' }, now).state, 'disconnected');
});
