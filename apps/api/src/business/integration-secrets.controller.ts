import {
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
            'SELECT id,name,allowed_hosts,version,enabled,updated_at FROM integration_secrets ORDER BY name',
          )
        ).rows,
    );
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        value: z.string().min(1).max(4000),
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
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO integration_secrets(tenant_id,name,value_enc,allowed_hosts) VALUES($1,$2,$3,$4) RETURNING id,name,allowed_hosts,version,enabled',
            [r.user.tenantId, b.name, this.crypto.encrypt({ value: b.value }), b.allowedHosts],
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
        .object({ value: z.string().min(1).max(4000).optional(), enabled: z.boolean().optional() })
        .refine((b) => b.value !== undefined || b.enabled !== undefined),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
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
