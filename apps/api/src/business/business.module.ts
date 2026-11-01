import { InboxModule } from '../inbox/inbox.module';
import { SalesController } from './sales.controller';
import { NotificationsService } from './notifications.service';
import { CrmRetentionController } from './crm-retention.controller';
import { ContactListsController } from './contact-lists.controller';
import { IntegrationSecretsController } from './integration-secrets.controller';
import { CryptoService } from '../messaging/crypto.service';
import { DeliveryPolicyController } from './delivery-policy.controller';
import { ReportsController } from './reports.controller';
import { CrmJobs, CrmJobsController } from './crm-jobs';
import { CrmWorkspaceController } from './crm-workspace.controller';
import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { AutomationService } from './automation.service';
import { OperationsController } from './operations.controller';
@Module({
  imports: [MessagingModule, InboxModule],
  providers: [
    NotificationsService,
    CryptoService,
    CrmJobs,
    CrmService,
    CampaignsService,
    AutomationService,
  ],
  controllers: [
    SalesController,
    ContactListsController,
    CrmRetentionController,
    IntegrationSecretsController,
    DeliveryPolicyController,
    ReportsController,
    CrmJobsController,
    CrmController,
    CrmWorkspaceController,
    CampaignsController,
    OperationsController,
  ],
})
export class BusinessModule {}
