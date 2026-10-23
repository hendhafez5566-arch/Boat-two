import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
@Controller('delivery/policies')
@Roles('owner', 'admin')
export class DeliveryPolicyController {
  constructor(private db: DatabaseService) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT ch.id,ch.name,ch.type,COALESCE(p.interval_ms,1000) AS interval_ms,COALESCE(p.marketing_enabled,false) AS marketing_enabled,p.next_send_at FROM channels ch LEFT JOIN channel_delivery_policy p ON p.channel_id=ch.id ORDER BY ch.name',
          )
        ).rows,
    );
  }
  @Put(':id') save(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        intervalMs: z.number().int().min(100).max(3600000),
        marketingEnabled: z.boolean(),
      }),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const channel = (await c.query('SELECT type FROM channels WHERE id=$1', [id])).rows[0];
      if (!channel) throw new NotFoundException();
      if (channel.type !== 'web' && b.marketingEnabled && b.intervalMs < 1000)
        throw new BadRequestException(
          'External channels require a conservative interval of at least 1 second',
        );
      return (
        await c.query(
          'INSERT INTO channel_delivery_policy(tenant_id,channel_id,interval_ms,marketing_enabled) VALUES($1,$2,$3,$4) ON CONFLICT(channel_id) DO UPDATE SET interval_ms=$3,marketing_enabled=$4,updated_at=now() RETURNING channel_id,interval_ms,marketing_enabled',
          [r.user.tenantId, id, b.intervalMs, b.marketingEnabled],
        )
      ).rows[0];
    });
  }
}
