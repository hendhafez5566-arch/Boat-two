import { SubscriptionRequests, SubscriptionRequestsController } from './subscription-requests';
import { BillingReconciliation, ReconciliationController } from './reconciliation';
import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController, ReconciliationController, SubscriptionRequestsController],
  providers: [BillingService, BillingReconciliation, SubscriptionRequests],
})
export class BillingModule {}
