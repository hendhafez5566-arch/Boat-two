import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { SequenceCenterService } from './sequence-center.service';
import { sequenceAudienceSchema, sequenceCenterQuery } from './sequence-audience';
@Controller('sequence-center')
@Roles('owner', 'admin')
export class SequenceCenterController {
  constructor(private center: SequenceCenterService) {}
  @Get() list(@Req() r: AuthedRequest, @Query() query: unknown) {
    return this.center.list(r.user.tenantId, parse(sequenceCenterQuery, query));
  }
  @Post(':id/audience-review') preview(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.center.preview(
      r.user.tenantId,
      r.user.userId,
      id,
      parse(sequenceAudienceSchema, body),
    );
  }
  @Post(':id/bulk-assign') assign(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.center.assign(
      r.user.tenantId,
      r.user.userId,
      id,
      parse(z.object({ reviewId: z.string().uuid() }).strict(), body).reviewId,
    );
  }
}
