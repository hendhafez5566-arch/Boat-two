import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators';
import { env } from '../config/env';
import { ChannelsService } from './channels.service';
import { MessagingService } from './messaging.service';
import { InboundEvent, parseMeta, parseWhatsApp } from './webhook-parsers';

@Controller('webhooks')
export class WebhooksController {
  private readonly log = new Logger(WebhooksController.name);

  constructor(
    private readonly channels: ChannelsService,
    private readonly messaging: MessagingService,
  ) {}

  private verifyChallenge(mode: string, token: string, challenge: string) {
    if (!env.META_VERIFY_TOKEN) throw new ServiceUnavailableException('META_VERIFY_TOKEN not configured');
    if (mode !== 'subscribe' || token !== env.META_VERIFY_TOKEN) throw new ForbiddenException();
    return challenge;
  }

  private verifySignature(req: RawBodyRequest<Request>, signature?: string) {
    if (!env.META_APP_SECRET) throw new ServiceUnavailableException('META_APP_SECRET not configured');
    if (!req.rawBody || !signature?.startsWith('sha256=')) throw new BadRequestException('Missing signature');
    const expected = createHmac('sha256', env.META_APP_SECRET).update(req.rawBody).digest('hex');
    const given = signature.slice(7);
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Bad signature');
  }

  @Public() @Get('whatsapp')
  whatsappVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.verifyChallenge(mode, token, challenge);
  }

  @Public() @Get('meta')
  metaVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.verifyChallenge(mode, token, challenge);
  }

  @Public() @Post('whatsapp') @HttpCode(200)
  whatsapp(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') sig: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.verifySignature(req, sig);
    void this.process(parseWhatsApp(body)); // نرد 200 فوراً حتى لا يعيد Meta الإرسال
    return { received: true };
  }

  @Public() @Post('meta') @HttpCode(200)
  meta(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') sig: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.verifySignature(req, sig);
    void this.process(parseMeta(body));
    return { received: true };
  }

  private async process(events: InboundEvent[]) {
    for (const ev of events) {
      try {
        const channel = await this.channels.lookup(ev.channelType, ev.externalChannelId);
        if (!channel || channel.status !== 'active') {
          this.log.warn(`No active channel for ${ev.channelType}:${ev.externalChannelId}`);
          continue;
        }
        if (ev.kind === 'message') {
          await this.messaging.receive(channel, {
            contactExternalId: ev.contactExternalId,
            contactName: ev.contactName,
            externalMessageId: ev.externalMessageId,
            content: ev.content,
          });
        } else {
          await this.messaging.updateStatus(channel, ev.externalMessageId, ev.status, ev.error);
        }
      } catch (e) {
        this.log.error(`Webhook event failed: ${(e as Error).message}`);
      }
    }
  }
}
