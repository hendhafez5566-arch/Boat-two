import { Module } from '@nestjs/common';
import {IntegrationsModule} from '../integrations/integrations.module';
import {CommerceModule} from '../commerce/commerce.module';
import { AiModule } from '../ai/ai.module';
import { InboxModule } from '../inbox/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { SequencesModule } from '../sequences/sequences.module';
import { FlowRuntimeService } from './flow-runtime.service';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';
import { FlowActionsService } from './flow-actions.service';

@Module({
  imports: [MessagingModule, AiModule, InboxModule, SequencesModule,IntegrationsModule,CommerceModule],
  controllers: [FlowsController],
  providers: [FlowsService, FlowRuntimeService, FlowActionsService],
})
export class FlowsModule {}
