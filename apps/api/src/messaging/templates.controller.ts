import { parseTemplateDraft } from './template-draft';
import { supportedTemplate, TemplateComponent } from './template-contract';
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Patch,
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
    const b = parseTemplateDraft(body);
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO whatsapp_templates(tenant_id,channel_id,name,language,category,body,examples,components) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [
              r.user.tenantId,
              id,
              b.name,
              b.language,
              b.category,
              b.body,
              JSON.stringify(b.examples),
              JSON.stringify(b.components),
            ],
          )
        ).rows[0],
    );
  }
  @Patch(':id') async edit(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: unknown,
  ) {
    await this.channel(r, channelId);
    const { revision, draft } = parse(
      z.object({ revision: z.number().int().positive(), draft: z.unknown() }).strict(),
      input,
    );
    const b = parseTemplateDraft(draft);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE whatsapp_templates SET name=$4,language=$5,category=$6,body=$7,examples=$8,components=$9,revision=revision+1,updated_at=now() WHERE id=$1 AND channel_id=$2 AND revision=$3 AND status='DRAFT' RETURNING *",
          [
            id,
            channelId,
            revision,
            b.name,
            b.language,
            b.category,
            b.body,
            JSON.stringify(b.examples),
            JSON.stringify(b.components),
          ],
        )
      ).rows[0];
      if (!row)
        throw new ConflictException(
          'Draft changed or is no longer editable; reload before editing',
        );
      return row;
    });
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
            `INSERT INTO whatsapp_templates(tenant_id,channel_id,name,language,category,body,status,provider_id,supported,components) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(channel_id,name,language) DO UPDATE SET status=$7,provider_id=$8,body=$6,supported=$9,components=$10,category=$5,revision=whatsapp_templates.revision+1,error=NULL,updated_at=now()`,
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
    // Durable claim prevents double submission and freezes edits across replicas.
    const template = await this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query('SELECT * FROM whatsapp_templates WHERE id=$1 AND channel_id=$2 FOR UPDATE', [
          id,
          channelId,
        ])
      ).rows[0];
      if (!row) throw new NotFoundException('Draft template not found');
      if (row.status !== 'DRAFT')
        throw new ConflictException(
          'Template already submitted or uncertain; synchronize provider evidence',
        );
      await c.query(
        "UPDATE whatsapp_templates SET status='SUBMITTING',revision=revision+1,error=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
      return row;
    });
    try {
      const result = await graphPost(
        `${GRAPH}/${creds.wabaId}/message_templates`,
        creds.accessToken,
        {
          name: template.name,
          language: template.language,
          category: template.category,
          components: template.components.length
            ? template.components
            : [
                {
                  type: 'BODY',
                  text: template.body,
                  ...(template.examples.length
                    ? { example: { body_text: [template.examples] } }
                    : {}),
                },
              ],
        },
      );
      if (typeof result.id !== 'string' || !result.id) throw new Error('Missing provider evidence');
      await this.db.withTenant(r.user.tenantId, (c) =>
        c.query(
          "UPDATE whatsapp_templates SET provider_id=$2,status='PENDING',updated_at=now() WHERE id=$1 AND status='SUBMITTING' AND revision=$3",
          [id, result.id, template.revision + 1],
        ),
      );
    } catch {
      await this.db.withTenant(r.user.tenantId, (c) =>
        c.query(
          "UPDATE whatsapp_templates SET status='SUBMISSION_UNKNOWN',error='Synchronize provider status before any further submission',updated_at=now() WHERE id=$1 AND status='SUBMITTING' AND revision=$2",
          [id, template.revision + 1],
        ),
      );
      throw new ServiceUnavailableException(
        'Submission outcome requires provider synchronization; automatic retry is disabled',
      );
    }
    return { submitted: true, status: 'PENDING' };
  }
}
