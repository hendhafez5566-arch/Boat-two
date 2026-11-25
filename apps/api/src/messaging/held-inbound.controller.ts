import { Controller, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import type { AuthedRequest } from '../common/types';
import { MessagingService } from './messaging.service';

@Controller('workspace/held-inbound')
@Roles('owner', 'admin')
export class HeldInboundController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('restore')
  restore(@Req() request: AuthedRequest) {
    return this.messaging.restoreHeldInbound(request.user.tenantId);
  }
}
