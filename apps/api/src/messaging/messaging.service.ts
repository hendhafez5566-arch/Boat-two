import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { MetaAdapter } from './adapters/meta.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
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
    private readonly channels: ChannelsService,
    private readonly events: EventEmitter2,
    whatsapp: WhatsAppAdapter,
    meta: MetaAdapter,
  ) {
    this.adapters = { whatsapp, facebook: meta, instagram: meta };
  }

  /** رسالة واردة من أي قناة: ينشئ جهة الاتصال والمحادثة ويحفظ الرسالة ثم يطلق حدث message.received */
  async receive(channel: ChannelRow, msg: InboundMessage) {
    const type = messageTypeOf(msg.content);

    const result = await this.db.withTenant(channel.tenant_id, async (c) => {
      // 1) جهة الاتصال
      let contactId: string | undefined = (
        await c.query('SELECT contact_id FROM contact_channels WHERE channel_id = $1 AND external_id = $2', [
          channel.id,
          msg.contactExternalId,
        ])
      ).rows[0]?.contact_id;

      if (!contactId) {
        const created = await c.query(
          'INSERT INTO contacts (tenant_id, name, phone) VALUES ($1, $2, $3) RETURNING id',
          [channel.tenant_id, msg.contactName ?? null, channel.type === 'whatsapp' ? msg.contactExternalId : null],
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
            await c.query('SELECT contact_id FROM contact_channels WHERE channel_id = $1 AND external_id = $2', [
              channel.id,
              msg.contactExternalId,
            ])
          ).rows[0].contact_id;
        }
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
        `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, type, content, external_id, status)
         VALUES ($1, $2, $3, 'in', 'contact', $4, $5, $6, 'received')
         ON CONFLICT (channel_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
         RETURNING id, seq`,
        [channel.tenant_id, conv.id, channel.id, type, JSON.stringify(msg.content), msg.externalMessageId ?? null],
      );
      if (!inserted.rows[0]) return { duplicate: true as const };

      await c.query(
        `UPDATE conversations SET last_message_at = now(), last_inbound_at = now(), unread_count = unread_count + 1
         WHERE id = $1`,
        [conv.id],
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

    if (result.duplicate) return { duplicate: true as const };

    const event: MessageReceivedEvent = {
      tenantId: channel.tenant_id,
      channelId: channel.id,
      channelType: channel.type,
      conversationId: result.conversationId,
      contactId: result.contactId,
      messageId: result.messageId,
      handledBy: result.handledBy,
      content: msg.content,
    };
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
        createdAt: new Date().toISOString(),
      },
    });
    // المعالجة اللاحقة (محرك الـ Flows والـ AI) تشترك في هذا الحدث
    this.events.emit('message.received', event);
    return { duplicate: false as const, ...result };
  }

  /** رسالة صادرة (من بوت أو موظف أو النظام) */
  async sendOutbound(p: {
    tenantId: string;
    conversationId: string;
    content: MessageContent;
    senderType: 'bot' | 'agent' | 'system';
    senderUserId?: string;
  }) {
    validateOutbound(p.content);

    const ctx = await this.db.withTenant(p.tenantId, async (c) => {
      const row = (
        await c.query(
          `SELECT cv.id, cv.last_inbound_at, ch.id AS channel_id, ch.type, ch.status, ch.credentials_enc,
                  cc.external_id AS recipient
           FROM conversations cv
           JOIN channels ch ON ch.id = cv.channel_id
           JOIN contact_channels cc ON cc.contact_id = cv.contact_id AND cc.channel_id = cv.channel_id
           WHERE cv.id = $1`,
          [p.conversationId],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Conversation not found');
      if (row.status !== 'active') throw new BadRequestException('Channel is disabled');

      if (
        row.type === 'whatsapp' &&
        (!row.last_inbound_at || Date.now() - new Date(row.last_inbound_at).getTime() > WHATSAPP_WINDOW_MS)
      ) {
        throw new BadRequestException({
          code: 'WINDOW_EXPIRED',
          message: 'WhatsApp 24-hour window expired; a template message is required',
        });
      }

      const msg = (
        await c.query(
          `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, sender_user_id, type, content, status)
           VALUES ($1, $2, $3, 'out', $4, $5, $6, $7, $8) RETURNING id, seq, created_at`,
          [
            p.tenantId,
            p.conversationId,
            row.channel_id,
            p.senderType,
            p.senderUserId ?? null,
            messageTypeOf(p.content),
            JSON.stringify(p.content),
            row.type === 'web' ? 'sent' : 'queued',
          ],
        )
      ).rows[0];
      await c.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [p.conversationId]);
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
    const emitStatus = (status: string, error?: string) =>
      this.events.emit('message.status', { tenantId: p.tenantId, conversationId: p.conversationId, messageId: base.id, status, error });

    if (ctx.row.type === 'web') {
      emitCreated('sent');
      return { ...base, status: 'sent' as const };
    }
    emitCreated('queued');

    // الإرسال الفعلي خارج الـ transaction لأنه نداء شبكة
    try {
      const adapter = this.adapters[ctx.row.type as string];
      const creds = this.channels.credentials({ credentials_enc: ctx.row.credentials_enc } as ChannelRow);
      const { externalId } = await adapter.send(creds, ctx.row.recipient, p.content);
      await this.db.withTenant(p.tenantId, (c) =>
        c.query("UPDATE messages SET status = 'sent', external_id = $2 WHERE id = $1", [base.id, externalId]),
      );
      emitStatus('sent');
      return { ...base, status: 'sent' as const, externalId };
    } catch (e) {
      const error = (e as Error).message;
      this.log.warn(`Outbound failed (${ctx.row.type}): ${error}`);
      await this.db.withTenant(p.tenantId, (c) =>
        c.query("UPDATE messages SET status = 'failed', error = $2 WHERE id = $1", [base.id, error.slice(0, 500)]),
      );
      emitStatus('failed', error);
      return { ...base, status: 'failed' as const, error };
    }
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
      this.events.emit('message.status', { tenantId: channel.tenant_id, conversationId: row.conversation_id, messageId: row.id, status, error });
    }
  }
}
