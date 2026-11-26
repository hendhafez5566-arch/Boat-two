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
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { FileInterceptor } from '@nestjs/platform-express';
import { sniffMatches } from '../inbox/files/storage';
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
  @Get('availability') async availability(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) id: string,
  ) {
    const channel = await this.channel(r, id);
    if (!this.canManageTemplates(id)) return { state: 'environment_disabled' };
    const creds = this.channels.credentials(channel);
    const ready = !!creds.wabaId && !!creds.accessToken;
    return {
      state: ready ? 'ready' : 'account_required',
      mediaUpload: ready && /^\d+$/.test(env.META_APP_ID || ''),
    };
  }
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024, files: 1 } }))
  async uploadMedia(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) id: string,
    @Query('format') requestedFormat: unknown,
    @UploadedFile() file?: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const channel = await this.channel(r, id);
    this.requireExternal(id);
    const format = parse(z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']), requestedFormat);
    const mimeTypes = {
      IMAGE: ['image/jpeg', 'image/png'],
      VIDEO: ['video/mp4'],
      DOCUMENT: ['application/pdf'],
    };
    const limit = (format === 'VIDEO' ? 16 : 5) * 1024 * 1024;
    if (
      !file ||
      !mimeTypes[format].includes(file.mimetype) ||
      file.buffer.length > limit ||
      !sniffMatches(file.mimetype, file.buffer)
    )
      throw new BadRequestException('Invalid template media file');
    const appId = env.META_APP_ID || '';
    const { wabaId, accessToken } = this.channels.credentials(channel);
    if (!/^\d+$/.test(appId) || !wabaId || !accessToken)
      throw new ServiceUnavailableException('Meta template media upload is not configured');
    const query = new URLSearchParams({
      file_name: file.originalname.replace(/[\r\n]/g, '').slice(0, 160) || 'sample',
      file_length: String(file.buffer.length),
      file_type: file.mimetype,
    });
    const providerPost = async (url: string, headers: Record<string, string>, body?: BodyInit) => {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error('Meta rejected upload');
      return response.json() as Promise<unknown>;
    };
    try {
      const session = z
        .object({
          id: z
            .string()
            .max(3000)
            .regex(/^upload:[a-zA-Z0-9_+=-]+(?:\?sig=[a-zA-Z0-9_+=%-]+)?$/),
        })
        .parse(
          await providerPost(`${GRAPH}/${appId}/uploads?${query}`, {
            Authorization: `Bearer ${accessToken}`,
          }),
        );
      return z.object({ h: z.string().min(1).max(4096) }).parse(
        await providerPost(
          `${GRAPH}/${session.id}`,
          {
            Authorization: `OAuth ${accessToken}`,
            file_offset: '0',
            'Content-Type': file.mimetype,
          },
          new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
        ),
      );
    } catch {
      throw new ServiceUnavailableException('Meta could not complete the template media upload');
    }
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
  @Post(':id/archive') async archive(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.changeDraftVisibility(r, channelId, id, body, 'DRAFT', 'ARCHIVED');
  }

  @Post(':id/restore') async restore(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.changeDraftVisibility(r, channelId, id, body, 'ARCHIVED', 'DRAFT');
  }

  private async changeDraftVisibility(
    r: AuthedRequest,
    channelId: string,
    id: string,
    body: unknown,
    from: string,
    to: string,
  ) {
    await this.channel(r, channelId);
    const { revision } = parse(z.object({ revision: z.number().int().positive() }).strict(), body);
    const result = await this.db.withTenant(r.user.tenantId, (c) =>
      c.query(
        'UPDATE whatsapp_templates SET status=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND channel_id=$2 AND revision=$3 AND status=$4 AND provider_id IS NULL RETURNING id',
        [id, channelId, revision, from, to],
      ),
    );
    if (!result.rowCount) throw new ConflictException('Draft changed or is no longer available');
    return { id, status: to };
  }
  private canManageTemplates(channelId: string) {
    return (
      env.EXTERNAL_DELIVERY_ENABLED === 'true' ||
      (process.env.BOAT_PREVIEW_ONLY === 'true' &&
        env.WHATSAPP_PREVIEW_TEMPLATE_CHANNEL_ID === channelId)
    );
  }
  private requireExternal(channelId: string) {
    if (!this.canManageTemplates(channelId))
      throw new ServiceUnavailableException(
        'External provider access is disabled by the environment operator',
      );
  }
  @Post('sync') async sync(@Req() r: AuthedRequest, @Param('channelId', ParseUUIDPipe) id: string) {
    const ch = await this.channel(r, id);
    this.requireExternal(id);
    const creds = this.channels.credentials(ch);
    if (!creds.wabaId)
      throw new BadRequestException('Reconnect this channel with its WhatsApp Business Account ID');
    let next: string | undefined = `${GRAPH}/${creds.wabaId}/message_templates?limit=100`;
    let count = 0;
    let skippedDrafts = 0;
    for (let page = 0; page < 20 && next; page++) {
      const response = await fetch(next, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      const data = (await response.json()) as {
        data?: {
          id: string;
          name: string;
          language: string;
          category: string;
          status: string;
          components: TemplateComponent[];
          rejected_reason?: unknown;
        }[];
        error?: { message: string };
        paging?: { cursors?: { after?: string } };
      };
      if (!response.ok)
        throw new BadRequestException(data.error?.message || 'Template sync failed');
      for (const template of data.data || []) {
        const body = template.components.find((component) => component.type === 'BODY') as
          (TemplateComponent & { example?: { body_text?: unknown } }) | undefined;
        const values = body?.example?.body_text;
        const examples =
          Array.isArray(values) && Array.isArray(values[0])
            ? values[0].filter((value): value is string => typeof value === 'string').slice(0, 20)
            : [];
        const reason =
          template.status === 'REJECTED' && typeof template.rejected_reason === 'string'
            ? template.rejected_reason.slice(0, 500)
            : null;
        const result = await this.db.withTenant(r.user.tenantId, (c) =>
          c.query(
            `INSERT INTO whatsapp_templates(tenant_id,channel_id,name,language,category,body,status,provider_id,supported,components,examples,error)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT(channel_id,name,language) DO UPDATE
                SET status=$7,provider_id=$8,body=$6,supported=$9,components=$10,category=$5,examples=$11,error=$12,
                    revision=whatsapp_templates.revision+1,updated_at=now()
              WHERE whatsapp_templates.status NOT IN ('DRAFT','ARCHIVED')`,
            [
              r.user.tenantId,
              id,
              template.name,
              template.language,
              template.category,
              body?.text || '',
              template.status,
              template.id,
              supportedTemplate(template.category, template.components),
              JSON.stringify(template.components),
              JSON.stringify(examples),
              reason,
            ],
          ),
        );
        if (result.rowCount) count++;
        else skippedDrafts++;
      }
      next =
        data.paging?.cursors?.after && data.data?.length === 100
          ? `${GRAPH}/${creds.wabaId}/message_templates?limit=100&after=${encodeURIComponent(data.paging.cursors.after)}`
          : undefined;
    }
    return { synced: count, skippedDrafts, moreAvailable: !!next };
  }
  @Post(':id/submit') async submit(
    @Req() r: AuthedRequest,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ch = await this.channel(r, channelId);
    this.requireExternal(channelId);
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
