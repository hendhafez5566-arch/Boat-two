import { InvitationMailModule } from './mail/invitation-mail';
import { IntegrationsModule } from './integrations/integrations.module';
import {CommerceModule} from './commerce/commerce.module';
import { PlatformModule } from './platform/platform.module';
import { EventsModule } from './events/events.service';
import { BusinessModule } from './business/business.module';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { DatabaseModule } from './database/database.module';
import { FlowsModule } from './flows/flows.module';
import { SequencesModule } from './sequences/sequences.module';
import { InboxModule } from './inbox/inbox.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';
import { PlansModule } from './plans/plans.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    CommerceModule,
    IntegrationsModule,
    InvitationMailModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: [
          'req.headers.authorization',
          'req.headers.x-platform-step-up',
          'req.headers.cookie',
          'req.headers.x-visitor-token',
          'req.url',
          'req.query.ticket',
          'req.query.token',
        ],
      },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    PlansModule,
    EventsModule,
    AuthModule,
    PlatformModule,
    WorkspaceModule,
    BillingModule,
    MessagingModule,
    InboxModule,
    FlowsModule,
    SequencesModule,
    AiModule,
    BusinessModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
