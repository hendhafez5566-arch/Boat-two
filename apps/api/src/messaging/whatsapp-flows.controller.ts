import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { flowRevisionSchema, nativeFlowDraftSchema } from './whatsapp-flow-contract';
import { WhatsAppFlowsService } from './whatsapp-flows.service';
@Controller('channels/:channelId/whatsapp-flows')
@Roles('owner', 'admin')
export class WhatsAppFlowsController {
  constructor(private flows: WhatsAppFlowsService) {}
  @Get() list(@Req() r: AuthedRequest, @Param('channelId', ParseUUIDPipe) ch: string) {
    return this.flows.list(r.user.tenantId, ch);
  }
  @Post() create(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) ch: string,
    @Body() body: unknown,
  ) {
    return this.flows.create(r.user.tenantId, ch, parse(nativeFlowDraftSchema, body));
  }
  @Patch(':id') edit(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) ch: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({ revision: z.number().int().positive(), draft: nativeFlowDraftSchema }).strict(),
      body,
    );
    return this.flows.edit(r.user.tenantId, ch, id, input.revision, input.draft);
  }
  @Post('sync') sync(@Req() r: AuthedRequest, @Param('channelId', ParseUUIDPipe) ch: string) {
    return this.flows.sync(r.user.tenantId, ch);
  }
  @Post(':id/refresh') refresh(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) ch: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.flows.refresh(r.user.tenantId, ch, id);
  }
  @Post(':id/actions/:action') operate(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) ch: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    return this.flows.operate(
      r.user.tenantId,
      ch,
      id,
      parse(flowRevisionSchema, body).revision,
      parse(z.enum(['create', 'upload', 'publish', 'deprecate']), action),
    );
  }
  @Post(':id/reconcile') reconcile(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) ch: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({ revision: z.number().int().positive(), providerId: z.string().regex(/^\d+$/) })
        .strict(),
      body,
    );
    return this.flows.reconcileCreate(r.user.tenantId, ch, id, input.revision, input.providerId);
  }
  @Post(':id/archive') archive(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) ch: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.flows.archive(r.user.tenantId, ch, id, parse(flowRevisionSchema, body).revision);
  }
}
