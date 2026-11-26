import {assertOwnedUpload} from '../inbox/files/owned-upload';
import { activeBotSettings } from './bot-runtime-settings';
import { validateTemplateParameters } from './template-contract';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { PlansService } from '../plans/plans.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { MetaAdapter } from './adapters/meta.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { ChannelAdapter } from './adapters/adapter';
import { ChannelRow, ChannelsService } from './channels.service';
import { MessageContent, messageTypeOf, validateOutbound } from './message-content';

export interface InboundMessage {
  contactExternalId: string;
  contactName?: string;
  externalMessageId?: string;
  content: MessageContent;
}

export interface MessageReceivedEvent {
  eventName?: string;
  tenantId: string;
  channelId: string;
  channelType: string;
  conversationId: string;
  contactId: string;
  messageId: string;
  handledBy: 'bot' | 'human';
  content: MessageContent;
}

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MessagingService {
  private readonly log = new Logger(MessagingService.name);
  private readonly adapters: Record<string, ChannelAdapter>;

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: EventsService,
    private readonly plans: PlansService,
    private readonly channels: ChannelsService,
    private readonly events: EventEmitter2,
    whatsapp: WhatsAppAdapter,
    meta: MetaAdapter,
    telegram: TelegramAdapter,
  ) {
    this.adapters = { whatsapp, facebook: meta, instagram: meta, telegram };
  }

  /** رسالة واردة من أي قناة: ينشئ جهة الاتصال والمحادثة ويحفظ الرسالة ثم يطلق حدث message.received */
  async receive(channel: ChannelRow, msg: InboundMessage, restore?: { id: string; createdAt: Date }) {
    const type = messageTypeOf(msg.content);

    const result = await this.db.withTenant(channel.tenant_id, async (c) => {
      await c.query('SELECT id FROM channels WHERE id=$1 FOR UPDATE', [channel.id]);
      if (restore && !(await c.query('SELECT 1 FROM held_inbound_messages WHERE id=$1', [restore.id])).rowCount)
        return { duplicate: true as const };
      if (msg.externalMessageId) {
        const existing = await c.query(
          'SELECT 1 FROM messages WHERE channel_id=$1 AND external_id=$2',
          [channel.id, msg.externalMessageId],
        );
        if (existing.rowCount) {
          if (restore) await c.query('DELETE FROM held_inbound_messages WHERE id=$1', [restore.id]);
          return { duplicate: true as const };
        }
      }
      // 1) جهة الاتصال
      let contactId: string | undefined = (
        await c.query(
          'SELECT contact_id FROM contact_channels WHERE channel_id = $1 AND external_id = $2',
          [channel.id, msg.contactExternalId],
        )
      ).rows[0]?.contact_id;

      if (!contactId) {
        await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
        // Reuse an unambiguous existing CRM identity on the first WhatsApp message.
        // Never merge two deliberately duplicated contacts or modify their consent.
        if (channel.type === 'whatsapp') {
          const matches = (
            await c.query(
              'SELECT id FROM contacts WHERE merged_into_id IS NULL AND normalize_contact_phone(phone)=normalize_contact_phone($1) ORDER BY created_at,id LIMIT 2',
              [msg.contactExternalId],
            )
          ).rows;
          if (matches.length === 1) {
            contactId = matches[0].id;
            await c.query(
              'INSERT INTO contact_channels(tenant_id,contact_id,channel_id,external_id) VALUES($1,$2,$3,$4) ON CONFLICT(channel_id,external_id) DO NOTHING',
              [channel.tenant_id, contactId, channel.id, msg.contactExternalId],
            );
          }
        }
        if (!contactId) {
          const count = (await c.query('SELECT count(*)::int AS n FROM contacts')).rows[0].n;
          try {
            await this.plans.assertWithinLimit(c, 'contacts', count);
          } catch (error) {
            if (!(error instanceof ForbiddenException)) throw error;
            const reason = error.getResponse();
            if (typeof reason !== 'object' || !('code' in reason) || reason.code !== 'PLAN_LIMIT')
              throw error;
            if (restore) return { duplicate: false as const, held: true as const };
            const held = await c.query(
              `INSERT INTO held_inbound_messages
                (tenant_id, channel_id, contact_external_id, contact_name, external_message_id, content)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (channel_id, external_message_id) DO NOTHING RETURNING id`,
              [channel.tenant_id, channel.id, msg.contactExternalId, msg.contactName ?? null,
                msg.externalMessageId ?? null, JSON.stringify(msg.content)],
            );
            return { duplicate: !held.rowCount, held: true as const };
          }
          const created = await c.query(
            'INSERT INTO contacts (tenant_id, name, phone) VALUES ($1, $2, $3) RETURNING id',
            [
              channel.tenant_id,
              msg.contactName ?? null,
              channel.type === 'whatsapp' ? msg.contactExternalId : null,
            ],
          );
          const link = await c.query(
            `INSERT INTO contact_channels (tenant_id, contact_id, channel_id, external_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT (channel_id, external_id) DO NOTHING RETURNING contact_id`,
            [channel.tenant_id, created.rows[0].id, channel.id, msg.contactExternalId],
          );
          if (link.rows[0]) {
            contactId = link.rows[0].contact_id;
          } else {
            await c.query('DELETE FROM contacts WHERE id = $1', [created.rows[0].id]);
            contactId = (
              await c.query(
                'SELECT contact_id FROM contact_channels WHERE channel_id = $1 AND external_id = $2',
                [channel.id, msg.contactExternalId],
              )
            ).rows[0].contact_id;
          }
        }
      }

      if (restore) {
        await c.query('DELETE FROM held_inbound_messages WHERE id=$1', [restore.id]);
      } else if (msg.externalMessageId) {
        await c.query('DELETE FROM held_inbound_messages WHERE channel_id=$1 AND external_message_id=$2',
          [channel.id, msg.externalMessageId]);
      }

      // Inbound opt-out is persisted before any bot/campaign reaction. Opt-in always requires explicit evidence elsewhere.
      const incomingText = msg.content.text?.normalize('NFKC').trim().toLowerCase();
      if (
        incomingText &&
        [
          'stop',
          'unsubscribe',
          'cancel marketing',
          'إلغاء الاشتراك',
          'الغاء الاشتراك',
          'توقف',
          'إيقاف التسويق',
        ].includes(incomingText)
      ) {
        await c.query(
          "INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,'opted_out','Inbound channel opt-out keyword') ON CONFLICT(tenant_id,contact_id,channel_id) DO UPDATE SET status='opted_out',evidence=EXCLUDED.evidence,updated_at=now() WHERE $4::timestamptz IS NULL OR contact_consents.updated_at <= $4",
          [channel.tenant_id, contactId, channel.id, restore?.createdAt ?? null],
        );
      }

      // 2) المحادثة المفتوحة (أو فتح واحدة جديدة)
      let conv = (
        await c.query(
          `INSERT INTO conversations (tenant_id, channel_id, contact_id) VALUES ($1, $2, $3)
           ON CONFLICT (channel_id, contact_id) WHERE status <> 'closed' DO NOTHING
           RETURNING id, handled_by`,
          [channel.tenant_id, channel.id, contactId],
        )
      ).rows[0];
      if (!conv) {
        conv = (
          await c.query(
            "SELECT id, handled_by FROM conversations WHERE channel_id = $1 AND contact_id = $2 AND status <> 'closed'",
            [channel.id, contactId],
          )
        ).rows[0];
      }

      // 3) الرسالة (مع منع التكرار)
      const inserted = await c.query(
        `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, type, content, external_id, status, created_at)
         VALUES ($1, $2, $3, 'in', 'contact', $4, $5, $6, 'received', COALESCE($7::timestamptz,now()))
         ON CONFLICT (channel_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
         RETURNING id, seq`,
        [
          channel.tenant_id,
          conv.id,
          channel.id,
          type,
          JSON.stringify(msg.content),
          msg.externalMessageId ?? null,
          restore?.createdAt ?? null,
        ],
      );
      if (!inserted.rows[0]) return { duplicate: true as const };

      await c.query(
        `UPDATE conversations SET last_message_at = GREATEST(last_message_at, COALESCE($2::timestamptz,now())),
          last_inbound_at = GREATEST(last_inbound_at, COALESCE($2::timestamptz,now())), unread_count = unread_count + 1
         WHERE id = $1`,
        [conv.id, restore?.createdAt ?? null],
      );
      // Restoring a backlog creates inbox records only. It must not trigger automated replies.
      if (!restore) await this.outbox.publish(
        channel.tenant_id,
        'message.received',
        conv.id,
        {
          channelId: channel.id,
          channelType: channel.type,
          conversationId: conv.id,
          contactId,
          messageId: inserted.rows[0].id,
          handledBy: conv.handled_by,
          content: msg.content,
        },
        `inbound:${inserted.rows[0].id}`,
      );
      return {
        duplicate: false as const,
        contactId: contactId as string,
        conversationId: conv.id as string,
        handledBy: conv.handled_by as 'bot' | 'human',
        messageId: inserted.rows[0].id as string,
        seq: Number(inserted.rows[0].seq),
      };
    });

    if ('held' in result && result.held) return result;
    if (result.duplicate) return { duplicate: true as const };

    this.events.emit('message.created', {
      tenantId: channel.tenant_id,
      conversationId: result.conversationId,
      message: {
        id: result.messageId,
        seq: result.seq,
        direction: 'in',
        senderType: 'contact',
        senderUserId: null,
        type,
        content: msg.content,
        status: 'received',
        isInternal: false,
        createdAt: (restore?.createdAt ?? new Date()).toISOString(),
      },
    });
    // The durable event is visible after the inbound transaction commits.
    if (!restore) this.events.emit('inbound.committed');
    return result;
  }

  async restoreHeldInbound(tenantId: string) {
    const rows = await this.db.withTenant(tenantId, async (c) =>
      (await c.query<{
        held_id: string; held_created_at: Date; contact_external_id: string;
        contact_name: string | null; external_message_id: string | null; content: MessageContent;
      } & ChannelRow>(
        `SELECT ch.id, ch.tenant_id, ch.type, h.id AS held_id, h.created_at AS held_created_at,
          h.contact_external_id, h.contact_name, h.external_message_id, h.content
          FROM held_inbound_messages h JOIN channels ch ON ch.id=h.channel_id AND ch.tenant_id=h.tenant_id
          WHERE ch.status = 'active'
          ORDER BY h.created_at,h.id LIMIT 50`,
      )).rows,
    );
    let restored = 0;
    for (const row of rows) {
      const result = await this.receive(row, {
        contactExternalId: row.contact_external_id,
        contactName: row.contact_name ?? undefined,
        externalMessageId: row.external_message_id ?? `held:${row.held_id}`,
        content: row.content,
      }, { id: row.held_id, createdAt: row.held_created_at });
      if (!('held' in result && result.held) && !result.duplicate) restored++;
    }
    return { restored };
  }

  /** رسالة صادرة (من بوت أو موظف أو النظام) */
  async sendOutbound(p: {
    tenantId: string;
    conversationId: string;
    content: MessageContent;
    senderType: 'bot' | 'agent' | 'system';
    senderUserId?: string;
    flow?: { flowId: string; nodeId?: string };
  }) {
    if (p.senderType === 'agent' && p.senderUserId && !p.content.template) {
      const signature = await this.db.withTenant(
        p.tenantId,
        async (c) =>
          (
            await c.query(
              `SELECT s.signature_enabled,s.signature_template,u.full_name,ch.settings AS channel_settings
               FROM conversations cv JOIN channels ch ON ch.id=cv.channel_id
               JOIN memberships m ON m.tenant_id=cv.tenant_id
               JOIN users u ON u.id=m.user_id
               LEFT JOIN inbox_settings s ON s.tenant_id=cv.tenant_id
               WHERE m.user_id=$1 AND cv.id=$2`,
              [p.senderUserId, p.conversationId],
            )
          ).rows[0],
      );
      const signatureEnabled =
        activeBotSettings(signature?.channel_settings).sharedInbox?.signatureEnabled ??
        signature?.signature_enabled;
      if (signatureEnabled) {
        const suffix = (signature.signature_template ?? '— {{agent.name}}').replaceAll(
          '{{agent.name}}',
          signature.full_name || 'Agent',
        );
        p.content = {
          ...p.content,
          ...(p.content.text
            ? { text: p.content.text + '\n' + suffix }
            : p.content.media
              ? {
                  media: {
                    ...p.content.media,
                    caption: (p.content.media.caption || '') + '\n' + suffix,
                  },
                }
              : {}),
        };
      }
    }
    validateOutbound(p.content);
    const effectKey = this.db.effectKey();

    const ctx = await this.db.withTenant(p.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if (effectKey) {
        const prior = (
          await c.query('SELECT id,seq,created_at FROM messages WHERE effect_key=$1', [effectKey])
        ).rows[0];
        if (prior) return { row: { type: 'web' }, msg: prior };
      }
      const used = (
        await c.query(
          "SELECT count(*)::int AS n FROM messages WHERE direction='out' AND NOT is_internal AND created_at>=date_trunc('month',now())",
        )
      ).rows[0].n;
      await this.plans.assertWithinLimit(c, 'messages_per_month', used);
      const row = (
        await c.query(
          `SELECT cv.id, cv.last_inbound_at, ch.id AS channel_id, ch.type, ch.status, ch.credentials_enc,
                  cc.external_id AS recipient,cc.blocked_at,
                  cv.crm_initiated AND cv.last_inbound_at IS NULL AND
                    (ct.archived_at IS NOT NULL OR ct.merged_into_id IS NOT NULL OR NOT EXISTS(
                      SELECT 1 FROM contact_consents s WHERE s.contact_id=cv.contact_id
                        AND s.channel_id=cv.channel_id AND s.status='opted_in'
                    )) AS crm_consent_denied
           FROM conversations cv
           JOIN channels ch ON ch.id = cv.channel_id
           JOIN contacts ct ON ct.id = cv.contact_id
           JOIN contact_channels cc ON cc.contact_id = cv.contact_id AND cc.channel_id = cv.channel_id
           WHERE cv.id = $1`,
          [p.conversationId],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Conversation not found');
      if (row.crm_consent_denied) throw new BadRequestException('Customer opt-in is required');
      if (row.blocked_at) throw new BadRequestException('Recipient is blocked on this account');
      if (row.status !== 'active') throw new BadRequestException('Channel is disabled');

      if (
        row.type === 'whatsapp' &&
        !p.content.template &&
        (!row.last_inbound_at ||
          Date.now() - new Date(row.last_inbound_at).getTime() > WHATSAPP_WINDOW_MS)
      ) {
        throw new BadRequestException({
          code: 'WINDOW_EXPIRED',
          message: 'WhatsApp 24-hour window expired; a template message is required',
        });
      }

      if (p.content.template) {
        if (row.type !== 'whatsapp')
          throw new BadRequestException('Templates require a WhatsApp channel');
        const template = (
          await c.query(
            "SELECT body,category,components FROM whatsapp_templates WHERE channel_id=$1 AND name=$2 AND language=$3 AND status='APPROVED' AND supported",
            [row.channel_id, p.content.template.name, p.content.template.language],
          )
        ).rows[0];
        if (!template) throw new BadRequestException('Template is not approved for this channel');
        validateTemplateParameters(template, p.content.template);
      }
      await assertOwnedUpload(c,p.content.media?.url);
      const msg = (
        await c.query(
          `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, sender_user_id, type, content, status,effect_key, flow_id, flow_node_id)
           VALUES ($1, $2, $3, 'out', $4, $5, $6, $7, $8,$9,$10,$11) RETURNING id, seq, created_at`,
          [
            p.tenantId,
            p.conversationId,
            row.channel_id,
            p.senderType,
            p.senderUserId ?? null,
            messageTypeOf(p.content),
            JSON.stringify(p.content),
            row.type === 'web' ? 'sent' : 'queued',
            effectKey,
            p.flow?.flowId ?? null,
            p.flow?.nodeId ?? null,
          ],
        )
      ).rows[0];
      await c.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [
        p.conversationId,
      ]);
      if (row.type !== 'web')
        await c.query(
          'INSERT INTO outbound_jobs(tenant_id,message_id) VALUES($1,$2) ON CONFLICT(message_id) DO NOTHING',
          [p.tenantId, msg.id],
        );
      return { row, msg };
    });

    const base = {
      id: String(ctx.msg.id),
      seq: Number(ctx.msg.seq),
      createdAt: ctx.msg.created_at as Date,
    };
    const emitCreated = (status: string) =>
      this.events.emit('message.created', {
        tenantId: p.tenantId,
        conversationId: p.conversationId,
        message: {
          id: base.id,
          seq: base.seq,
          direction: 'out',
          senderType: p.senderType,
          senderUserId: p.senderUserId ?? null,
          type: messageTypeOf(p.content),
          content: p.content,
          status,
          isInternal: false,
          createdAt: base.createdAt.toISOString(),
        },
      });
    if (ctx.row.type === 'web') {
      emitCreated('sent');
      return { ...base, status: 'sent' as const };
    }
    emitCreated('queued');

    return { ...base, status: 'queued' as const };
  }

  /** تحديث حالة التسليم/القراءة القادمة من المزوّد */
  async updateStatus(
    channel: ChannelRow,
    externalMessageId: string,
    status: 'delivered' | 'read' | 'failed',
    error?: string,
  ) {
    const upd = await this.db.withTenant(channel.tenant_id, (c) =>
      c.query(
        `UPDATE messages SET status = $1::text, error = COALESCE($2, error)
         WHERE channel_id = $3 AND external_id = $4 AND direction = 'out'
           AND (
             ($1::text = 'failed' AND status IN ('queued','sent'))
             OR array_position(ARRAY['queued','sent','delivered','read'], status) <
                array_position(ARRAY['queued','sent','delivered','read'], $1::text)
           )
         RETURNING id, conversation_id`,
        [status, error ?? null, channel.id, externalMessageId],
      ),
    );
    for (const row of upd.rows) {
      this.events.emit('message.status', {
        tenantId: channel.tenant_id,
        conversationId: row.conversation_id,
        messageId: row.id,
        status,
        error,
      });
    }
  }
}
