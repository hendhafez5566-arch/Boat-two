import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { AutomationService } from './automation.service';
import { OperationsController } from './operations.controller';
@Module({
  imports: [MessagingModule],
  providers: [CrmService, CampaignsService, AutomationService],
  controllers: [CrmController, CampaignsController, OperationsController],
})
export class BusinessModule {}
