import { scoringSignalsSchema } from './sales-settings';
import {
  analyticsQuery,
  crmAnalytics,
  scoringSchema,
  defaultScoring,
  evaluateScore,
} from './crm-intelligence';
import { ConflictException, Param, ParseUUIDPipe, Body as RequestBody } from '@nestjs/common';
import { conditionsSchema, conditionWhere, pagination } from './schemas';
import { FileInterceptor } from '@nestjs/platform-express';
import { previewSpreadsheet } from '../commerce/data-sources.controller';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { CrmService } from './crm.service';

@Controller('crm/workspace')
export class CrmWorkspaceController {
  constructor(private readonly crm: CrmService) {}

  @Post('import-preview')
  @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  preview(@UploadedFile() file: Express.Multer.File, @Body('sheet') sheet?: string) {
    return previewSpreadsheet(file, sheet);
  }

  @Get('views') views(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT id,name,filters FROM crm_saved_views ORDER BY created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }

  @Post('views')
  @Roles('owner', 'admin')
  saveView(@Req() r: AuthedRequest, @RequestBody() body: unknown) {
    const b = parse(
      z.object({ name: z.string().trim().min(1).max(100), conditions: conditionsSchema }),
      body,
    );
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'INSERT INTO crm_saved_views(tenant_id,name,filters) VALUES($1,$2,$3) RETURNING *',
            [r.user.tenantId, b.name, JSON.stringify(b.conditions)],
          )
        ).rows[0],
    );
  }
  @Post('search')
  search(@Req() r: AuthedRequest, @RequestBody() body: unknown) {
    const b = parse(pagination.extend({ conditions: conditionsSchema }), body);
    const w = conditionWhere(b.conditions);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => ({
      total: (await c.query(`SELECT count(*)::int AS n FROM contacts WHERE ${w.sql}`, w.params))
        .rows[0].n,
      items: (
        await c.query(
          `SELECT id,name,email,phone,lifecycle FROM contacts WHERE ${w.sql} ORDER BY name,id LIMIT $${w.params.length + 1} OFFSET $${w.params.length + 2}`,
          [...w.params, b.limit, (b.page - 1) * b.limit],
        )
      ).rows,
    }));
  }

  @Get('members') members(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(r.user.tenantId, async (c) => ({
      currentUserId: r.user.userId,
      role: r.user.role,
      members: (
        await c.query(
          'SELECT m.user_id,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id ORDER BY u.full_name',
        )
      ).rows,
    }));
  }

  @Get('company-contacts') companyContacts(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(z.object({ company: z.string().trim().min(1).max(200) }), query);
    return this.crm.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT id,name,email,phone FROM contacts WHERE merged_into_id IS NULL AND archived_at IS NULL AND lower(attributes->>'company')=lower($1) ORDER BY name LIMIT 100",
            [q.company],
          )
        ).rows,
    );
  }

  @Get('analytics') analytics(@Req() r: AuthedRequest, @Query() query: unknown) {
    return crmAnalytics(this.crm.db, r.user, parse(analyticsQuery, query));
  }
  @Get('score/:id') async score(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const contact = await this.crm.get(r.user.tenantId, id);
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const rules = scoringSchema
        .catch(defaultScoring)
        .parse((await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmScoring);
      const open = !!(
        await c.query("SELECT 1 FROM crm_deals WHERE contact_id=$1 AND status='open' LIMIT 1", [id])
      ).rowCount;
      const signals = scoringSignalsSchema.parse(
        (await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmScoringSignals || {},
      );
      const interaction = (
        await c.query(
          `SELECT count(*)::int AS interactions,max(m.created_at) AS last_contact FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE cv.contact_id=$1 AND m.direction='in' AND NOT m.is_internal AND m.created_at>=now()-make_interval(days=>$2)`,
          [id, signals.recentDays],
        )
      ).rows[0];
      const lost = !!(
        await c.query("SELECT 1 FROM crm_deals WHERE contact_id=$1 AND status='lost' LIMIT 1", [id])
      ).rowCount;
      const base = evaluateScore(contact, open, rules);
      const extra = [
        { key: 'recent', points: interaction.last_contact ? signals.recentPoints : 0 },
        {
          key: 'interactions',
          points:
            interaction.interactions >= signals.interactionsRequired
              ? signals.interactionPoints
              : 0,
        },
        { key: 'inactive', points: !interaction.last_contact ? signals.inactivePoints : 0 },
        {
          key: 'botInterest',
          points:
            signals.interestField &&
            String(contact.attributes?.[signals.interestField] ?? '') === signals.interestValue
              ? signals.interestPoints
              : 0,
        },
        { key: 'lost', points: lost ? signals.lostPoints : 0 },
      ].filter((x) => x.points !== 0);
      const reasons = [...base.reasons, ...extra];
      const score = Math.max(
        0,
        Math.min(
          100,
          reasons.reduce((n, x) => n + x.points, 0),
        ),
      );
      return {
        ...base,
        score,
        reasons,
        band: score >= signals.hotAt ? 'hot' : score >= signals.warmAt ? 'warm' : 'cold',
        calculatedAt: new Date().toISOString(),
        lastContact: interaction.last_contact,
        interactionWindowDays: signals.recentDays,
      };
    });
  }
  @Get('scoring') scoring(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(r.user.tenantId, async (c) => ({
      rules: scoringSchema
        .catch(defaultScoring)
        .parse((await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmScoring),
    }));
  }
  @Post('scoring') @Roles('owner', 'admin') saveScoring(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const { rules, expected } = parse(
      z.object({ rules: scoringSchema, expected: scoringSchema }).strict(),
      body,
    );
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const saved = await c.query(
        "UPDATE tenants SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{crmScoring}',$1::jsonb,true) WHERE COALESCE(settings->'crmScoring',$2::jsonb)=$3::jsonb RETURNING id",
        [JSON.stringify(rules), JSON.stringify(defaultScoring), JSON.stringify(expected)],
      );
      if (!saved.rowCount)
        throw new ConflictException('Scoring rules changed. Reload before saving.');
      return { rules };
    });
  }
  @Get('report') @Roles('owner', 'admin') report(@Req() r: AuthedRequest) {
    return this.crm.db.withTenant(r.user.tenantId, async (c) => {
      const rows = async (sql: string) => (await c.query(sql)).rows;
      const contacts = await rows(
        "SELECT count(*)::int AS total,count(*) FILTER (WHERE lifecycle='customer')::int AS customers,count(*) FILTER (WHERE lifecycle='lead')::int AS leads FROM contacts WHERE merged_into_id IS NULL AND archived_at IS NULL",
      );
      const sales = await rows(
        'SELECT currency,status,count(*)::int AS count,sum(value_cents)::text AS value_cents FROM crm_deals GROUP BY currency,status ORDER BY currency,status',
      );
      const sources = await rows(
        "SELECT COALESCE(NULLIF(attributes->>'source',''),'Unknown') AS source,count(*)::int AS count FROM contacts WHERE merged_into_id IS NULL AND archived_at IS NULL GROUP BY 1 ORDER BY count DESC LIMIT 100",
      );
      const followups = await rows(
        "SELECT count(*) FILTER (WHERE status='open')::int AS open,count(*) FILTER (WHERE status='open' AND due_at<now())::int AS overdue,count(*) FILTER (WHERE status='done')::int AS done FROM crm_tasks",
      );
      const employees = await rows(
        "SELECT u.full_name,m.user_id,(SELECT count(*)::int FROM crm_tasks t WHERE t.assigned_to=m.user_id AND t.status='open' AND t.due_at<now()) AS overdue,(SELECT count(*)::int FROM crm_tasks t WHERE t.assigned_to=m.user_id AND t.status='done') AS completed,(SELECT count(*)::int FROM crm_deals d WHERE d.owner_id=m.user_id AND d.status='won') AS won FROM memberships m JOIN users u ON u.id=m.user_id ORDER BY u.full_name",
      );
      const unattended = await rows(
        "SELECT ct.id,ct.name,ct.updated_at FROM contacts ct WHERE ct.archived_at IS NULL AND ct.merged_into_id IS NULL AND ct.lifecycle IN ('lead','qualified') AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.contact_id=ct.id AND t.status='open') ORDER BY ct.updated_at LIMIT 50",
      );
      return {
        contacts: contacts[0],
        sales,
        sources,
        followups: followups[0],
        employees,
        unattended,
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
