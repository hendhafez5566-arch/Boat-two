import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { ChannelsService, createChannelSchema, updateChannelSchema } from './channels.service';
import { classifyOutboundFailure } from './meta-messaging-inspection';

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.channels.list(req.user.tenantId);
  }

  @Roles('owner', 'admin')
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.channels.create(req.user.tenantId, parse(createChannelSchema, body));
  }

  @Roles('owner', 'admin')
  @Patch(':id')
  update(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.channels.update(req.user.tenantId, id, parse(updateChannelSchema, body));
  }

  /** Read-only diagnostic for bot replies; only counts and statuses, no customer data. */
  @Roles('owner', 'admin')
  @Get(':id/bot-readiness')
  botReadiness(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const channel = (await c.query(
        'SELECT id,type,status FROM channels WHERE id=$1', [id],
      )).rows[0];
      if (!channel) throw new NotFoundException('Channel not found');
      const flows = (await c.query(
        `SELECT f.id,f.name,v.triggers,f.draft_graph,v.graph AS published_graph FROM flows f
         JOIN flow_versions v ON v.id=f.published_version_id
         WHERE f.status='published' AND NOT f.is_component
         AND (cardinality(v.channel_ids)=0 OR $1=ANY(v.channel_ids))`,
        [id],
      )).rows as {
        id: string; name: string; triggers: { type: string; keywords?: string[] }[];
        draft_graph: { nodes?: { type: string }[] } | null;
        published_graph: { nodes?: { type: string }[] } | null;
      }[];
      const messages = (await c.query(
        `SELECT m.sender_type,m.status,j.status AS job_status
         FROM messages m LEFT JOIN outbound_jobs j ON j.message_id=m.id
         WHERE m.channel_id=$1 AND m.direction='out' AND m.created_at>now()-interval '6 hours'
         ORDER BY m.created_at DESC LIMIT 100`, [id],
      )).rows as { sender_type: string; status: string; job_status: string | null }[];
      const handlers = (await c.query(
        "SELECT handled_by,count(*)::int AS n FROM conversations WHERE channel_id=$1 AND status<>'closed' GROUP BY handled_by",
        [id],
      )).rows as { handled_by: string; n: number }[];
      // Read only: report the exact preview conversation's bot ownership and
      // pending session, without any customer number, message body or token.
      const previewId = process.env.BOAT_PREVIEW_ONLY === 'true' &&
        process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID === id
        ? process.env.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID : undefined;
      const preview = previewId ? (await c.query(
        `SELECT cv.handled_by,cv.status,cv.last_inbound_at,
                fs.status AS session_status,fs.wait_kind,fs.created_at AS session_created_at,
                (SELECT count(*)::int FROM domain_events de
                 WHERE de.aggregate_id=cv.id::text AND de.type='message.received'
                   AND de.status IN ('failed','pending')) AS pending_inbound_events
           FROM conversations cv
           LEFT JOIN LATERAL (
             SELECT status,wait_kind,created_at FROM flow_sessions
              WHERE conversation_id=cv.id ORDER BY created_at DESC LIMIT 1
           ) fs ON true
          WHERE cv.id=$1 AND cv.channel_id=$2`,[previewId,id],
      )).rows[0] : undefined;
      return {
        active: channel.status === 'active',
        publishedFlowCount: flows.length,
        flowTriggers: flows.slice(0, 10).map((f) => ({
          name: f.name,
          draftSteps: f.draft_graph?.nodes?.length ?? 0,
          publishedSteps: f.published_graph?.nodes?.length ?? 0,
          publishedReplies: f.published_graph?.nodes?.filter((n) =>
            ['message', 'question', 'user_input', 'interactive', 'whatsapp_flow'].includes(n.type),
          ).length ?? 0,
          types: f.triggers.map((t) => t.type),
          matchesTestKeyword: f.triggers.some((t) =>
            t.type === 'any_message' ||
            (t.type === 'keyword' && t.keywords?.some((k) => k.includes('BOAT-TEST')))),
        })),
        activeConversationsBot: handlers.find((h) => h.handled_by === 'bot')?.n ?? 0,
        activeConversationsHuman: handlers.filter((h) => h.handled_by !== 'bot').reduce((n, h) => n + h.n, 0),
        recentBotReplies: messages.filter((m) => m.sender_type === 'bot').length,
        recentSent: messages.filter((m) => m.sender_type === 'bot' && ['sent', 'delivered', 'read'].includes(m.status)).length,
        recentBlocked: messages.filter((m) => m.job_status === 'blocked').length,
        recentFailed: messages.filter((m) => m.job_status === 'failed').length,
        previewBotEnabled: process.env.BOAT_PREVIEW_ONLY === 'true' &&
          process.env.WHATSAPP_PREVIEW_BOT_ENABLED === 'true' &&
          process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID === id,
        previewConversation: preview ? {
          handledBy: preview.handled_by as string,
          status: preview.status as string,
          lastInboundAt: preview.last_inbound_at as Date | null,
          sessionStatus: preview.session_status as string | null,
          sessionWaitKind: preview.wait_kind as string | null,
          sessionCreatedAt: preview.session_created_at as Date | null,
          pendingInboundEvents: Number(preview.pending_inbound_events ?? 0),
        } : null,
      };
    });
  }

  /** Owner-initiated restart for the ONE configured preview conversation.
   * Never touches other tenants, customer channels, or production environments.
   */
  @Roles('owner', 'admin')
  @Post(':id/preview-restart')
  previewRestart(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    parse(z.object({ confirm: z.literal(true) }), body);
    if (process.env.BOAT_PREVIEW_ONLY !== 'true' ||
        process.env.WHATSAPP_PREVIEW_BOT_ENABLED !== 'true' ||
        process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID !== id ||
        !process.env.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID)
      throw new NotFoundException('Preview restart not enabled for this channel');
    const conversationId = process.env.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID;
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const channel = (await c.query(
        "SELECT id FROM channels WHERE id=$1 AND type='whatsapp' AND status='active'",
        [id],
      )).rows[0];
      const cv = (await c.query(
        "SELECT id,status FROM conversations WHERE id=$1 AND channel_id=$2 FOR UPDATE",
        [conversationId,id],
      )).rows[0];
      if (!channel || !cv || cv.status === 'closed')
        throw new NotFoundException('Active preview conversation not found');
      const published = (await c.query(
        `SELECT v.triggers,v.channel_ids FROM flows f
         JOIN flow_versions v ON v.id=f.published_version_id
         WHERE f.status='published' AND NOT f.is_component
           AND (cardinality(v.channel_ids)=0 OR $1=ANY(v.channel_ids))`,
        [id],
      )).rows as { triggers: { type: string }[]; channel_ids: string[] }[];
      if (published.filter((f) => f.triggers.some((t) => t.type === 'first_message')).length !== 1)
        throw new NotFoundException('Exactly one published welcome bot is required');
      const expired = await c.query(
        "UPDATE flow_sessions SET status='expired',updated_at=now() WHERE conversation_id=$1 AND status='waiting'",
        [conversationId],
      );
      await c.query(
        "UPDATE conversations SET handled_by='bot',assigned_to=NULL WHERE id=$1",
        [conversationId],
      );
      return { restoredToBot: true, previousWaitingSessions: expired.rowCount ?? 0 };
    });
  }

  /** Authenticated, tenant-scoped, read-only diagnostics. Never returns tokens,
   * phone numbers, message bodies or raw provider errors.
   */
  @Roles('owner', 'admin')
  @Get(':id/whatsapp-auth-diagnostics')
  async whatsappAuthDiagnostics(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.db.withTenant(req.user.tenantId, async (c) => {
      const channel = (await c.query(
        "SELECT * FROM channels WHERE id=$1 AND type='whatsapp'", [id],
      )).rows[0];
      if (!channel) throw new NotFoundException('WhatsApp channel not found');
      const recent = (await c.query(
        `SELECT m.created_at, m.status, m.error AS message_error,
                j.status AS job_status, j.error AS job_error
           FROM messages m
           LEFT JOIN LATERAL (
             SELECT status,error FROM outbound_jobs
              WHERE message_id=m.id ORDER BY updated_at DESC LIMIT 1
           ) j ON true
          WHERE m.channel_id=$1 AND m.direction='out'
            AND m.created_at>now()-interval '6 hours'
            AND (m.status='failed' OR j.status IN ('failed','blocked','ambiguous'))
          ORDER BY m.created_at DESC LIMIT 10`, [id],
      )).rows as {
        created_at: Date;
        status: string;
        message_error: string | null;
        job_status: string | null;
        job_error: string | null;
      }[];
      return { channel, recent };
    });
    const authorization = await this.channels.inspectAuthorization(req.user.tenantId, id);
    return {
      ...authorization,
      recentFailures: result.recent.map((row) => ({
        createdAt: row.created_at,
        messageStatus: row.status,
        jobStatus: row.job_status,
        ...classifyOutboundFailure(row.message_error ?? row.job_error ?? ''),
      })),
    };
  }

  @Roles('owner', 'admin')
  @Post(':id/verify')
  verify(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.channels.verify(req.user.tenantId, id);
  }

  @Roles('owner','admin')
  @Post(':id/telegram-webhook')
  telegramWebhook(@Req() req:AuthedRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:unknown) {
    parse(z.object({confirm:z.literal(true)}),body);
    return this.channels.setupTelegram(req.user.tenantId,id);
  }

  @Roles('owner', 'admin')
  @Post(':id/credentials')
  reconnect(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        accessToken: z.string().min(10).max(4000),
        wabaId: z.string().regex(/^\d+$/).optional(),
      }),
      body,
    );
    return this.channels.reconnect(req.user.tenantId, id, input.accessToken, input.wabaId);
  }

  @Roles('owner', 'admin')
  @Get(':id/webhook-jobs')
  jobs(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(
      req.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,status,attempts,error,created_at,updated_at FROM webhook_jobs WHERE channel_id=$1 ORDER BY created_at DESC LIMIT 50',
            [id],
          )
        ).rows,
    );
  }

  @Roles('owner', 'admin')
  @Post(':id/webhook-jobs/:jobId/retry')
  retryJob(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.channels.retryWebhook(req.user.tenantId, id, jobId);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.channels.remove(req.user.tenantId, id);
  }
}
