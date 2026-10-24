import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { sequenceSchema } from './sequences.schemas';
import { SequencesService } from './sequences.service';

@Controller('labels')
@Roles('owner', 'admin')
export class LabelsController {
  constructor(private readonly sequences: SequencesService) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.sequences.labels(r.user.tenantId);
  }
}

@Controller('sequences')
@Roles('owner', 'admin')
export class SequencesController {
  constructor(private readonly sequences: SequencesService) {}

  @Get() list(@Req() r: AuthedRequest) {
    return this.sequences.list(r.user.tenantId);
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.sequences.create(r.user.tenantId, parse(sequenceSchema, body));
  }
  @Get(':id') get(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.sequences.get(r.user.tenantId, id);
  }
  @Get(':id/stats') stats(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.sequences.stats(r.user.tenantId, id);
  }
  @Put(':id') update(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.sequences.update(r.user.tenantId, id, parse(sequenceSchema, body));
  }
  @Patch(':id/status') status(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.sequences.setStatus(r.user.tenantId, id, parse(z.object({ status: z.enum(['active', 'paused']) }), body).status);
  }
  @Post(':id/enroll') enroll(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.sequences.enroll(r.user.tenantId, id, parse(z.object({ contactId: z.string().uuid() }), body).contactId);
  }
  @Delete(':id') remove(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.sequences.remove(r.user.tenantId, id);
  }
}
