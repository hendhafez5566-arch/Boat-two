import {
  Body,
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../messaging/crypto.service';
@Controller('integrations/secrets')
@Roles('owner', 'admin')
export class IntegrationSecretsController {
  constructor(
    private db: DatabaseService,
    private crypto: CryptoService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,name,allowed_hosts,version,enabled,updated_at,auth_type,header_name FROM integration_secrets ORDER BY name',
          )
        ).rows,
    );
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        value: z
          .string()
          .min(1)
          .max(4000)
          .regex(/^[^\r\n]+$/),
        authType: z.enum(['bearer', 'basic', 'header', 'hmac_sha256']).default('bearer'),
        headerName: z.enum(['X-API-Key', 'X-Auth-Token', 'Api-Key']).optional(),
        allowedHosts: z
          .array(
            z
              .string()
              .toLowerCase()
              .regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/),
          )
          .min(1)
          .max(10),
      }),
      body,
    );
    if (b.authType === 'basic' && !b.value.includes(':'))
      throw new BadRequestException('Use username:password for Basic authentication');
    if (b.authType === 'header' && !b.headerName)
      throw new BadRequestException('Choose an approved secret header');
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO integration_secrets(tenant_id,name,value_enc,allowed_hosts,auth_type,header_name) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,allowed_hosts,version,enabled,auth_type,header_name',
            [
              r.user.tenantId,
              b.name,
              this.crypto.encrypt({ value: b.value }),
              b.allowedHosts,
              b.authType,
              b.authType === 'header' ? b.headerName : null,
            ],
          )
        ).rows[0],
    );
  }
  @Patch(':id') update(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          value: z
            .string()
            .min(1)
            .max(4000)
            .regex(/^[^\r\n]+$/)
            .optional(),
          enabled: z.boolean().optional(),
        })
        .refine((b) => b.value !== undefined || b.enabled !== undefined),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const old = (
        await c.query('SELECT auth_type FROM integration_secrets WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!old) throw new NotFoundException();
      if (b.value && old.auth_type === 'basic' && !b.value.includes(':'))
        throw new BadRequestException('Use username:password for Basic authentication');
      const row = (
        await c.query(
          'UPDATE integration_secrets SET value_enc=COALESCE($2,value_enc),version=version+CASE WHEN $2::text IS NULL THEN 0 ELSE 1 END,enabled=COALESCE($3,enabled),updated_at=now() WHERE id=$1 RETURNING id,name,version,enabled',
          [id, b.value ? this.crypto.encrypt({ value: b.value }) : null, b.enabled ?? null],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
}
