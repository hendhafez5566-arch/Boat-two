import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { DomainHosting } from './domain-hosting';
@Injectable()
export class DomainTransfers {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private hosting: DomainHosting,
  ) {}
  start(tenant: string, id: string, target: string) {
    if (tenant === target) throw new BadRequestException('Target must be a different workspace');
    return this.db.withTenant(tenant, async (c) => {
      const domain = (
        await c.query(
          "SELECT * FROM workspace_domains WHERE id=$1 AND status='verified' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !domain ||
        !domain.verified_at ||
        Date.now() - new Date(domain.verified_at).getTime() > 86400000
      )
        throw new BadRequestException('Freshly verified source domain required');
      const secret = randomBytes(24).toString('base64url'),
        proof = randomBytes(24).toString('hex');
      // Expired requests never authorize transfer; source explicitly cancels before starting another.
      if (
        (
          await c.query(
            "SELECT 1 FROM workspace_domain_transfers WHERE domain_id=$1 AND status='pending'",
            [id],
          )
        ).rowCount
      )
        throw new BadRequestException('Cancel the existing transfer first');
      const row = (
        await c.query(
          'INSERT INTO workspace_domain_transfers(domain_id,source_tenant_id,target_tenant_id,hostname,secret_hash,verification_token) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,expires_at',
          [
            id,
            tenant,
            target,
            domain.hostname,
            createHash('sha256').update(secret).digest('hex'),
            proof,
          ],
        )
      ).rows[0];
      await c.query(
        'UPDATE workspace_domains SET hosting_enabled=false,hosting_version=hosting_version+1 WHERE id=$1',
        [id],
      );
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,NULLIF(current_setting('app.actor_id',true),'')::uuid,'domain.transfer_started','workspace_domain_transfers',$2)",
        [tenant, row.id],
      );
      return { ...row, transferSecret: secret };
    });
  }
  async accept(tenant: string, id: string, secret: string) {
    return this.db.withTenant(tenant, async (c) => {
      await this.plans.assertFeature(c, 'white_label');
      const row = (
        await c.query(
          "SELECT * FROM workspace_domain_transfers WHERE id=$1 AND target_tenant_id=$2 AND status='pending' AND expires_at>now()",
          [id, tenant],
        )
      ).rows[0];
      if (!row || row.secret_hash !== createHash('sha256').update(secret).digest('hex'))
        throw new BadRequestException('Transfer unavailable');
      if (!(await this.hosting.proof(row.hostname, row.verification_token)))
        throw new BadRequestException('Publish the new ownership TXT before accepting');
      const result = (
        await c.query('SELECT domain_finish_transfer($1,$2) AS id', [id, row.secret_hash])
      ).rows[0];
      return { ...result, hostingEnabled: false };
    });
  }
  reclaim(tenant: string, id: string) {
    return this.db.withTenant(tenant, async (c) => {
      await this.plans.assertFeature(c, 'white_label');
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if (
        (await c.query("SELECT count(*)::int AS n FROM workspace_domains WHERE status<>'revoked'"))
          .rows[0].n >= 5
      )
        throw new BadRequestException('Domain quota reached');
      if (
        (
          await c.query(
            "SELECT 1 FROM workspace_domain_transfers WHERE domain_id=$1 AND status='pending'",
            [id],
          )
        ).rowCount
      )
        throw new BadRequestException('Cancel pending transfer before reclaim');
      const row = (
        await c.query(
          "UPDATE workspace_domains SET status='pending',verification_token=$2,verified_at=NULL,hosting_enabled=false,hosting_version=hosting_version+1,hosting_error=NULL WHERE id=$1 AND status='revoked' RETURNING id,hostname,status,verification_token",
          [id, randomBytes(24).toString('hex')],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Revoked domain not found');
      return row;
    });
  }
}
@Controller('workspace/branding/domain-transfers')
@Roles('owner')
export class DomainTransfersController {
  constructor(
    private db: DatabaseService,
    private transfers: DomainTransfers,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,domain_id,source_tenant_id,target_tenant_id,hostname,status,expires_at,created_at,verification_token FROM workspace_domain_transfers ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  @Post() start(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({ domainId: z.string().uuid(), targetTenantId: z.string().uuid() }),
      body,
    );
    return this.transfers.start(r.user.tenantId, b.domainId, b.targetTenantId);
  }
  @Post(':id/accept') accept(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ transferSecret: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }), body);
    return this.transfers.accept(r.user.tenantId, id, b.transferSecret);
  }
  @Post(':id/cancel') cancel(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (!(await c.query('SELECT domain_cancel_transfer($1) AS ok', [id])).rows[0].ok)
        throw new NotFoundException();
      return { canceled: true };
    });
  }
  @Post('reclaim/:id') reclaim(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.reclaim(r.user.tenantId, id);
  }
}
