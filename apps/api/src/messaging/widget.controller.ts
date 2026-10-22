import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Public } from '../auth/decorators';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { ChannelRow, ChannelsService, widgetSettingsSchema } from './channels.service';
import { MessagingService } from './messaging.service';

const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;
const sessionSchema = z.object({ visitorId: z.string().regex(VISITOR_ID).optional(), name: z.string().max(80).optional() });
const sendSchema = z
  .object({
    clientMsgId: z.string().min(8).max(64),
    text: z.string().min(1).max(2000).optional(),
    reply: z.object({ id: z.string().max(200), title: z.string().max(200) }).optional(),
  })
  .refine((v) => v.text || v.reply, 'text or reply required');

const token = (channelId: string, visitorId: string) =>
  createHmac('sha256', env.JWT_SECRET).update(`widget:${channelId}:${visitorId}`).digest('hex');

@Controller()
export class WidgetAssetController {
  private readonly script = readFileSync(join(__dirname, '../../assets/widget.js'), 'utf8');

  @Public() @Get('widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  asset() {
    return this.script;
  }
}

@Controller('widget')
export class WidgetController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly messaging: MessagingService,
    private readonly db: DatabaseService,
  ) {}

  private async channel(key: string, req: Request): Promise<ChannelRow> {
    const ch = await this.channels.lookup('web', key);
    if (!ch || ch.status !== 'active') throw new NotFoundException('Widget not found');
    const allowed = (ch.settings.allowedOrigins as string[] | undefined) ?? [];
    const origin = req.headers.origin;
    if (allowed.length && origin && !allowed.includes(origin)) throw new ForbiddenException('Origin not allowed');
    return ch;
  }

  private checkToken(ch: ChannelRow, visitorId: string, given?: string) {
    if (!VISITOR_ID.test(visitorId) || !given) throw new UnauthorizedException('Invalid visitor token');
    const a = Buffer.from(token(ch.id, visitorId));
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid visitor token');
  }

  @Public() @Get(':key/config')
  async config(@Param('key') key: string, @Req() req: Request) {
    const ch = await this.channel(key, req);
    const s = widgetSettingsSchema.parse(ch.settings);
    return { title: s.title, color: s.color, welcomeMessage: s.welcomeMessage, direction: s.direction, position: s.position };
  }

  @Public() @Post(':key/session')
  async session(@Param('key') key: string, @Body() body: unknown, @Req() req: Request) {
    const ch = await this.channel(key, req);
    const input = parse(sessionSchema, body);
    const visitorId = input.visitorId ?? randomBytes(12).toString('hex');
    return { visitorId, token: token(ch.id, visitorId) };
  }

  @Public() @Get(':key/messages')
  async messages(
    @Param('key') key: string,
    @Query('visitorId') visitorId: string,
    @Query('after') after: string | undefined,
    @Headers('x-visitor-token') given: string | undefined,
    @Req() req: Request,
  ) {
    const ch = await this.channel(key, req);
    this.checkToken(ch, visitorId, given);
    const afterSeq = Math.max(0, Number(after) || 0);

    return this.db.withTenant(ch.tenant_id, async (c) => {
      const r = await c.query(
        `SELECT m.id, m.seq, m.direction, m.sender_type, m.type, m.content, m.created_at
         FROM messages m
         WHERE m.conversation_id = (
                 SELECT cv.id FROM conversations cv
                 JOIN contact_channels cc ON cc.contact_id = cv.contact_id AND cc.channel_id = cv.channel_id
                 WHERE cv.channel_id = $1 AND cc.external_id = $2
                 ORDER BY cv.created_at DESC LIMIT 1)
           AND m.seq > $3 AND m.sender_type <> 'system' AND m.is_internal = false
         ORDER BY m.seq LIMIT 100`,
        [ch.id, visitorId, afterSeq],
      );
      return {
        messages: r.rows.map((m) => ({
          id: m.id,
          seq: Number(m.seq),
          senderType: m.sender_type,
          type: m.type,
          content: m.content,
          createdAt: m.created_at,
        })),
      };
    });
  }

  @Public() @Post(':key/messages')
  async send(
    @Param('key') key: string,
    @Query('visitorId') visitorId: string,
    @Headers('x-visitor-token') given: string | undefined,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const ch = await this.channel(key, req);
    this.checkToken(ch, visitorId, given);
    const input = parse(sendSchema, body);
    const r = await this.messaging.receive(ch, {
      contactExternalId: visitorId,
      contactName: 'Visitor',
      externalMessageId: `w-${input.clientMsgId}`,
      content: input.reply ? { text: input.reply.title, reply: input.reply } : { text: input.text },
    });
    return { ok: true, duplicate: r.duplicate };
  }
}
