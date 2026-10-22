import { OutboundService } from './outbound.service';
import { TemplatesController } from './templates.controller';
import { MetaConnectController } from './meta-connect.controller';
import { Module } from '@nestjs/common';
import { MetaAdapter } from './adapters/meta.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { CryptoService } from './crypto.service';
import { MessagingService } from './messaging.service';
import { WebhooksController } from './webhooks.controller';
import { WidgetAssetController, WidgetController } from './widget.controller';

@Module({
  controllers: [
    MetaConnectController,
    TemplatesController,
    ChannelsController,
    WebhooksController,
    WidgetController,
    WidgetAssetController,
  ],
  providers: [
    OutboundService,
    CryptoService,
    ChannelsService,
    MessagingService,
    WhatsAppAdapter,
    MetaAdapter,
  ],
  exports: [MessagingService, ChannelsService, OutboundService],
})
export class MessagingModule {}
