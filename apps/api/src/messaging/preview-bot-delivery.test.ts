import assert from 'node:assert/strict';
import test from 'node:test';
import {
  previewBotDeliveryAllowed,
  previewAgentDeliveryAllowed,
  previewWhatsAppConversationsAllowed,
  isScopedPreviewConversation,
  selectPreviewWelcomeFlow,
  selectPreviewRestartFlow,
  type PreviewBotMessage,
} from './preview-bot-delivery';

const now = Date.parse('2026-10-31T12:00:00.000Z');
const settings = {
  BOAT_PREVIEW_ONLY: 'true',
  WHATSAPP_PREVIEW_BOT_ENABLED: 'true',
  WHATSAPP_PREVIEW_BOT_CHANNEL_ID: 'only-preview-channel',
  WHATSAPP_PREVIEW_BOT_CONVERSATION_ID: 'only-preview-conversation',
  WHATSAPP_PREVIEW_BOT_AFTER: '2026-10-31T11:30:00Z',
};
const testMessage: PreviewBotMessage = {
  channel_id: 'only-preview-channel',
  conversation_id: 'only-preview-conversation',
  channel_type: 'whatsapp',
  channel_status: 'active',
  sender_type: 'bot',
  flow_id: 'flow-id',
  created_at: '2026-10-31T11:59:00Z',
  last_inbound_at: '2026-10-31T11:58:00Z',
  content: {},
};
test('single-conversation preview bot delivery accepts any inbound content', () => {
  assert.equal(previewBotDeliveryAllowed(testMessage, false, settings, now), true);
  assert.equal(previewBotDeliveryAllowed({...testMessage, last_inbound_at: '2026-10-31T11:59:30Z'}, false, settings, now), true);
  assert.equal(previewBotDeliveryAllowed(testMessage, true, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, channel_id: 'another'}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, conversation_id: 'another'}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, sender_type: 'agent'}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, flow_id: null}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, content: {template:{}}}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, created_at: '2026-10-31T11:29:00Z'}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, last_inbound_at: '2026-10-31T11:00:00Z'}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed({...testMessage, created_at: '2026-10-31T11:40:00Z'}, false, settings, now), false);
  assert.equal(previewBotDeliveryAllowed(testMessage, false, {...settings, BOAT_PREVIEW_ONLY:'false'}, now), false);
  assert.equal(previewBotDeliveryAllowed(testMessage, false, {...settings,WHATSAPP_PREVIEW_BOT_ENABLED:'false'}, now), false);
  assert.equal(previewBotDeliveryAllowed(testMessage, false, {...settings,WHATSAPP_PREVIEW_BOT_CONVERSATION_ID:''}, now), false);
});
test('preview flow start only belongs to one explicit conversation and WhatsApp channel', () => {
  assert.equal(isScopedPreviewConversation('only-preview-channel','only-preview-conversation','whatsapp',settings),true);
  assert.equal(isScopedPreviewConversation('only-preview-channel','another','whatsapp',settings),false);
  assert.equal(isScopedPreviewConversation('another','only-preview-conversation','whatsapp',settings),false);
  assert.equal(isScopedPreviewConversation('only-preview-channel','only-preview-conversation','telegram',settings),false);
  assert.equal(isScopedPreviewConversation('only-preview-channel','only-preview-conversation','whatsapp',{...settings,BOAT_PREVIEW_ONLY:'false'}),false);
});
test('preview may restart only one compatible published welcome flow', () => {
  const welcome={id:'welcome',triggers:[{type:'first_message'}],channel_ids:['only-preview-channel']};
  const other={id:'other',triggers:[{type:'any_message'}],channel_ids:['only-preview-channel']};
  const wrong={id:'wrong',triggers:[{type:'first_message'}],channel_ids:['another-channel']};
  assert.equal(selectPreviewWelcomeFlow([welcome,other,wrong],'only-preview-channel'),welcome);
  assert.equal(selectPreviewWelcomeFlow([welcome,{...welcome,id:'duplicate'}],'only-preview-channel'),null);
  assert.equal(selectPreviewWelcomeFlow([other,wrong],'only-preview-channel'),null);
});

