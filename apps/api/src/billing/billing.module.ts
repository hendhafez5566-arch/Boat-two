import { BillingReconciliation, ReconciliationController } from './reconciliation';
import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController, ReconciliationController],
  providers: [BillingService, BillingReconciliation],
})
export class BillingModule {}
