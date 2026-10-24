import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
@Controller('crm/jobs/retention')
@Roles('owner')
export class CrmRetentionController {
  constructor(private db: DatabaseService) {}
  @Post('preview') preview(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(z.object({ days: z.number().int().min(7).max(3650) }).strict(), body);
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query('SELECT crm_retention_preview(now()-make_interval(days=>$1)) AS result', [
            b.days,
          ])
        ).rows[0].result,
    );
  }
  @Post('apply') apply(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          cutoff: z.string().datetime({ offset: true }),
          historyRows: z.number().int().min(0),
          jobPayloads: z.number().int().min(0),
          confirmed: z.literal(true),
        })
        .strict(),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (new Date(b.cutoff).getTime() > Date.now() - 7 * 86400000)
        throw new BadRequestException('Keep at least seven days');
      try {
        return (
          await c.query('SELECT crm_retention_apply($1,$2,$3,$4) AS result', [
            b.cutoff,
            r.user.userId,
            b.historyRows,
            b.jobPayloads,
          ])
        ).rows[0].result;
      } catch {
        throw new BadRequestException('Cleanup refused; refresh history and preview counts again');
      }
    });
  }
}
