/** An explicit, narrowly scoped exception for one preview chatbot test.
 * Does not enable campaigns, manual messages, old jobs or other channels.
 */
export interface PreviewBotMessage {
  channel_id: string;
  channel_type: string;
  channel_status: string;
  sender_type: string;
  flow_id: string | null;
  created_at: Date | string;
  last_inbound_at: Date | string | null;
  last_inbound_text?: string | null;
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
    || !settings.WHATSAPP_PREVIEW_BOT_AFTER) return false;
  const cutoff = Date.parse(settings.WHATSAPP_PREVIEW_BOT_AFTER);
  const created = new Date(row.created_at).getTime();
  const lastInbound = row.last_inbound_at ? new Date(row.last_inbound_at).getTime() : NaN;
  return row.channel_type === 'whatsapp'
    && row.channel_status === 'active'
    && row.channel_id === settings.WHATSAPP_PREVIEW_BOT_CHANNEL_ID
    && row.sender_type === 'bot'
    && !!row.flow_id
    && !row.content?.template
    && typeof row.last_inbound_text === 'string'
    && /^BOAT-TEST-[0-9]{3,8}$/.test(row.last_inbound_text.trim())
    && Number.isFinite(cutoff)
    && created >= cutoff
    && created <= now + 60_000
    && Number.isFinite(lastInbound)
    && lastInbound <= now + 60_000
    && now - lastInbound >= 0
    && now - lastInbound <= 15 * 60_000;
}

/** A preview-only message that may restart the already published welcome bot.
 * This is intentionally not a production trigger or a general flow reset.
 */
export function isScopedPreviewTestMessage(
  channelId: string,
  channelType: string,
  text: string,
  settings: Record<string, string | undefined> = process.env,
): boolean {
  return settings.BOAT_PREVIEW_ONLY === 'true'
    && settings.WHATSAPP_PREVIEW_BOT_ENABLED === 'true'
    && settings.WHATSAPP_PREVIEW_BOT_CHANNEL_ID === channelId
    && !!settings.WHATSAPP_PREVIEW_BOT_AFTER
    && channelType === 'whatsapp'
    && /^BOAT-TEST-[0-9]{3,8}$/.test(text.trim());
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
