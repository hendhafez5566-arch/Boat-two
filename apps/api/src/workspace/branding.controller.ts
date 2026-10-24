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
  Req,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
@Controller('workspace/branding')
export class BrandingController {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
  ) {}
  @Get() get(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const plan = await this.plans.getTenantPlan(c);
      return {
        enabled: !!plan.features.white_label,
        branding: plan.features.white_label
          ? ((
              await c.query(
                'SELECT name,logo_url,primary_color,widget_title FROM workspace_branding',
              )
            ).rows[0] ?? null)
          : null,
      };
    });
  }
  @Patch() @Roles('owner', 'admin') save(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        logoUrl: z
          .string()
          .url()
          .max(2000)
          .refine((value) => {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password;
          })
          .nullable(),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        widgetTitle: z.string().trim().min(1).max(100),
      }),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await this.plans.assertFeature(c, 'white_label');
      return (
        await c.query(
          'INSERT INTO workspace_branding(tenant_id,name,logo_url,primary_color,widget_title) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET name=$2,logo_url=$3,primary_color=$4,widget_title=$5,updated_at=now() RETURNING name,logo_url,primary_color,widget_title',
          [r.user.tenantId, b.name, b.logoUrl, b.primaryColor, b.widgetTitle],
        )
      ).rows[0];
    });
  }
  @Get('domains') @Roles('owner', 'admin') domains(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => ({
      domains: (
        await c.query(
          'SELECT id,hostname,verification_token,status,verified_at,hosting_enabled,hosting_error FROM workspace_domains ORDER BY created_at DESC LIMIT 20',
        )
      ).rows,
      trafficRouting:
        env.CUSTOM_DOMAINS_ENABLED === 'true'
          ? 'operator_ingress_enabled'
          : 'requires_operator_tls_and_ingress_configuration',
    }));
  }
  @Post('domains') @Roles('owner', 'admin') create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        hostname: z
          .string()
          .trim()
          .toLowerCase()
          .max(253)
          .regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
      }),
      body,
    );
    if (
      b.hostname === new URL(env.APP_URL).hostname ||
      b.hostname.endsWith('.localhost') ||
      b.hostname.endsWith('.local')
    )
      throw new BadRequestException('Reserved hostname');
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      await this.plans.assertFeature(c, 'white_label');
      if (
        (await c.query("SELECT count(*)::int AS n FROM workspace_domains WHERE status<>'revoked'"))
          .rows[0].n >= 5
      )
        throw new BadRequestException('At most five domains per workspace');
      if (
        (await c.query('SELECT 1 FROM workspace_domains WHERE hostname=$1', [b.hostname])).rowCount
      )
        throw new BadRequestException('Hostname already registered');
      try {
        return (
          await c.query(
            'INSERT INTO workspace_domains(tenant_id,hostname,verification_token) VALUES($1,$2,$3) RETURNING id,hostname,verification_token,status',
            [r.user.tenantId, b.hostname, randomBytes(24).toString('hex')],
          )
        ).rows[0];
      } catch {
        throw new BadRequestException('Hostname cannot be registered');
      }
    });
  }
  @Post('domains/:id/verify') @Roles('owner', 'admin') async verify(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const domain = await this.db.withTenant(r.user.tenantId, async (c) => {
      await this.plans.assertFeature(c, 'white_label');
      return (
        await c.query("SELECT * FROM workspace_domains WHERE id=$1 AND status<>'revoked'", [id])
      ).rows[0];
    });
    if (!domain) throw new NotFoundException();
    let records: string[][];
    try {
      records = await Promise.race([
        resolveTxt('_boat-verification.' + domain.hostname),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error('DNS timeout')), 5000);
          timer.unref();
        }),
      ]);
    } catch {
      throw new BadRequestException('TXT record not available yet; check DNS and retry');
    }
    if (
      !records.some(
        (record) => record.join('') === 'boat-verification=' + domain.verification_token,
      )
    )
      throw new BadRequestException('Ownership TXT value does not match');
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await this.plans.assertFeature(c, 'white_label');
      const row = (
        await c.query(
          "UPDATE workspace_domains SET status='verified',verified_at=now(),hosting_error=NULL WHERE id=$1 AND status<>'revoked' RETURNING id,status,verified_at",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return { ...row, trafficRouting: 'requires_operator_tls_and_ingress_configuration' };
    });
  }
  @Patch('domains/:id/revoke') @Roles('owner', 'admin') revoke(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (
        !(
          await c.query(
            "UPDATE workspace_domains SET status='revoked',hosting_enabled=false,hosting_version=hosting_version+1 WHERE id=$1 AND status<>'revoked'",
            [id],
          )
        ).rowCount
      )
        throw new NotFoundException();
      const pending = await c.query(
        "SELECT id FROM workspace_domain_transfers WHERE domain_id=$1 AND source_tenant_id=$2 AND status='pending'",
        [id, r.user.tenantId],
      );
      for (const transfer of pending.rows)
        await c.query('SELECT domain_cancel_transfer($1)', [transfer.id]);
      return { revoked: true };
    });
  }
}
