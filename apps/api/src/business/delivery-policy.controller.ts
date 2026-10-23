import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Post,
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
            'SELECT ch.id,ch.name,ch.type,COALESCE(p.interval_ms,1000) AS interval_ms,COALESCE(p.marketing_enabled,false) AS marketing_enabled,p.next_send_at,p.account_id FROM channels ch LEFT JOIN channel_delivery_policy p ON p.channel_id=ch.id ORDER BY ch.name',
          )
        ).rows,
    );
  }
  @Get('accounts') accounts(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) => (await c.query('SELECT * FROM delivery_accounts ORDER BY name')).rows,
    );
  }
  @Post('accounts') createAccount(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.saveAccount(r, body);
  }
  @Put('accounts/:id') updateAccount(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saveAccount(r, body, id);
  }
  private saveAccount(r: AuthedRequest, body: unknown, id?: string) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        provider: z.enum(['meta', 'web']),
        intervalMs: z.number().int().min(100).max(3600000),
        dailyLimit: z
          .number()
          .int()
          .min(-1)
          .max(100000000)
          .refine((value) => value !== 0),
        enabled: z.boolean().default(true),
      }),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (b.provider === 'meta' && b.intervalMs < 1000)
        throw new BadRequestException('Meta shared interval must be at least one second');
      if (!id) {
        await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
        if ((await c.query('SELECT count(*)::int AS n FROM delivery_accounts')).rows[0].n >= 50)
          throw new BadRequestException('At most 50 shared account groups');
      }
      const row = (
        await c.query(
          id
            ? 'UPDATE delivery_accounts SET name=$2,interval_ms=$4,daily_limit=$5,enabled=$6 WHERE id=$1 AND provider=$3 RETURNING *'
            : 'INSERT INTO delivery_accounts(tenant_id,name,provider,interval_ms,daily_limit,enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [id ?? r.user.tenantId, b.name, b.provider, b.intervalMs, b.dailyLimit, b.enabled],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Account not found or provider cannot be changed');
      return row;
    });
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
        accountId: z.string().uuid().nullable().optional(),
      }),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7))', [id]);
      const channel = (await c.query('SELECT type FROM channels WHERE id=$1', [id])).rows[0];
      if (!channel) throw new NotFoundException();
      if (channel.type !== 'web' && b.marketingEnabled && b.intervalMs < 1000)
        throw new BadRequestException(
          'External channels require a conservative interval of at least 1 second',
        );
      if (b.accountId) {
        const account = (
          await c.query('SELECT provider FROM delivery_accounts WHERE id=$1', [b.accountId])
        ).rows[0];
        if (!account) throw new NotFoundException('Shared account not found');
        if (account.provider !== (channel.type === 'web' ? 'web' : 'meta'))
          throw new BadRequestException('Account provider does not match channel');
      }
      return (
        await c.query(
          'INSERT INTO channel_delivery_policy(tenant_id,channel_id,interval_ms,marketing_enabled,account_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(channel_id) DO UPDATE SET interval_ms=$3,marketing_enabled=$4,account_id=CASE WHEN $6 THEN $5::uuid ELSE channel_delivery_policy.account_id END,updated_at=now() RETURNING channel_id,interval_ms,marketing_enabled,account_id',
          [
            r.user.tenantId,
            id,
            b.intervalMs,
            b.marketingEnabled,
            b.accountId ?? null,
            b.accountId !== undefined,
          ],
        )
      ).rows[0];
    });
  }
}
