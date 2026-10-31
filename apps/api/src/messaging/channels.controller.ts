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
        `SELECT f.id,f.name,v.triggers FROM flows f
         JOIN flow_versions v ON v.id=f.published_version_id
         WHERE f.status='published' AND NOT f.is_component
         AND (cardinality(v.channel_ids)=0 OR $1=ANY(v.channel_ids))`,
        [id],
      )).rows as { id: string; name: string; triggers: { type: string; keywords?: string[] }[] }[];
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
      return {
        active: channel.status === 'active',
        publishedFlowCount: flows.length,
        flowTriggers: flows.slice(0, 10).map((f) => ({
          name: f.name,
          types: f.triggers.map((t) => t.type),
          matchesTestKeyword: f.triggers.some((t) =>
            t.type === 'any_message' ||
            (t.type === 'keyword' && t.keywords?.some((k) => k.includes('BOAT-TEST')))),
        })),
        activeConversationsBot: handlers.find((h) => h.handled_by === 'bot')?.n ?? 0,
        activeConversationsHuman: handlers.filter((h) => h.handled_by !== 'bot').reduce((n, h) => n + h.n, 0),
        recentBotReplies: messages.filter((m) => m.sender_type === 'bot').length,
        recentBlocked: messages.filter((m) => m.job_status === 'blocked').length,
        recentFailed: messages.filter((m) => m.job_status === 'failed').length,
        previewBotEnabled: process.env.BOAT_PREVIEW_ONLY === 'true' &&
          process.env.WHATSAPP_PREVIEW_BOT_ENABLED === 'true' &&
          process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID === id,
      };
    });
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
