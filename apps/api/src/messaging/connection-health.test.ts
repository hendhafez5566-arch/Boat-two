import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionHealth, HEALTH_TTL_MS } from './connection-health';

test('local activation and website creation never establish provider connectivity', () => {
  assert.equal(connectionHealth({ type: 'whatsapp', status: 'active' }).state, 'needs_action');
  assert.equal(
    connectionHealth({ type: 'web', status: 'active' }).reason,
    'widget_installation_required',
  );
});
test('provider evidence expires; disabled channels override even fresh evidence', () => {
  const now = Date.now();
  const row = {
    type: 'whatsapp',
    status: 'active',
    settings: {
      connectionHealth: {
        state: 'connected',
        checkedAt: new Date(now).toISOString(),
        reason: 'provider_verified',
      },
    },
  };
  assert.equal(connectionHealth(row, now).state, 'connected');
  assert.equal(connectionHealth(row, now + HEALTH_TTL_MS + 1).state, 'needs_action');
  assert.equal(connectionHealth(row, now - 1).state, 'needs_action');
  assert.equal(connectionHealth({ ...row, status: 'disabled' }, now).state, 'disconnected');
});
test('expired or revoked authorization overrides previously green provider evidence', () => {
  const now = Date.now();
  const healthy = {
    state: 'connected',
    checkedAt: new Date(now).toISOString(),
    reason: 'provider_verified',
  };
  const row = {
    type: 'whatsapp',
    status: 'active',
    settings: {
      connectionHealth: healthy,
      metaAuthorization: { status: 'invalid_token', checkedAt: healthy.checkedAt },
    },
  };
  assert.equal(connectionHealth(row, now).state, 'expired');
  row.settings.metaAuthorization.status = 'missing_permission';
  assert.equal(connectionHealth(row, now).reason, 'messaging_permission_required');
});
test('scheduled token and data access expiry are evaluated when reading channel state', () => {
  const now = Date.now();
  const row = {
    type: 'whatsapp',
    status: 'active',
    settings: {
      connectionHealth: {
        state: 'connected',
        checkedAt: new Date(now).toISOString(),
        reason: 'provider_verified',
      },
      metaAuthorization: {
        status: 'granted',
        expiresAt: new Date(now + 3600000).toISOString(),
        dataAccessExpiresAt: null as string | null,
      },
    },
  };
  assert.equal(connectionHealth(row, now).reason, 'authorization_expiring');
  assert.equal(connectionHealth(row, now + 3600000).state, 'expired');
  row.settings.metaAuthorization.expiresAt = new Date(now + 30 * 86400000).toISOString();
  row.settings.metaAuthorization.dataAccessExpiresAt = new Date(now - 1000).toISOString();
  assert.equal(connectionHealth(row, now).state, 'expired');
  row.settings.metaAuthorization.dataAccessExpiresAt = null;
  assert.equal(connectionHealth(row, now).state, 'connected');
});
