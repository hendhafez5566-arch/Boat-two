import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { resolveTxt } from 'node:dns/promises';
import { z } from 'zod';
import { Public, Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { PlansService } from '../plans/plans.service';
export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
@Injectable()
export class DomainHosting {
  constructor(
    private db: DatabaseService,
    private events: EventsService,
  ) {}
  async proof(host: string, token: string) {
    try {
      const records = await Promise.race([
        resolveTxt('_boat-verification.' + host),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error('DNS timeout')), 5000);
          timer.unref();
        }),
      ]);
      return records.some((record) => record.join('') === 'boat-verification=' + token);
    } catch {
      return false;
    }
  }
  async schedule(tenant: string, id: string, version: number) {
    await this.events.publish(
      tenant,
      'domain.ownership_recheck',
      id,
      { id, version },
      undefined,
      new Date(Date.now() + 12 * 3600000).toISOString(),
    );
  }
  @OnEvent('domain.ownership_recheck', { suppressErrors: false }) async recheck(event: {
    tenantId: string;
    id: string;
    version: number;
  }) {
    await this.db.withTenant(event.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM workspace_domains WHERE id=$1 AND hosting_enabled AND status<>'revoked' AND hosting_version=$2 FOR UPDATE",
          [event.id, event.version],
        )
      ).rows[0];
      if (!row) return;
      if (env.CUSTOM_DOMAINS_ENABLED === 'true' && env.EXTERNAL_DELIVERY_ENABLED === 'true') {
        const valid = await this.proof(row.hostname, row.verification_token);
        await c.query(
          "UPDATE workspace_domains SET verified_at=CASE WHEN $2 THEN now() ELSE NULL END,hosting_error=CASE WHEN $2 THEN NULL ELSE 'Ownership TXT could not be revalidated' END WHERE id=$1",
          [row.id, valid],
        );
      }
      await this.schedule(event.tenantId, row.id, event.version);
    });
  }
  async resolve(host: string) {
    if (env.CUSTOM_DOMAINS_ENABLED !== 'true')
      throw new NotFoundException('Custom hosting is disabled');
    const brand = (
      await this.db.query('SELECT public_domain_brand($1,$2) AS data', [
        host,
        env.BILLING_PAST_DUE_GRACE_DAYS,
      ])
    ).rows[0].data;
    if (!brand) throw new NotFoundException('Domain is not eligible for hosting');
    const tenant = (
      await this.db.query('SELECT auth_domain_tenant($1,$2) AS id', [
        host,
        env.BILLING_PAST_DUE_GRACE_DAYS,
      ])
    ).rows[0].id;
    return { ...brand, tenantId: tenant };
  }
}
@Controller('workspace/branding/domains')
@Roles('owner', 'admin')
export class DomainHostingController {
  constructor(
    private db: DatabaseService,
    private hosting: DomainHosting,
    private plans: PlansService,
  ) {}
  @Patch(':id/hosting') set(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ enabled: z.boolean() }), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM workspace_domains WHERE id=$1 AND status<>'revoked' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      if (b.enabled) {
        if (
          (
            await c.query(
              "SELECT 1 FROM workspace_domain_transfers WHERE domain_id=$1 AND status='pending'",
              [id],
            )
          ).rowCount
        )
          throw new BadRequestException('Cancel pending transfer before enabling hosting');
        await this.plans.assertFeature(c, 'white_label');
        if (
          row.status !== 'verified' ||
          !row.verified_at ||
          Date.now() - new Date(row.verified_at).getTime() > 86400000
        )
          throw new BadRequestException('Verify ownership before enabling hosting');
      }
      const updated = (
        await c.query(
          'UPDATE workspace_domains SET hosting_enabled=$2,hosting_version=hosting_version+1,hosting_error=NULL WHERE id=$1 RETURNING id,hosting_enabled,hosting_version',
          [id, b.enabled],
        )
      ).rows[0];
      if (b.enabled) await this.hosting.schedule(r.user.tenantId, id, updated.hosting_version);
      return {
        ...updated,
        operatorEnabled: env.CUSTOM_DOMAINS_ENABLED === 'true',
        certificateStatus: 'managed_by_external_ingress',
      };
    });
  }
}
@Public()
@Controller('domains')
export class PublicDomainController {
  constructor(private hosting: DomainHosting) {}
  @Header('Cache-Control', 'no-store')
  @Get('resolve')
  resolve(@Query() query: unknown) {
    return this.hosting.resolve(parse(z.object({ hostname: hostnameSchema }), query).hostname);
  }
  @Header('Cache-Control', 'no-store')
  @Get('tls-allow')
  async allow(@Query() query: unknown) {
    await this.hosting.resolve(parse(z.object({ domain: hostnameSchema }), query).domain);
    return { allowed: true };
  }
}
