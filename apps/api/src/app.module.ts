import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { DatabaseModule } from './database/database.module';
import { FlowsModule } from './flows/flows.module';
import { InboxModule } from './inbox/inbox.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';
import { PlansModule } from './plans/plans.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: ['req.headers.authorization'],
      },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    PlansModule,
    AuthModule,
    WorkspaceModule,
    BillingModule,
    MessagingModule,
    InboxModule,
    FlowsModule,
    AiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
