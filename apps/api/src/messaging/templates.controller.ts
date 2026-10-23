import { supportedTemplate, TemplateComponent, variableCount } from './template-contract';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { env } from '../config/env';
import { ChannelsService } from './channels.service';
import { GRAPH, graphPost } from './adapters/adapter';
@Controller('channels/:channelId/templates')
@Roles('owner', 'admin')
export class TemplatesController {
  constructor(
    private db: DatabaseService,
    private channels: ChannelsService,
  ) {}
  private async channel(r: AuthedRequest, id: string) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (await c.query("SELECT * FROM channels WHERE id=$1 AND type='whatsapp'", [id]))
        .rows[0];
      if (!row) throw new NotFoundException('WhatsApp channel not found');
      return row;
    });
  }
  @Get() async list(@Req() r: AuthedRequest, @Param('channelId', ParseUUIDPipe) id: string) {
    await this.channel(r, id);
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT * FROM whatsapp_templates WHERE channel_id=$1 ORDER BY updated_at DESC',
            [id],
          )
        ).rows,
    );
  }
  @Post() async create(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    await this.channel(r, id);
    const b = parse(
      z.object({
        name: z.string().regex(/^[a-z0-9_]{1,512}$/),
        language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
        category: z.enum(['MARKETING', 'UTILITY']),
        body: z.string().min(1).max(1024),
        examples: z.array(z.string().min(1).max(500)).max(20).default([]),
      }),
      body,
    );
    const params = variableCount(b.body);
    if (params < 0 || params !== b.examples.length)
      throw new BadRequestException('Provide an example for every template variable');
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO whatsapp_templates(tenant_id,channel_id,name,language,category,body,examples) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [
              r.user.tenantId,
              id,
              b.name,
              b.language,
              b.category,
              b.body,
              JSON.stringify(b.examples),
            ],
          )
        ).rows[0],
    );
  }
  private requireExternal() {
    if (env.EXTERNAL_DELIVERY_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'External provider access is disabled by the environment operator',
      );
  }
  @Post('sync') async sync(@Req() r: AuthedRequest, @Param('channelId', ParseUUIDPipe) id: string) {
    const ch = await this.channel(r, id);
    this.requireExternal();
    const creds = this.channels.credentials(ch);
    if (!creds.wabaId)
      throw new BadRequestException('Reconnect this channel with its WhatsApp Business Account ID');
    let next: string | undefined = `${GRAPH}/${creds.wabaId}/message_templates?limit=100`;
    let count = 0;
    for (let page = 0; page < 20 && next; page++) {
      const response = await fetch(next, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        signal: AbortSignal.timeout(30000),
      });
      const data = (await response.json()) as {
        data?: {
          id: string;
          name: string;
          language: string;
          category: string;
          status: string;
          components: TemplateComponent[];
        }[];
        error?: { message: string };
        paging?: { cursors?: { after?: string } };
      };
      if (!response.ok)
        throw new BadRequestException(data.error?.message || 'Template sync failed');
      for (const template of data.data || []) {
        await this.db.withTenant(r.user.tenantId, (c) =>
          c.query(
            `INSERT INTO whatsapp_templates(tenant_id,channel_id,name,language,category,body,status,provider_id,supported,components) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(channel_id,name,language) DO UPDATE SET status=$7,provider_id=$8,body=$6,supported=$9,components=$10,category=$5,updated_at=now()`,
            [
              r.user.tenantId,
              id,
              template.name,
              template.language,
              template.category,
              template.components.find((x) => x.type === 'BODY')?.text || '',
              template.status,
              template.id,
              supportedTemplate(template.category, template.components),
              JSON.stringify(template.components),
            ],
          ),
        );
        count++;
      }
      next =
        data.paging?.cursors?.after && data.data?.length === 100
          ? `${GRAPH}/${creds.wabaId}/message_templates?limit=100&after=${encodeURIComponent(data.paging.cursors.after)}`
          : undefined;
    }
    return { synced: count, moreAvailable: !!next };
  }
  @Post(':id/submit') async submit(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ch = await this.channel(r, channelId);
    this.requireExternal();
    const creds = this.channels.credentials(ch);
    if (!creds.wabaId) throw new BadRequestException('WABA ID required');
    const template = await this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT * FROM whatsapp_templates WHERE id=$1 AND channel_id=$2 AND status='DRAFT'",
            [id, channelId],
          )
        ).rows[0],
    );
    if (!template) throw new NotFoundException('Draft template not found');
    const result = await graphPost(
      `${GRAPH}/${creds.wabaId}/message_templates`,
      creds.accessToken,
      {
        name: template.name,
        language: template.language,
        category: template.category,
        components: [
          {
            type: 'BODY',
            text: template.body,
            ...(template.examples.length ? { example: { body_text: [template.examples] } } : {}),
          },
        ],
      },
    );
    await this.db.withTenant(r.user.tenantId, (c) =>
      c.query(
        "UPDATE whatsapp_templates SET provider_id=$2,status='PENDING',updated_at=now() WHERE id=$1",
        [id, result.id],
      ),
    );
    return { submitted: true, status: 'PENDING' };
  }
}
