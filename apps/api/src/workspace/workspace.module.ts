import { BrandingController } from './branding.controller';
import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';

@Module({ controllers: [WorkspaceController, BrandingController] })
export class WorkspaceModule {}
