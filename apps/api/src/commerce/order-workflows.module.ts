import { Module } from '@nestjs/common';
import { OrderWorkflowsService } from './order-workflows.service';

@Module({ providers: [OrderWorkflowsService], exports: [OrderWorkflowsService] })
export class OrderWorkflowsModule {}
