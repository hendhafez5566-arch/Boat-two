import { validateTemplateParameters } from '../messaging/template-contract';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { isIP } from 'node:net';
import { isBlockedIp } from '../flows/http-safe';
import { MessageContent, validateOutbound } from '../messaging/message-content';
export async function validateCampaignContent(
  c: PoolClient,
  channelId: string,
  content: MessageContent,
) {
  validateOutbound(content);
  const channel = (await c.query('SELECT type FROM channels WHERE id=$1', [channelId])).rows[0];
  if (!channel) throw new NotFoundException('Channel not found');
  if (content.media) {
    const u = new URL(content.media.url!);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.hostname === 'localhost' ||
      u.hostname.endsWith('.local') ||
      (isIP(u.hostname.replaceAll('[', '').replaceAll(']', '')) &&
        isBlockedIp(u.hostname.replaceAll('[', '').replaceAll(']', '')))
    )
      throw new BadRequestException('Use a public HTTPS media URL without credentials');
    if ((content.media.caption ?? content.text ?? '').length > 1024)
      throw new BadRequestException('Media caption supports at most 1024 characters');
    if (
      channel.type === 'whatsapp' &&
      content.media.kind === 'audio' &&
      (content.media.caption || content.text)
    )
      throw new BadRequestException('WhatsApp audio cannot carry a caption');
  }
  const ids = (content.buttons ?? content.list?.sections.flatMap((s) => s.rows) ?? []).map(
    (x) => x.id,
  );
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('Interactive option IDs must be unique');
  if (content.template) {
    if (channel.type !== 'whatsapp')
      throw new BadRequestException('Templates require a WhatsApp channel');
    const row = (
      await c.query(
        "SELECT body,category,components FROM whatsapp_templates WHERE channel_id=$1 AND name=$2 AND language=$3 AND status='APPROVED' AND supported",
        [channelId, content.template.name, content.template.language],
      )
    ).rows[0];
    if (!row)
      throw new BadRequestException('Select an approved supported template for this channel');
    validateTemplateParameters(row, content.template);
  }
}
