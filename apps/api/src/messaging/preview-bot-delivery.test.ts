import assert from 'node:assert/strict';
import test from 'node:test';
import { previewBotDeliveryAllowed, isScopedPreviewTestMessage, selectPreviewWelcomeFlow, type PreviewBotMessage } from './preview-bot-delivery';

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

test('QA restart only accepts exact preview keyword for the specific channel', () => {
  assert.equal(isScopedPreviewTestMessage('only-preview-channel', 'whatsapp', 'BOAT-TEST-003', settings), true);
  assert.equal(isScopedPreviewTestMessage('only-preview-channel', 'whatsapp', ' BOAT-TEST-003 ', settings), true);
  assert.equal(isScopedPreviewTestMessage('other-channel', 'whatsapp', 'BOAT-TEST-003', settings), false);
  assert.equal(isScopedPreviewTestMessage('only-preview-channel', 'telegram', 'BOAT-TEST-003', settings), false);
  assert.equal(isScopedPreviewTestMessage('only-preview-channel', 'whatsapp', 'Hello', settings), false);
  assert.equal(isScopedPreviewTestMessage('only-preview-channel', 'whatsapp', 'BOAT-TEST-003', {...settings,WHATSAPP_PREVIEW_BOT_ENABLED:'false'}), false);
});
test('QA restart chooses only one published first-message flow assigned to the target channel', () => {
  const welcome = { id:'welcome', triggers:[{type:'first_message'}],channel_ids:['only-preview-channel'] };
  const other = { id:'other',triggers:[{type:'any_message'}],channel_ids:['only-preview-channel'] };
  const wrong = { id:'wrong',triggers:[{type:'first_message'}],channel_ids:['another-channel'] };
  assert.equal(selectPreviewWelcomeFlow([welcome, other, wrong], 'only-preview-channel'), welcome);
  assert.equal(selectPreviewWelcomeFlow([welcome,{...welcome,id:'duplicate'}], 'only-preview-channel'), null);
  assert.equal(selectPreviewWelcomeFlow([other, wrong], 'only-preview-channel'), null);
});
