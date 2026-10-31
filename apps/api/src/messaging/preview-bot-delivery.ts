/** An explicit, narrowly scoped exception for one preview chatbot test.
 * Does not enable campaigns, manual messages, old jobs or other channels.
 */
export interface PreviewBotMessage {
  channel_id: string;
  conversation_id: string;
  channel_type: string;
  channel_status: string;
  sender_type: string;
  flow_id: string | null;
  created_at: Date | string;
  last_inbound_at: Date | string | null;
  content?: { template?: unknown };
}
export function previewBotDeliveryAllowed(
  row: PreviewBotMessage | null | undefined,
  marketing: boolean,
  settings: Record<string, string | undefined> = process.env,
  now = Date.now(),
): boolean {
  if (!row || marketing || settings.BOAT_PREVIEW_ONLY !== 'true'
    || settings.WHATSAPP_PREVIEW_BOT_ENABLED !== 'true'
    || !settings.WHATSAPP_PREVIEW_BOT_CHANNEL_ID
    || !settings.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID
    || !settings.WHATSAPP_PREVIEW_BOT_AFTER) return false;
  const cutoff = Date.parse(settings.WHATSAPP_PREVIEW_BOT_AFTER);
  const created = new Date(row.created_at).getTime();
  const lastInbound = row.last_inbound_at ? new Date(row.last_inbound_at).getTime() : NaN;
  return row.channel_type === 'whatsapp'
    && row.channel_status === 'active'
    && row.channel_id === settings.WHATSAPP_PREVIEW_BOT_CHANNEL_ID
    && row.conversation_id === settings.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID
    && row.sender_type === 'bot'
    && !!row.flow_id
    && !row.content?.template
    && Number.isFinite(cutoff)
    && created >= cutoff
    && created <= now + 60_000
    && now - created >= 0
    && now - created <= 15 * 60_000
    && Number.isFinite(lastInbound)
    && lastInbound >= cutoff
    && lastInbound <= now + 60_000
    && now - lastInbound >= 0
    && now - lastInbound <= 15 * 60_000;
}

/** Preview QA may restart from ANY inbound content only in the designated
 * test conversation, while respecting an existing waiting flow session.
 */
export function isScopedPreviewConversation(
  channelId: string,
  conversationId: string,
  channelType: string,
  settings: Record<string, string | undefined> = process.env,
): boolean {
  return settings.BOAT_PREVIEW_ONLY === 'true'
    && settings.WHATSAPP_PREVIEW_BOT_ENABLED === 'true'
    && !!settings.WHATSAPP_PREVIEW_BOT_AFTER
    && settings.WHATSAPP_PREVIEW_BOT_CHANNEL_ID === channelId
    && !!settings.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID
    && settings.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID === conversationId
    && channelType === 'whatsapp';
}

/** Only a single matching, published first-message flow can be restarted. */
export function selectPreviewWelcomeFlow<T extends {
  triggers: { type: string }[];
  channel_ids: string[];
}>(flows: T[], channelId: string): T | null {
  const eligible = flows.filter((flow) =>
    Array.isArray(flow.triggers) &&
    flow.triggers.some((trigger) => trigger.type === 'first_message') &&
    Array.isArray(flow.channel_ids) &&
    (!flow.channel_ids.length || flow.channel_ids.includes(channelId))
  );
  return eligible.length === 1 ? eligible[0] : null;
}


/**
 * An explicit preview chat may restart its MOST RECENTLY used published bot.
 * The previously executed flow is unambiguous even if multiple welcome bots
 * exist on the same channel. Without history, fall back to the single-welcome
 * rule. Never use this choice for ordinary customer conversations.
 */
export function selectPreviewRestartFlow<T extends {
  flow_id: string;
  triggers: { type: string }[];
  channel_ids: string[];
}>(
  flows: T[],
  channelId: string,
  previousFlowId?: string | null,
): T | null {
  if (previousFlowId) {
    const previous = flows.find((flow) =>
      flow.flow_id === previousFlowId &&
      Array.isArray(flow.channel_ids) &&
      (!flow.channel_ids.length || flow.channel_ids.includes(channelId)),
    );
    if (previous) return previous;
  }
  return selectPreviewWelcomeFlow(flows, channelId);
}
