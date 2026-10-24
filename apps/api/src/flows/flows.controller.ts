import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { createFlowSchema, graphSchema, testFlowSchema, updateFlowSchema } from './flow-schemas';
import { FlowsService } from './flows.service';
import { FlowGraph } from './engine';

@Controller('flows')
export class FlowsController {
  constructor(private readonly flows: FlowsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.flows.list(req.user.tenantId);
  }

  @Get('templates')
  templates(@Query() query: unknown) {
    const { language } = parse(z.object({ language: z.enum(['ar', 'en']).default('ar') }), query);
    return this.flows.templates(language);
  }

  @Get(':id/stats')
  stats(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.stats(req.user.tenantId, id);
  }

  @Get(':id/button-stats')
  buttonStats(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.buttonStats(req.user.tenantId, id);
  }

  @Get(':id/versions')
  versions(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.versions(req.user.tenantId, id);
  }

  @Roles('owner', 'admin')
  @Post(':id/versions/:versionId/restore')
  restore(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() body: unknown,
  ) {
    return this.flows.restore(
      req.user.tenantId,
      id,
      versionId,
      parse(z.object({ expectedUpdatedAt: z.string().datetime().optional() }).default({}), body)
        .expectedUpdatedAt,
    );
  }

  @Get(':id')
  get(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.get(req.user.tenantId, id);
  }

  @Roles('owner', 'admin')
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.flows.create(req.user.tenantId, req.user.userId, parse(createFlowSchema, body));
  }

  @Roles('owner', 'admin')
  @Patch(':id')
  update(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.flows.update(req.user.tenantId, id, parse(updateFlowSchema, body));
  }

  /** تحقق من رسم بياني (بدون حفظ) لعرض الأخطاء في المحرر */
  @Post('validate')
  validate(@Body() body: unknown) {
    return this.flows.validate(parse(graphSchema, body) as unknown as FlowGraph);
  }

  @Roles('owner', 'admin')
  @Post(':id/publish')
  publish(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.flows.publish(
      req.user.tenantId,
      req.user.userId,
      id,
      parse(z.object({ expectedUpdatedAt: z.string().datetime().optional() }).default({}), body)
        .expectedUpdatedAt,
    );
  }

  @Roles('owner', 'admin')
  @Post(':id/unpublish')
  unpublish(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.unpublish(req.user.tenantId, id);
  }

  @Roles('owner', 'admin')
  @Post(':id/duplicate')
  duplicate(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.duplicate(req.user.tenantId, req.user.userId, id);
  }

  @Roles('owner', 'admin')
  @Post(':id/test')
  test(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.flows.test(req.user.tenantId, id, parse(testFlowSchema, body));
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.flows.remove(req.user.tenantId, id);
  }
}
