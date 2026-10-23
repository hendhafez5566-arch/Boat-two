import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
@Controller('agents/generation')
@Roles('owner', 'admin')
export class GenerationController {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
  ) {}
  @Get() status(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => ({
      policy: (await c.query('SELECT * FROM generation_policy')).rows[0] ?? { revision: 0 },
      usage:
        (
          await c.query(
            "SELECT * FROM generation_usage WHERE period=date_trunc('month',now())::date",
          )
        ).rows[0] ?? null,
      planLimit: (await this.plans.getTenantPlan(c)).limits.ai_credits ?? 0,
      reservations: (
        await c.query(
          'SELECT id,provider_id,model,status,period,reserved_tokens,reserved_cost_microusd,actual_input_tokens,actual_output_tokens,actual_cost_microusd,created_at,updated_at,reviewed_by FROM generation_reservations ORDER BY created_at DESC,id DESC LIMIT 100',
        )
      ).rows,
    }));
  }
  @Post('policy') @Roles('owner') policy(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          revision: z.number().int().min(0),
          monthlyCalls: z.number().int().min(0).max(10000000).nullable(),
          monthlyTokens: z.number().int().min(0).max(2000000000).nullable(),
          monthlyCostUsd: z.number().finite().min(0).max(1000000).nullable(),
        })
        .strict(),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const old = (await c.query('SELECT * FROM generation_policy')).rows[0];
      if ((old?.revision ?? 0) !== b.revision)
        throw new BadRequestException('Budget policy changed; reload');
      return (
        await c.query(
          'INSERT INTO generation_policy(tenant_id,monthly_calls,monthly_tokens,monthly_cost_microusd) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id) DO UPDATE SET monthly_calls=$2,monthly_tokens=$3,monthly_cost_microusd=$4,revision=generation_policy.revision+1 RETURNING *',
          [
            r.user.tenantId,
            b.monthlyCalls,
            b.monthlyTokens,
            b.monthlyCostUsd == null ? null : Math.round(b.monthlyCostUsd * 1000000),
          ],
        )
      ).rows[0];
    });
  }
  @Post(':id/release') @Roles('owner') release(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          confirmedNotBilled: z.literal(true),
          evidence: z.string().trim().min(20).max(2000),
        })
        .strict(),
      body,
    );
    return this.db.detached(r.user.tenantId, async (c) => {
      const row = (
        await c.query('SELECT * FROM generation_reservations WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (
        !row ||
        !['started', 'uncertain', 'reserved'].includes(row.status) ||
        Date.now() - new Date(row.updated_at).getTime() < 120000
      )
        throw new BadRequestException('Only stale unresolved reservations can be reviewed');
      if (
        (
          await c.query(
            "SELECT 1 FROM external_effects WHERE effect_key=$1 AND status='completed'",
            ['generation:' + id + ':0'],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'Completed provider evidence cannot be released; resume cached settlement',
        );
      await c.query(
        "UPDATE generation_reservations SET status='released',reviewed_by=$2,evidence=$3,updated_at=now() WHERE id=$1",
        [id, r.user.userId, b.evidence],
      );
      await c.query(
        'UPDATE generation_usage SET reserved_tokens=reserved_tokens-$2,reserved_cost_microusd=reserved_cost_microusd-$3 WHERE period=$1',
        [row.period, row.reserved_tokens, row.reserved_cost_microusd ?? 0],
      );
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,$2,'generation_release_evidence','generation_reservations',$3)",
        [r.user.tenantId, r.user.userId, id],
      );
      return { released: true };
    });
  }
}