test('preview restart uses the exact last published bot, even with two welcome bots', () => {
  const first={flow_id:'first',triggers:[{type:'first_message'}],channel_ids:['only-preview-channel']};
  const second={flow_id:'second',triggers:[{type:'first_message'}],channel_ids:['only-preview-channel']};
  assert.equal(selectPreviewRestartFlow([first,second],'only-preview-channel','second'),second);
  assert.equal(selectPreviewRestartFlow([first,second],'only-preview-channel','missing'),null);
  assert.equal(selectPreviewRestartFlow([first],'only-preview-channel','missing'),first);
});
test('preview restart refuses flows on other channels or unpublished history', () => {
  const other={flow_id:'other',triggers:[{type:'first_message'}],channel_ids:['another-channel']};
  const general={flow_id:'general',triggers:[{type:'any_message'}],channel_ids:['only-preview-channel']};
  assert.equal(selectPreviewRestartFlow([other,general],'only-preview-channel','other'),null);
  assert.equal(selectPreviewRestartFlow([other,general],'only-preview-channel','general'),general);
  assert.equal(selectPreviewRestartFlow([], 'only-preview-channel','general'),null);
});

test('preview agent send is limited to fresh replies in the one authorized test conversation', () => {
  const agent = { ...testMessage, sender_type: 'agent', flow_id: null };
  assert.equal(previewAgentDeliveryAllowed(agent, false, settings, now), true);
  assert.equal(previewAgentDeliveryAllowed(testMessage, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed(agent, true, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, conversation_id: 'customer-conversation' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, channel_id: 'another-channel' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, channel_status: 'disabled' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, channel_type: 'facebook' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, content: { template: {} } }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, flow_id: 'bot-flow' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, created_at: '2026-10-31T11:49:00Z' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, created_at: '2026-10-31T11:29:00Z' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed({ ...agent, last_inbound_at: '2026-10-31T11:40:00Z' }, false, settings, now), false);
  assert.equal(previewAgentDeliveryAllowed(agent, false, { ...settings, BOAT_PREVIEW_ONLY: 'false' }, now), false);
  assert.equal(previewAgentDeliveryAllowed(agent, false, { ...settings, WHATSAPP_PREVIEW_BOT_ENABLED: 'false' }, now), false);
  assert.equal(previewAgentDeliveryAllowed(agent, false, { ...settings, WHATSAPP_PREVIEW_BOT_CONVERSATION_ID: '' }, now), false);
});

test('opted-in preview WhatsApp replies work across conversations but never replay old sends or campaigns', () => {
  const enabled = {
    ...settings,
    WHATSAPP_PREVIEW_ALL_CONVERSATIONS_ENABLED: 'true',
    WHATSAPP_PREVIEW_ALL_AFTER: '2026-10-31T11:55:00Z',
  };
  const bot = { ...testMessage, channel_id: 'another-channel', conversation_id: 'another-conversation' };
  const agent = { ...bot, sender_type: 'agent', flow_id: null };
  assert.equal(previewWhatsAppConversationsAllowed(bot, false, enabled, now), true);
  assert.equal(previewWhatsAppConversationsAllowed(agent, false, enabled, now), true);
  assert.equal(previewWhatsAppConversationsAllowed(bot, true, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed(bot, false, { ...enabled, BOAT_PREVIEW_ONLY: 'false' }, now), false);
  assert.equal(previewWhatsAppConversationsAllowed(bot, false, { ...enabled, WHATSAPP_PREVIEW_ALL_CONVERSATIONS_ENABLED: 'false' }, now), false);
  assert.equal(previewWhatsAppConversationsAllowed(bot, false, { ...enabled, WHATSAPP_PREVIEW_ALL_AFTER: '' }, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, channel_type: 'telegram' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, channel_status: 'disabled' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, sender_type: 'agent', flow_id: 'flow-id' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, flow_id: null }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, content: { template: {} } }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, created_at: '2026-10-31T11:54:59Z' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, created_at: '2026-10-31T11:49:00Z' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, last_inbound_at: '2026-10-31T11:40:00Z' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, created_at: '2026-10-31T12:01:00Z' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...bot, last_inbound_at: '2026-10-31T12:01:00Z' }, false, enabled, now), false);
  assert.equal(previewWhatsAppConversationsAllowed({ ...agent, last_inbound_at: '2026-10-30T12:01:00Z' }, false, enabled, now), true);
  assert.equal(previewWhatsAppConversationsAllowed({ ...agent, last_inbound_at: '2026-10-30T11:59:00Z' }, false, enabled, now), false);
});
