import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { CrmService } from './crm.service';
import { contactSchema, filtersSchema, pagination } from './schemas';
@Controller('crm')
export class CrmController {
  constructor(private crm: CrmService) {}
  @Get('contacts') list(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(pagination.merge(filtersSchema), query);
    return this.crm.list(r.user.tenantId, q, q.page, q.limit);
  }
  @Get('contacts/export') export(@Req() r: AuthedRequest, @Query() query: unknown) {
    return this.crm.list(r.user.tenantId, parse(filtersSchema, query), 1, 10000);
  }
  @Get('contacts/duplicates') duplicates(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            `SELECT kind,value,array_agg(id ORDER BY created_at,id) AS ids,count(*)::int AS count FROM (
 SELECT id,created_at,'email' AS kind,lower(trim(email)) AS value FROM contacts WHERE email IS NOT NULL AND merged_into_id IS NULL
 UNION ALL SELECT id,created_at,'phone',normalize_contact_phone(phone) FROM contacts WHERE phone IS NOT NULL AND merged_into_id IS NULL
 ) candidates WHERE value IS NOT NULL AND value<>'' GROUP BY kind,value HAVING count(*)>1 ORDER BY count(*) DESC LIMIT 100`,
          )
        ).rows,
    );
  }
  @Post('contacts/import')
  @Roles('owner', 'admin')
  import(@Req() r: AuthedRequest, @Body() body: unknown) {
    const input = parse(z.object({ contacts: z.array(contactSchema).min(1).max(500) }), body);
    return this.crm.db.withTenant(r.user.tenantId, async () => {
      const ids = [];
      for (const row of input.contacts) ids.push((await this.crm.save(r.user.tenantId, row)).id);
      return { imported: ids.length, ids };
    });
  }
  @Post('contacts') create(@Req() r: AuthedRequest, @Body() body: unknown) {
    return this.crm.save(r.user.tenantId, parse(contactSchema, body));
  }
  @Post('contacts/bulk') @Roles('owner', 'admin') bulkContacts(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          ids: z
            .array(z.string().uuid())
            .min(1)
            .max(100)
            .refine((ids) => new Set(ids).size === ids.length),
          lifecycle: z.enum(['lead', 'qualified', 'customer', 'inactive']).optional(),
          addTags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
          ownerId: z.string().uuid().nullable().optional(),
          attributes: contactSchema.shape.attributes.optional(),
        })
        .refine(
          (input) =>
            input.lifecycle !== undefined ||
            input.ownerId !== undefined ||
            input.addTags.length > 0 ||
            (input.attributes !== undefined && Object.keys(input.attributes).length > 0),
          'Select a change',
        ),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const contacts = await c.query(
        'SELECT id,attributes FROM contacts WHERE merged_into_id IS NULL AND id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [b.ids],
      );
      if (contacts.rowCount !== b.ids.length)
        throw new NotFoundException('One or more contacts not found');
      if (
        b.ownerId &&
        !(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [b.ownerId])).rowCount
      )
        throw new BadRequestException('Owner must be a workspace member');
      if (
        (
          await c.query(
            `SELECT 1 FROM contacts WHERE id=ANY($1::uuid[])
        AND (SELECT count(DISTINCT tag) FROM unnest(tags || $2::text[]) AS tag)>30 LIMIT 1`,
            [b.ids, b.addTags],
          )
        ).rowCount
      )
        throw new BadRequestException('A contact may have at most 30 tags');
      if (b.attributes)
        for (const contact of contacts.rows)
          await this.crm.validateAttributes(r.user.tenantId, {
            ...contact.attributes,
            ...b.attributes,
          });
      await c.query(
        `UPDATE contacts SET lifecycle=COALESCE($2,lifecycle),
        tags=ARRAY(SELECT DISTINCT tag FROM unnest(tags || $3::text[]) AS tag ORDER BY tag),
        owner_id=CASE WHEN $4 THEN $5::uuid ELSE owner_id END,attributes=attributes || $6::jsonb,updated_at=now()
        WHERE id=ANY($1::uuid[])`,
        [
          b.ids,
          b.lifecycle ?? null,
          b.addTags,
          b.ownerId !== undefined,
          b.ownerId ?? null,
          JSON.stringify(b.attributes ?? {}),
        ],
      );
      return { updated: contacts.rowCount };
    });
  }
  @Get('contacts/:id') get(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.crm.get(r.user.tenantId, id);
  }
  @Patch('contacts/:id') update(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.crm.save(r.user.tenantId, parse(contactSchema, body), id);
  }
  @Patch('contacts/:id/archive') @Roles('owner', 'admin') archive(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ archived: z.boolean() }), body);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          'UPDATE contacts SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 AND merged_into_id IS NULL RETURNING *',
          [id, b.archived],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Contact not found or merged');
      return row;
    });
  }
  @Post('contacts/:id/merge') @Roles('owner', 'admin') merge(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ sourceId: z.string().uuid(), evidence: z.string().trim().min(10).max(1000) }),
      body,
    );
    if (id === b.sourceId) throw new BadRequestException('Cannot merge a contact into itself');
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      // Inbound takes channel locks first; campaign workers lock recipients before budget rows.
      await c.query('SELECT id FROM channels ORDER BY id FOR UPDATE');
      await c.query(
        'SELECT id FROM campaign_recipients WHERE canonical_contact_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[id, b.sourceId]],
      );
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const rows = (
        await c.query('SELECT * FROM contacts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
          [id, b.sourceId],
        ])
      ).rows;
      const target = rows.find((row) => row.id === id),
        source = rows.find((row) => row.id === b.sourceId);
      if (!target || !source) throw new NotFoundException('Contact not found');
      if (target.merged_into_id || source.merged_into_id || target.archived_at)
        throw new BadRequestException('Choose an active canonical target and an unmerged source');
      if (
        (
          await c.query(
            'SELECT 1 FROM contact_channels a JOIN contact_channels b ON a.channel_id=b.channel_id WHERE a.contact_id=$1 AND b.contact_id=$2 AND a.external_id<>b.external_id LIMIT 1',
            [id, b.sourceId],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'Distinct identities on the same channel require identity review before merging',
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM conversations a JOIN conversations b ON a.channel_id=b.channel_id WHERE a.contact_id=$1 AND b.contact_id=$2 AND a.status<>'closed' AND b.status<>'closed' LIMIT 1",
            [id, b.sourceId],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'Close one overlapping channel conversation in Inbox before merging',
        );
      const tags = [...new Set([...target.tags, ...source.tags])];
      if (tags.length > 30)
        throw new BadRequestException('Resolve tags to at most 30 before merging');
      await c.query(
        'UPDATE contacts SET name=COALESCE(name,$2),email=COALESCE(email,$3),phone=COALESCE(phone,$4),attributes=$5::jsonb || attributes,tags=$6,updated_at=now() WHERE id=$1',
        [id, source.name, source.email, source.phone, JSON.stringify(source.attributes), tags],
      );
      for (const table of [
        'conversations',
        'contact_channels',
        'crm_deals',
        'crm_tasks',
        'crm_notes',
        'flow_sessions',
      ])
        await c.query(`UPDATE ${table} SET contact_id=$1 WHERE contact_id=$2`, [id, b.sourceId]);
      // Opt-out always wins a conflict; retain both original evidence records/history.
      await c.query(
        `INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence)
        SELECT tenant_id,$1,channel_id,status,'Merge: '||evidence FROM contact_consents WHERE contact_id=$2
        ON CONFLICT(tenant_id,contact_id,channel_id) DO UPDATE SET
        status=CASE WHEN contact_consents.status='opted_out' OR EXCLUDED.status='opted_out' THEN 'opted_out' ELSE 'opted_in' END,
        evidence='Contact merge; original evidence retained in consent history',updated_at=now()`,
        [id, b.sourceId],
      );
      await c.query(
        'UPDATE campaign_recipients SET canonical_contact_id=$1 WHERE canonical_contact_id=$2',
        [id, b.sourceId],
      );
      await c.query(
        'UPDATE contacts SET merged_into_id=$1,archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=$2 OR merged_into_id=$2',
        [id, b.sourceId],
      );
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details) VALUES($1,$2,'merge','contacts',$3,$4)",
        [
          r.user.tenantId,
          r.user.userId,
          id,
          JSON.stringify({ sourceId: b.sourceId, evidence: b.evidence }),
        ],
      );
      return { merged: true, targetId: id, sourceId: b.sourceId };
    });
  }
  @Get('contacts/:id/timeline') timeline(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crm.timeline(r.user.tenantId, id);
  }
  @Post('contacts/:id/notes') note(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ text: z.string().trim().min(1).max(4000) }), body);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      await this.crm.get(r.user.tenantId, id);
      return (
        await c.query(
          'INSERT INTO crm_notes(tenant_id,contact_id,body,created_by) VALUES($1,$2,$3,$4) RETURNING *',
          [r.user.tenantId, id, b.text, r.user.userId],
        )
      ).rows[0];
    });
  }
  @Put('contacts/:id/consent') @Roles('owner', 'admin') consent(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        channelId: z.string().uuid(),
        status: z.enum(['opted_in', 'opted_out']),
        evidence: z.string().trim().min(5).max(1000),
      }),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      await this.crm.get(r.user.tenantId, id);
      if (!(await c.query('SELECT 1 FROM channels WHERE id=$1', [b.channelId])).rowCount)
        throw new NotFoundException('Channel not found');
      return (
        await c.query(
          'INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,contact_id,channel_id) DO UPDATE SET status=$4,evidence=$5,updated_at=now() RETURNING *',
          [r.user.tenantId, id, b.channelId, b.status, b.evidence],
        )
      ).rows[0];
    });
  }
  @Get('fields') fields(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) => (await c.query('SELECT * FROM crm_fields ORDER BY label')).rows,
    );
  }
  @Post('fields') @Roles('owner', 'admin') field(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
        label: z.string().min(1).max(100),
        type: z.enum(['text', 'number', 'date', 'boolean']),
      }),
      body,
    );
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO crm_fields(tenant_id,key,label,type) VALUES($1,$2,$3,$4) RETURNING *',
            [r.user.tenantId, b.key, b.label, b.type],
          )
        ).rows[0],
    );
  }
  @Get('segments') segments(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (await c.query('SELECT * FROM crm_segments ORDER BY created_at DESC LIMIT 100')).rows,
    );
  }
  @Post('segments') @Roles('owner', 'admin') segment(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ name: z.string().min(1).max(100), filters: filtersSchema }), body);
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO crm_segments(tenant_id,name,filters) VALUES($1,$2,$3) RETURNING *',
            [r.user.tenantId, b.name, JSON.stringify(b.filters)],
          )
        ).rows[0],
    );
  }
  @Delete('segments/:id') @Roles('owner', 'admin') deleteSegment(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      if (!(await c.query('DELETE FROM crm_segments WHERE id=$1', [id])).rowCount)
        throw new NotFoundException();
      return { removed: true };
    });
  }
  @Get('pipelines') pipelines(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) => (await c.query('SELECT * FROM crm_pipelines ORDER BY name')).rows,
    );
  }
  @Post('pipelines') @Roles('owner', 'admin') pipeline(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        name: z.string().min(1).max(100),
        stages: z
          .array(z.string().trim().min(1).max(60))
          .min(2)
          .max(20)
          .refine((x) => new Set(x).size === x.length),
      }),
      body,
    );
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO crm_pipelines(tenant_id,name,stages) VALUES($1,$2,$3) RETURNING *',
            [r.user.tenantId, b.name, JSON.stringify(b.stages)],
          )
        ).rows[0],
    );
  }
  @Patch('pipelines/:id') @Roles('owner', 'admin') updatePipeline(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        stages: z
          .array(z.string().trim().min(1).max(60))
          .min(2)
          .max(20)
          .refine((stages) => new Set(stages).size === stages.length),
        replacements: z.record(z.string().max(60), z.string().max(60)).default({}),
      }),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const pipeline = (await c.query('SELECT * FROM crm_pipelines WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!pipeline) throw new NotFoundException('Pipeline not found');
      const removed = (pipeline.stages as string[]).filter((stage) => !b.stages.includes(stage));
      for (const stage of removed) {
        const target = b.replacements[stage];
        const used = (
          await c.query('SELECT 1 FROM crm_deals WHERE pipeline_id=$1 AND stage=$2 LIMIT 1', [
            id,
            stage,
          ])
        ).rowCount;
        if (used && (!target || !b.stages.includes(target)))
          throw new BadRequestException(
            'Choose a replacement for every removed stage containing deals',
          );
        if (target && !b.stages.includes(target))
          throw new BadRequestException('Invalid replacement stage');
        if (target)
          await c.query(
            'UPDATE crm_deals SET stage=$3,updated_at=now() WHERE pipeline_id=$1 AND stage=$2',
            [id, stage, target],
          );
      }
      return (
        await c.query('UPDATE crm_pipelines SET name=$2,stages=$3 WHERE id=$1 RETURNING *', [
          id,
          b.name,
          JSON.stringify(b.stages),
        ])
      ).rows[0];
    });
  }
  @Delete('pipelines/:id') @Roles('owner', 'admin') deletePipeline(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      if (!(await c.query('SELECT 1 FROM crm_pipelines WHERE id=$1 FOR UPDATE', [id])).rowCount)
        throw new NotFoundException('Pipeline not found');
      if ((await c.query('SELECT 1 FROM crm_deals WHERE pipeline_id=$1 LIMIT 1', [id])).rowCount)
        throw new BadRequestException(
          'Move or retain existing deals before removing this pipeline',
        );
      await c.query('DELETE FROM crm_pipelines WHERE id=$1', [id]);
      return { removed: true };
    });
  }
  @Get('deals') deals(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(pagination, query);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => ({
      items: (
        await c.query(
          'SELECT d.*,ct.name AS contact_name,p.name AS pipeline_name FROM crm_deals d JOIN contacts ct ON ct.id=d.contact_id JOIN crm_pipelines p ON p.id=d.pipeline_id ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
          [q.limit, (q.page - 1) * q.limit],
        )
      ).rows,
      total: (await c.query('SELECT count(*)::int AS n FROM crm_deals')).rows[0].n,
    }));
  }
  @Post('deals') deal(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        contactId: z.string().uuid(),
        pipelineId: z.string().uuid(),
        title: z.string().min(1).max(200),
        stage: z.string().min(1).max(60),
        valueCents: z.number().int().min(0).max(100000000000),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .default('USD'),
      }),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      await this.crm.get(r.user.tenantId, b.contactId);
      const pipeline = (
        await c.query('SELECT stages FROM crm_pipelines WHERE id=$1 FOR SHARE', [b.pipelineId])
      ).rows[0];
      if (!pipeline?.stages.includes(b.stage))
        throw new BadRequestException('Invalid pipeline or stage');
      return (
        await c.query(
          'INSERT INTO crm_deals(tenant_id,contact_id,pipeline_id,title,stage,value_cents,currency) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [r.user.tenantId, b.contactId, b.pipelineId, b.title, b.stage, b.valueCents, b.currency],
        )
      ).rows[0];
    });
  }
  @Patch('deals/:id') updateDeal(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ stage: z.string().max(60), status: z.enum(['open', 'won', 'lost']) }),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          'SELECT p.stages FROM crm_deals d JOIN crm_pipelines p ON p.id=d.pipeline_id WHERE d.id=$1 FOR SHARE OF p',
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      if (!row.stages.includes(b.stage)) throw new BadRequestException('Invalid stage');
      return (
        await c.query(
          'UPDATE crm_deals SET stage=$2,status=$3,updated_at=now() WHERE id=$1 RETURNING *',
          [id, b.stage, b.status],
        )
      ).rows[0];
    });
  }
  @Get('tasks') tasks(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(pagination, query);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => ({
      items: (
        await c.query(
          'SELECT t.*,ct.name AS contact_name FROM crm_tasks t JOIN contacts ct ON ct.id=t.contact_id ORDER BY status,due_at LIMIT $1 OFFSET $2',
          [q.limit, (q.page - 1) * q.limit],
        )
      ).rows,
      total: (await c.query('SELECT count(*)::int AS n FROM crm_tasks')).rows[0].n,
    }));
  }
  @Post('tasks') task(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        contactId: z.string().uuid(),
        title: z.string().min(1).max(200),
        dueAt: z.string().datetime(),
        assignedTo: z.string().uuid().nullable().optional(),
      }),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      await this.crm.get(r.user.tenantId, b.contactId);
      if (
        b.assignedTo &&
        !(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [b.assignedTo])).rowCount
      )
        throw new BadRequestException('Invalid assignee');
      return (
        await c.query(
          'INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at,assigned_to) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [r.user.tenantId, b.contactId, b.title, b.dueAt, b.assignedTo ?? null],
        )
      ).rows[0];
    });
  }
  @Patch('tasks/:id') taskStatus(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ status: z.enum(['open', 'done']) }), body);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query('UPDATE crm_tasks SET status=$2 WHERE id=$1 RETURNING *', [id, b.status])
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
}
