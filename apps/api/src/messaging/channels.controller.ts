import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { ChannelsService, createChannelSchema, updateChannelSchema } from './channels.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.channels.list(req.user.tenantId);
  }

  @Roles('owner', 'admin') @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.channels.create(req.user.tenantId, parse(createChannelSchema, body));
  }

  @Roles('owner', 'admin') @Patch(':id')
  update(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.channels.update(req.user.tenantId, id, parse(updateChannelSchema, body));
  }

  @Roles('owner', 'admin') @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.channels.remove(req.user.tenantId, id);
  }
}
