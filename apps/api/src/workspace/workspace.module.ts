import { DomainTransfers, DomainTransfersController } from './domain-transfers';
import { DomainHosting, DomainHostingController, PublicDomainController } from './domain-hosting';
import { BrandingController } from './branding.controller';
import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';

@Module({
  controllers: [
    WorkspaceController,
    BrandingController,
    DomainHostingController,
    PublicDomainController,
    DomainTransfersController,
  ],
  providers: [DomainHosting, DomainTransfers],
})
export class WorkspaceModule {}
