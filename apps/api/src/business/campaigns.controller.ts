import {
  campaignList,
  campaignListSchema,
  campaignScopeSchema,
  campaignSummary,
} from './campaign-list';
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
import { validateCampaignContent } from './campaign-content';
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
  @Get() list(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(campaignListSchema, query);
    return this.db.withTenant(r.user.tenantId, (c) => campaignList(c, q));
  }
  @Get('labels') labels(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT DISTINCT unnest(tags) AS name FROM contacts WHERE merged_into_id IS NULL AND archived_at IS NULL ORDER BY name',
          )
        ).rows,
    );
  }
  @Get('summary') summary(@Req() r: AuthedRequest, @Query() query: unknown) {
    const scope = parse(campaignScopeSchema, query);
    return this.db.withTenant(r.user.tenantId, (c) => campaignSummary(c, scope));
  }
  @Post('audience') audience(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(z.object({ channelId: z.string().uuid(), filters: filtersSchema }), body);
    return this.campaigns.audience(r.user.tenantId, b.channelId, b.filters);
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(schema, body);
    validateOutbound(b.content);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await validateCampaignContent(c, b.channelId, b.content);
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
  @Patch(':id') edit(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(schema.extend({ revision: z.number().int().min(0) }), body);
    validateOutbound(b.content);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await validateCampaignContent(c, b.channelId, b.content);
      const row = (
        await c.query(
          `UPDATE campaigns SET name=$2,channel_id=$3,filters=$4,content=$5,frequency_hours=$6,revision=revision+1,updated_at=now()
        WHERE id=$1 AND status='draft' AND revision=$7 RETURNING *`,
          [
            id,
            b.name,
            b.channelId,
            JSON.stringify(b.filters),
            JSON.stringify(b.content),
            b.frequencyHours,
            b.revision,
          ],
        )
      ).rows[0];
      if (!row)
        throw new BadRequestException(
          'Draft changed or is no longer editable; refresh before saving',
        );
      return row;
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
          "UPDATE campaigns SET status='canceled',revision=revision+1,updated_at=now() WHERE id=$1 AND status IN ('draft','scheduled','running') RETURNING id",
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
    const q = parse(
      pagination.extend({
        search: z.string().max(120).default(''),
        status: z.enum(['', 'pending', 'queued', 'skipped', 'failed']).default(''),
        deliveryStatus: z
          .enum(['', 'none', 'received', 'queued', 'sent', 'delivered', 'read', 'failed'])
          .default(''),
        jobStatus: z
          .enum(['', 'none', 'pending', 'sending', 'sent', 'failed', 'ambiguous', 'blocked'])
          .default(''),
      }),
      query,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (!(await c.query('SELECT 1 FROM campaigns WHERE id=$1', [id])).rowCount)
        throw new NotFoundException();
      const from = `FROM campaign_recipients r JOIN campaigns p ON p.id=r.campaign_id JOIN contacts ct ON ct.id=r.contact_id LEFT JOIN messages m ON m.id=r.message_id LEFT JOIN outbound_jobs j ON j.message_id=m.id
        WHERE r.campaign_id=$1 AND ($2='' OR position(lower($2) in lower(ct.name))>0) AND ($3='' OR r.status=$3)
        AND ($4='' OR COALESCE(m.status,'none')=$4) AND ($5='' OR COALESCE(j.status,'none')=$5)`;
      const values = [id, q.search, q.status, q.deliveryStatus, q.jobStatus];
      return {
        items: (
          await c.query(
            `SELECT r.*,ct.name AS contact_name,m.status AS delivery_status,m.error AS delivery_error,j.status AS job_status,j.error AS job_error,j.attempts,
          (r.status='failed' AND r.message_id IS NULL AND p.status IN ('running','completed')) AS can_retry ${from} ORDER BY r.id LIMIT $6 OFFSET $7`,
            [...values, q.limit, (q.page - 1) * q.limit],
          )
        ).rows,
        filteredCount: (await c.query(`SELECT count(*)::int AS n ${from}`, values)).rows[0].n,
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
