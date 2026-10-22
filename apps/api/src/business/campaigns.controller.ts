import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { contentSchema, validateOutbound } from '../messaging/message-content';
import { CampaignsService } from './campaigns.service';
import { filtersSchema, pagination } from './schemas';
const schema = z.object({
  name: z.string().min(1).max(120),
  channelId: z.string().uuid(),
  filters: filtersSchema.default({}),
  content: contentSchema,
  frequencyHours: z.number().int().min(1).max(720).default(24),
});
@Controller('campaigns')
@Roles('owner', 'admin')
export class CampaignsController {
  constructor(
    private db: DatabaseService,
    private campaigns: CampaignsService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            `SELECT p.*,ch.name AS channel_name,(SELECT count(*)::int FROM campaign_recipients WHERE campaign_id=p.id) AS recipients FROM campaigns p JOIN channels ch ON ch.id=p.channel_id ORDER BY created_at DESC LIMIT 100`,
          )
        ).rows,
    );
  }
  @Post('audience') audience(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(z.object({ channelId: z.string().uuid(), filters: filtersSchema }), body);
    return this.campaigns.audience(r.user.tenantId, b.channelId, b.filters);
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(schema, body);
    validateOutbound(b.content);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (!(await c.query('SELECT 1 FROM channels WHERE id=$1', [b.channelId])).rowCount)
        throw new NotFoundException('Channel not found');
      return (
        await c.query(
          'INSERT INTO campaigns(tenant_id,name,channel_id,filters,content,frequency_hours) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            r.user.tenantId,
            b.name,
            b.channelId,
            JSON.stringify(b.filters),
            JSON.stringify(b.content),
            b.frequencyHours,
          ],
        )
      ).rows[0];
    });
  }
  @Post(':id/schedule') schedule(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ at: z.string().datetime() }), body);
    return this.campaigns.schedule(r.user.tenantId, id, b.at);
  }
  @Patch(':id/cancel') cancel(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE campaigns SET status='canceled' WHERE id=$1 AND status IN ('draft','scheduled','running') RETURNING id",
          [id],
        )
      ).rows[0];
      if (!row) throw new BadRequestException('Campaign cannot be canceled');
      await c.query(
        "UPDATE outbound_jobs SET status='failed',error='Campaign canceled',updated_at=now() WHERE message_id IN(SELECT message_id FROM campaign_recipients WHERE campaign_id=$1) AND status IN ('pending','blocked')",
        [id],
      );
      await c.query(
        "UPDATE messages SET status='failed',error='Campaign canceled' WHERE id IN(SELECT message_id FROM campaign_recipients WHERE campaign_id=$1) AND status='queued' AND id IN(SELECT message_id FROM outbound_jobs WHERE status='failed')",
        [id],
      );
      return row;
    });
  }
  @Get(':id/recipients') recipients(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
  ) {
    const q = parse(pagination, query);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (!(await c.query('SELECT 1 FROM campaigns WHERE id=$1', [id])).rowCount)
        throw new NotFoundException();
      return {
        items: (
          await c.query(
            'SELECT r.*,ct.name AS contact_name,m.status AS delivery_status FROM campaign_recipients r JOIN contacts ct ON ct.id=r.contact_id LEFT JOIN messages m ON m.id=r.message_id WHERE campaign_id=$1 ORDER BY r.id LIMIT $2 OFFSET $3',
            [id, q.limit, (q.page - 1) * q.limit],
          )
        ).rows,
        totals: (
          await c.query(
            'SELECT r.status,m.status AS delivery_status,count(*)::int AS count FROM campaign_recipients r LEFT JOIN messages m ON m.id=r.message_id WHERE campaign_id=$1 GROUP BY r.status,m.status',
            [id],
          )
        ).rows,
      };
    });
  }
  @Post(':id/recipients/:recipient/retry') retry(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recipient', ParseUUIDPipe) recipient: string,
  ) {
    return this.campaigns.retry(r.user.tenantId, id, recipient);
  }
}
