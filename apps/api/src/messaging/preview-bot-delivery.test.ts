import assert from 'node:assert/strict';
import test from 'node:test';
import { previewBotDeliveryAllowed, type PreviewBotMessage } from './preview-bot-delivery';

const now = Date.parse('2026-10-31T12:00:00.000Z');
const settings = {
  BOAT_PREVIEW_ONLY: 'true',
  WHATSAPP_PREVIEW_BOT_ENABLED: 'true',
  WHATSAPP_PREVIEW_BOT_CHANNEL_ID: 'only-preview-channel',
  WHATSAPP_PREVIEW_BOT_AFTER: '2026-10-31T11:30:00Z',
};
const testMessage: PreviewBotMessage = {
  channel_id: 'only-preview-channel',
  channel_type: 'whatsapp',
  channel_status: 'active',
  sender_type: 'bot',
  flow_id: 'flow-id',
  created_at: '2026-10-31T11:59:00Z',
  last_inbound_at: '2026-10-31T11:58:00Z',
  last_inbound_text: 'BOAT-TEST-003',
  content: { },
};
test('only explicit opt-in preview bot flow replies can be sent', () => {
  assert.equal(previewBotDeliveryAllowed(testMessage, false, settings, now), true);
  assert.equal(previewBotDeliveryAllowed(testMessage, true, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, channel_id: 'other' }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, sender_type: 'agent' }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, flow_id: null }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, content: { template: {} } }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, last_inbound_text: 'hello' }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, created_at: '2026-10-31T11:00:00Z' }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({ ...testMessage, last_inbound_at: '2026-10-31T11:00:00Z' }, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed(testMessage, false, { ...settings, BOAT_PREVIEW_ONLY: 'false' }, now), false);
  assert.equal(previewBotDeliveryAllowed(testMessage, false, { ...settings, WHATSAPP_PREVIEW_BOT_ENABLED: 'false' }, now), false);
});
