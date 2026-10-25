import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Post,
  Param,
  Query,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { ChannelsService } from './channels.service';
import {telegramWebhookAuthorized} from './adapters/telegram.adapter';
import { MessagingService } from './messaging.service';
import { InboundEvent, parseMeta, parseWhatsApp, parseTelegram } from './webhook-parsers';

@Controller('webhooks')
export class WebhooksController implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly log = new Logger(WebhooksController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly channels: ChannelsService,
    private readonly messaging: MessagingService,
  ) {}

  private verifyChallenge(mode: string, token: string, challenge: string) {
    if (!env.META_VERIFY_TOKEN)
      throw new ServiceUnavailableException('META_VERIFY_TOKEN not configured');
    if (mode !== 'subscribe' || token !== env.META_VERIFY_TOKEN) throw new ForbiddenException();
    return challenge;
  }

  private verifySignature(req: RawBodyRequest<Request>, signature?: string) {
    if (!env.META_APP_SECRET)
      throw new ServiceUnavailableException('META_APP_SECRET not configured');
    if (!req.rawBody || !signature?.startsWith('sha256='))
      throw new BadRequestException('Missing signature');
    const expected = createHmac('sha256', env.META_APP_SECRET).update(req.rawBody).digest('hex');
    const given = signature.slice(7);
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new ForbiddenException('Bad signature');
  }

  @Public()
  @Get('whatsapp')
  whatsappVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.verifyChallenge(mode, token, challenge);
  }

  @Public()
  @Get('meta')
  metaVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.verifyChallenge(mode, token, challenge);
  }

  @Public()
  @Post('whatsapp')
  @HttpCode(200)
  async whatsapp(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') sig: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.verifySignature(req, sig);
    await this.enqueue(parseWhatsApp(body));
    return { received: true };
  }

  @Public()
  @Post('telegram/:botId')
  @HttpCode(200)
  async telegram(@Param('botId') botId:string,@Headers('x-telegram-bot-api-secret-token') secret:string|undefined,@Body() body:Record<string,unknown>) {
    if(!/^\d{5,20}$/.test(botId))throw new ForbiddenException();
    const channel=await this.channels.lookup('telegram',botId);
    if(!channel||channel.status!=='active')throw new ForbiddenException();
    const expected=this.channels.credentials(channel).webhookSecret;
    if(!telegramWebhookAuthorized(expected,secret))throw new ForbiddenException('Invalid Telegram webhook secret');
    await this.enqueue(parseTelegram(botId,body));
    return{received:true};
  }

  @Public()
  @Post('meta')
  @HttpCode(200)
  async meta(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') sig: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.verifySignature(req, sig);
    await this.enqueue(parseMeta(body));
    return { received: true };
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async enqueue(events: InboundEvent[]) {
    // Respond only after durable insertion. A database failure returns non-2xx so Meta retries.
    for (const ev of events) {
      const channel = await this.channels.lookup(ev.channelType, ev.externalChannelId);
      if (!channel || channel.status !== 'active') continue;
      const payload = JSON.stringify(ev);
      const key = createHash('sha256').update(payload).digest('hex');
      await this.db.withTenant(channel.tenant_id, (c) =>
        c.query(
          `INSERT INTO webhook_jobs(tenant_id,channel_id,dedupe_key,payload) VALUES($1,$2,$3,$4) ON CONFLICT(channel_id,dedupe_key) DO NOTHING`,
          [channel.tenant_id, channel.id, key, payload],
        ),
      );
    }
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const jobs = await this.db.query<{ id: string; tenant_id: string }>(
        'SELECT * FROM webhook_claim_jobs(10)',
      );
      for (const job of jobs.rows) {
        try {
          const row = await this.db.withTenant(
            job.tenant_id,
            async (c) =>
              (await c.query('SELECT payload,attempts FROM webhook_jobs WHERE id=$1', [job.id]))
                .rows[0],
          );
          const ev = row.payload as InboundEvent;
          const channel = await this.channels.lookup(ev.channelType, ev.externalChannelId);
          if (!channel || channel.tenant_id !== job.tenant_id || channel.status !== 'active')
            throw new Error('Channel unavailable or disabled');
          if (ev.kind === 'message')
            await this.messaging.receive(channel, {
              contactExternalId: ev.contactExternalId,
              contactName: ev.contactName,
              externalMessageId: ev.externalMessageId,
              content: ev.content,
            });
          else
            await this.messaging.updateStatus(channel, ev.externalMessageId, ev.status, ev.error);
          await this.db.withTenant(job.tenant_id, (c) =>
            c.query(
              "UPDATE webhook_jobs SET status='completed',lease_until=NULL,error=NULL,updated_at=now() WHERE id=$1",
              [job.id],
            ),
          );
        } catch (e) {
          this.log.warn(`Webhook job ${job.id} failed`);
          await this.db.withTenant(job.tenant_id, (c) =>
            c.query(
              `UPDATE webhook_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END, available_at=now()+make_interval(secs=>LEAST(300, power(2,LEAST(attempts,8))::int)), lease_until=NULL,error=$2,updated_at=now() WHERE id=$1`,
              [job.id, (e as Error).message.slice(0, 300)],
            ),
          );
        }
      }
    } catch (e) {
      this.log.error(`Webhook worker failed: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }
}
