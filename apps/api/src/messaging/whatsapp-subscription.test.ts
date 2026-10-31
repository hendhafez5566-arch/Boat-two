import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWhatsAppSubscription } from './whatsapp-subscription';

const app = '2043491039651908';
const endpoint = 'https://boat-preview-api-preview.up.railway.app/webhooks/whatsapp';

test('WABA subscription is verified only for the exact Meta app id', () => {
  assert.equal(
    inspectWhatsAppSubscription(
      { data: [{ whatsapp_business_api_data: { id: app } }] },
      app, endpoint,
    ),
    'subscribed',
  );
  assert.equal(
    inspectWhatsAppSubscription(
      { data: [{ whatsapp_business_api_data: { id: 'different-app' } }] },
      app, endpoint,
    ),
    'missing',
  );
});

test('WABA callback override must match this installation', () => {
  assert.equal(
    inspectWhatsAppSubscription({
      data: [{ whatsapp_business_api_data: { id: app }, override_callback_uri: 'https://another.example/webhook' }],
    }, app, endpoint),
    'overridden',
  );
  assert.equal(
    inspectWhatsAppSubscription({
      data: [{ whatsapp_business_api_data: { id: app }, override_callback_uri: endpoint }],
    }, app, endpoint),
    'subscribed',
  );
});

test('malformed and potentially paginated responses are never marked connected', () => {
  assert.equal(inspectWhatsAppSubscription(null, app, endpoint), 'incomplete');
  assert.equal(inspectWhatsAppSubscription({ data: {} }, app, endpoint), 'incomplete');
  assert.equal(inspectWhatsAppSubscription({
    data: [], paging: { next: 'https://graph.facebook.com/paged' },
  }, app, endpoint), 'incomplete');
  assert.equal(inspectWhatsAppSubscription({ data: [] }, app, endpoint), 'missing');
});
