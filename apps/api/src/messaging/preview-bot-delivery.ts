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
