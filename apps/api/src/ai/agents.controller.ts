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
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { CryptoService } from '../messaging/crypto.service';
const agentSchema = z.object({
  allowedTools: z
    .array(z.enum(['handoff_to_human', 'create_followup', 'tag_contact']))
    .max(3)
    .default(['handoff_to_human']),
  name: z.string().min(1).max(100),
  instructions: z.string().max(4000).default(''),
  providerId: z.string().uuid().nullable().optional(),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
  enabled: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});
@Controller('agents')
@Roles('owner', 'admin')
export class AgentsController {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private crypto: CryptoService,
  ) {}
  @Get() list(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => ({
      agents: (await c.query('SELECT * FROM ai_agents ORDER BY name')).rows,
      providers: (
        await c.query('SELECT id,name,kind,model,enabled FROM ai_providers ORDER BY name')
      ).rows,
      runs: (
        await c.query(
          'SELECT id,agent_id,input_tokens,output_tokens,cost_microusd,model,status,error,created_at FROM ai_runs ORDER BY created_at DESC LIMIT 100',
        )
      ).rows,
    }));
  }
  @Post('providers') provider(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().min(1).max(100),
        kind: z.literal('anthropic'),
        model: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
        apiKey: z.string().min(10).max(4000),
        enabled: z.boolean().default(false),
        inputUsdPerMillion: z.number().finite().min(0).max(10000).nullable().optional(),
        outputUsdPerMillion: z.number().finite().min(0).max(10000).nullable().optional(),
      }),
      body,
    );
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO ai_providers(tenant_id,name,kind,model,credentials_enc,enabled,input_microusd_per_million,output_microusd_per_million) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,kind,model,enabled',
            [
              r.user.tenantId,
              b.name,
              b.kind,
              b.model,
              this.crypto.encrypt({ apiKey: b.apiKey }),
              b.enabled,
              b.inputUsdPerMillion == null ? null : Math.round(b.inputUsdPerMillion * 1000000),
              b.outputUsdPerMillion == null ? null : Math.round(b.outputUsdPerMillion * 1000000),
            ],
          )
        ).rows[0],
    );
  }
  @Patch('providers/:id') providerStatus(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ enabled: z.boolean() }), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query('UPDATE ai_providers SET enabled=$2 WHERE id=$1 RETURNING id,name,enabled', [
          id,
          b.enabled,
        ])
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  @Post() create(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.save(r, parse(agentSchema, body));
  }
  @Patch(':id') update(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.save(r, parse(agentSchema, body), id);
  }
  private save(r: AuthedRequest, b: z.infer<typeof agentSchema>, id?: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      if (!id)
        await this.plans.assertWithinLimit(
          c,
          'ai_agents',
          (await c.query('SELECT count(*)::int AS n FROM ai_agents')).rows[0].n,
        );
      if (
        b.providerId &&
        !(await c.query('SELECT 1 FROM ai_providers WHERE id=$1', [b.providerId])).rowCount
      )
        throw new NotFoundException('Provider not found');
      if (
        b.sourceIds.length !==
        (await c.query('SELECT id FROM knowledge_sources WHERE id=ANY($1::uuid[])', [b.sourceIds]))
          .rowCount
      )
        throw new BadRequestException('Unknown or duplicate knowledge source');
      if (b.isDefault) await c.query('UPDATE ai_agents SET is_default=false WHERE is_default');
      const row = (
        await c.query(
          id
            ? 'UPDATE ai_agents SET name=$2,instructions=$3,provider_id=$4,source_ids=$5,enabled=$6,is_default=$7,allowed_tools=$8 WHERE id=$1 RETURNING *'
            : 'INSERT INTO ai_agents(tenant_id,name,instructions,provider_id,source_ids,enabled,is_default,allowed_tools) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          [
            id ?? r.user.tenantId,
            b.name,
            b.instructions,
            b.providerId ?? null,
            b.sourceIds,
            b.enabled,
            b.isDefault,
            b.allowedTools,
          ],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Agent not found');
      return row;
    });
  }
}
