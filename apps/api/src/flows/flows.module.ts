import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InboxModule } from '../inbox/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { FlowRuntimeService } from './flow-runtime.service';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';

@Module({
  imports: [MessagingModule, AiModule, InboxModule],
  controllers: [FlowsController],
  providers: [FlowsService, FlowRuntimeService],
})
export class FlowsModule {}
