import { CrmRetentionController } from './crm-retention.controller';
import { ContactListsController } from './contact-lists.controller';
import { IntegrationSecretsController } from './integration-secrets.controller';
import { CryptoService } from '../messaging/crypto.service';
import { DeliveryPolicyController } from './delivery-policy.controller';
import { ReportsController } from './reports.controller';
import { CrmJobs, CrmJobsController } from './crm-jobs';
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
  providers: [CryptoService, CrmJobs, CrmService, CampaignsService, AutomationService],
  controllers: [
    ContactListsController,
    CrmRetentionController,
    IntegrationSecretsController,
    DeliveryPolicyController,
    ReportsController,
    CrmJobsController,
    CrmController,
    CampaignsController,
    OperationsController,
  ],
})
export class BusinessModule {}
