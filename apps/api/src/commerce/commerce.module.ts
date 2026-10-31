import { DataSourcesService } from './data-sources.service';
import { DataSourcesController } from './data-sources.controller';
import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CommerceService } from './commerce.service';
import { SocialService } from './social.service';
import { CommerceController } from './commerce.controller';
@Module({
  imports: [MessagingModule, IntegrationsModule],
  providers: [CommerceService, SocialService, DataSourcesService],
  controllers: [CommerceController, DataSourcesController],
  exports: [CommerceService, DataSourcesService],
})
export class CommerceModule {}
