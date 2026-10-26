import { WhatsAppFlowsController } from './whatsapp-flows.controller';
import { WhatsAppFlowsService } from './whatsapp-flows.service';
import { WhatsAppFlowsGateway } from './whatsapp-flows.gateway';
import { DeliveryBudget } from './delivery-budget';
import { OutboundService } from './outbound.service';
import { TemplatesController } from './templates.controller';
import { MetaConnectController } from './meta-connect.controller';
import { Module } from '@nestjs/common';
import { MetaAdapter } from './adapters/meta.adapter';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { CryptoService } from './crypto.service';
import { MessagingService } from './messaging.service';
import { WebhooksController } from './webhooks.controller';
import { WidgetAssetController, WidgetController } from './widget.controller';

@Module({
  controllers: [
    WhatsAppFlowsController,
    MetaConnectController,
    TemplatesController,
    ChannelsController,
    WebhooksController,
    WidgetController,
    WidgetAssetController,
  ],
  providers: [
    WhatsAppFlowsService,
    WhatsAppFlowsGateway,
    DeliveryBudget,
    OutboundService,
    CryptoService,
    ChannelsService,
    MessagingService,
    WhatsAppAdapter,
    TelegramAdapter,
    MetaAdapter,
  ],
  exports: [DeliveryBudget, MessagingService, ChannelsService, OutboundService],
})
export class MessagingModule {}
