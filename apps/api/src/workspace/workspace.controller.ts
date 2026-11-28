import { subscriptionUsage, subscriptionHistory } from './subscription-usage';
import { dashboardChannelSchema, dashboardSummary } from './dashboard-summary';
import { InvitationMail } from '../mail/invitation-mail';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { PREVIEW_FLOW_LIMIT, PREVIEW_FLOW_DAYS, previewOnly, previewFlowAllowance } from '../plans/preview-flow-allowance';
import {env} from '../config/env';
import {connectionHealth} from '../messaging/connection-health';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'agent']),
  sendEmail: z.boolean().default(false),
  language: z.enum(['ar', 'en']).default('ar'),
});
const roleSchema = z.object({ role: z.enum(['admin', 'agent']) });

@Controller()
export class WorkspaceController {
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
    private readonly mail: InvitationMail,
  ) {}

  @Get('workspace')
  workspace(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const tenant = (
        await c.query(
          'SELECT id, name, slug, settings, preferred_plan, onboarding_completed_at, created_at FROM tenants',
        )
      ).rows[0];
      const plan = await this.plans.getTenantPlan(c);
      const agents = (await c.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n;
      const counts = (
        await c.query(`SELECT
        (SELECT count(*)::int FROM channels) AS channels,
        (SELECT count(*)::int FROM contacts) AS contacts,
        (SELECT count(*)::int FROM flows) AS flows,
        (SELECT count(*)::int FROM messages WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND direction='out' AND NOT is_internal) AS messages_per_month`)
      ).rows[0];
      const ai=(await c.query('SELECT enabled FROM ai_settings')).rows[0];
      const aiEnabled=!!ai?.enabled&&env.AI_PROVIDER_CALLS_ENABLED==='true';
      const tokens=aiEnabled?(await c.query("SELECT COALESCE(sum(input_tokens+output_tokens),0)::text AS n FROM ai_usage WHERE period=date_trunc('month',now())::date")).rows[0].n:undefined;
      const claimed = Boolean(
        tenant?.settings &&
        Object.prototype.hasOwnProperty.call(tenant.settings, 'previewFlowAllowance'),
      );
      return {
        tenant,
        role: req.user.role,
        plan,
        aiEnabled,
        previewFlowQuotaAvailable:
          previewOnly() && req.user.role === 'owner' &&
          !claimed && plan.limits.flows !== -1 && (plan.limits.flows ?? 0) < PREVIEW_FLOW_LIMIT,
        previewFlowQuotaExpiresAt: previewOnly()
          ? previewFlowAllowance(tenant?.settings)?.expiresAt ?? null
          : null,
        usage: { agents, ...counts, ...(aiEnabled ? { ai_tokens: tokens } : {}) },
      };
    });
  }

  /** Explicit, one-time trial grant. Only the owner of a Preview workspace can opt in. */
  @Roles('owner')
  @Post('workspace/preview-flow-quota')
  enablePreviewFlowQuota(@Req() req: AuthedRequest) {
    if (!previewOnly()) throw new NotFoundException('Not available');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const tenant = (await c.query('SELECT id, settings FROM tenants FOR UPDATE')).rows[0];
      if (!tenant) throw new NotFoundException('Workspace not found');
      if (
        tenant.settings &&
        Object.prototype.hasOwnProperty.call(tenant.settings, 'previewFlowAllowance')
      ) throw new ConflictException('Preview flow allowance was already claimed');
      const plan = await this.plans.getTenantPlan(c);
      if (plan.limits.flows === -1 || (plan.limits.flows ?? 0) >= PREVIEW_FLOW_LIMIT)
        throw new BadRequestException('Current flow limit is already sufficient');

      const grant = {
        limit: PREVIEW_FLOW_LIMIT,
        expiresAt: new Date(Date.now() + PREVIEW_FLOW_DAYS * 86400000).toISOString(),
      };
      await c.query(
        `UPDATE tenants
           SET settings=jsonb_set(COALESCE(settings, '{}'::jsonb),
                                  '{previewFlowAllowance}', $1::jsonb, true)
         WHERE id=$2`,
        [JSON.stringify(grant), tenant.id],
      );
      return { limit: grant.limit, expiresAt: grant.expiresAt, previewOnly: true };
    });
  }

  @Get('workspace/subscription-usage')
  usage(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const usage = await subscriptionUsage(c, await this.plans.getTenantPlan(c));
      if (['owner', 'admin'].includes(req.user.role)) {
        const result = await c.query('SELECT count(*)::int AS count FROM held_inbound_messages');
        return { ...usage, heldInbound: result.rows[0].count };
      }
      return usage;
    },
    );
  }

  @Get('workspace/subscription-history')
  usageHistory(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, subscriptionHistory);
  }

  @Get('workspace/dashboard')
  dashboard(@Req() req: AuthedRequest, @Query('channel') channel?: string) {
    const selected = parse(dashboardChannelSchema, channel);
    return this.db.withTenant(req.user.tenantId, (c) => dashboardSummary(
      c, selected, req.user.userId, env.AI_PROVIDER_CALLS_ENABLED === 'true',
    ));
  }

  @Get('workspace/overview')
  overview(@Req() req:AuthedRequest){return this.db.withTenant(req.user.tenantId,async c=>{
    const channels=(await c.query('SELECT id,type,name,status,settings FROM channels ORDER BY created_at')).rows.map(row=>({...row,health:connectionHealth(row)}));
    const growth=(await c.query("SELECT day::date::text AS day,(SELECT count(*)::int FROM contacts WHERE created_at>=day AND created_at<day+interval '1 day') AS contacts,(SELECT count(*)::int FROM messages WHERE created_at>=day AND created_at<day+interval '1 day' AND direction='out' AND NOT is_internal) AS messages FROM generate_series((now() AT TIME ZONE 'UTC')::date-13,(now() AT TIME ZONE 'UTC')::date,interval '1 day') day")).rows;
    const delivery=(await c.query("SELECT status,count(*)::int AS count FROM messages WHERE direction='out' AND NOT is_internal AND created_at>=now()-interval '30 days' GROUP BY status")).rows;
    const drafts=(await c.query("SELECT id,name,status FROM flows ORDER BY updated_at DESC LIMIT 5")).rows;
    return{channels,growth,delivery,drafts,timezone:'UTC'};
  });}

  @Roles('owner', 'admin')
  @Patch('workspace')
  updateWorkspace(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        industry: z.string().max(100).default(''),
        timezone: z
          .string()
          .max(60)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }, 'Invalid timezone'),
        language: z.enum(['ar', 'en']),
        preferredPlan: z.enum(['free', 'starter', 'pro', 'business']).optional(),
      }),
      body,
    );
    return this.db.withTenant(
      req.user.tenantId,
      async (c) =>
        (
          await c.query(
            `UPDATE tenants SET name=$1, settings=settings || $2::jsonb, preferred_plan=COALESCE($3,preferred_plan) RETURNING id, name, settings, preferred_plan, onboarding_completed_at`,
            [
              input.name,
              JSON.stringify({
                industry: input.industry,
                timezone: input.timezone,
                language: input.language,
              }),
              input.preferredPlan??null,
            ],
          )
        ).rows[0],
    );
  }

  @Get('workspace/onboarding/message-check')
  firstIncomingMessage(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => (
      await c.query(
        'SELECT EXISTS (SELECT 1 FROM conversations WHERE last_inbound_at IS NOT NULL) AS received',
      )
    ).rows[0]);
  }

  @Roles('owner', 'admin')
  @Post('workspace/onboarding/complete')
  completeOnboarding(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const channels = await c.query("SELECT 1 FROM channels WHERE status='active' LIMIT 1");
      if (!channels.rowCount) throw new BadRequestException('Connect at least one channel first');
      return (
        await c.query(
          'UPDATE tenants SET onboarding_completed_at=COALESCE(onboarding_completed_at, now()) RETURNING onboarding_completed_at',
        )
      ).rows[0];
    });
  }

  @Roles('owner', 'admin')
  @Get('workspace/audit')
  audit(@Req() req: AuthedRequest, @Query() query: unknown) {
    const q=parse(z.object({page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(100).default(25),q:z.string().trim().max(200).default('')}),query);
    return this.db.withTenant(req.user.tenantId,async c=>{
      const params:unknown[]=[];
      if(q.q)params.push('%'+q.q.replace(/[\\%_]/g,v=>'\\'+v)+'%');
      const from=' FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id'+(q.q?" WHERE (a.action ILIKE $1 OR a.resource_type ILIKE $1 OR a.resource_id::text ILIKE $1 OR COALESCE(u.full_name,'') ILIKE $1)":'');
      const items=(await c.query('SELECT a.id,a.action,a.resource_type,a.resource_id,a.created_at,u.full_name AS actor_name'+from+' ORDER BY a.created_at DESC,a.id DESC LIMIT $'+(params.length+1)+' OFFSET $'+(params.length+2),[...params,q.limit,(q.page-1)*q.limit])).rows;
      const total=Number((await c.query('SELECT count(*)::int AS n'+from,params)).rows[0].n);
      return {items,total,page:q.page,limit:q.limit};
    });
  }

  @Roles('owner', 'admin')
  @Delete('team/invitations/:id')
  revokeInvite(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query('DELETE FROM invitations WHERE id=$1 AND accepted_at IS NULL', [id]);
      if (!r.rowCount) throw new NotFoundException('Invitation not found');
      return { removed: true };
    });
  }

  @Get('team')
  team(@Req() req: AuthedRequest) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const members = await c.query(
        `SELECT m.user_id, m.role, m.available, m.created_at, u.email, u.full_name
         FROM memberships m JOIN users u ON u.id = m.user_id ORDER BY m.created_at`,
      );
      // Agents need the assignee roster in Inbox and CRM, but not pending invites.
      const pendingInvitations = ['owner', 'admin'].includes(req.user.role)
        ? (await c.query(
            `SELECT id, email, role, expires_at FROM invitations
             WHERE accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
          )).rows
        : [];
      return { members: members.rows, pendingInvitations };
    });
  }

  @Get('team/index')
  teamIndex(@Req() req: AuthedRequest, @Query() query: unknown) {
    const q = parse(z.object({
      tab: z.enum(['members', 'invites']).default('members'),
      q: z.string().trim().max(200).default(''),
      role: z.enum(['all', 'owner', 'admin', 'agent']).default('all'),
      availability: z.enum(['all', 'available', 'away']).default('all'),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }), query);
    const manager = ['owner', 'admin'].includes(req.user.role);
    if (q.tab === 'invites' && !manager) throw new ForbiddenException('Invitation management requires administrator access');
    return this.db.withTenant(req.user.tenantId, async c => {
      const memberCounts = (await c.query('SELECT count(*)::int AS members, count(*) FILTER (WHERE available)::int AS available FROM memberships')).rows[0];
      const pending = manager ? Number((await c.query('SELECT count(*)::int AS n FROM invitations WHERE accepted_at IS NULL AND expires_at > now()')).rows[0].n) : null;
      const params: unknown[] = [];
      const clauses: string[] = [];
      const arg = (value: unknown) => { params.push(value); return '
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(inviteSchema, body);
    if (input.role === 'admin' && req.user.role !== 'owner')
      throw new ForbiddenException('Only the owner can invite admins');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const members = (await c.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n;
      const pending = (
        await c.query(
          'SELECT count(*)::int AS n FROM invitations WHERE accepted_at IS NULL AND expires_at > now()',
        )
      ).rows[0].n;
      await this.plans.assertWithinLimit(c, 'agents', members + pending);

      const token = randomBytes(32).toString('hex');
      const inserted = await c.query(
        `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`,
        [
          req.user.tenantId,
          input.email.toLowerCase(),
          input.role,
          createHash('sha256').update(token).digest('hex'),
          req.user.userId,
        ],
      );
      const brand = await this.mail.appearance(req.user.tenantId);
      const mailJob = input.sendEmail
        ? await this.mail.enqueue(
            req.user.tenantId,
            inserted.rows[0].id,
            input.email,
            token,
            input.language,
          )
        : null;
      return { inviteUrl: `${brand.origin}/accept-invitation?token=${token}`, mailJob };
    });
  }

  @Roles('owner')
  @Patch('team/members/:userId')
  changeRole(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const { role } = parse(roleSchema, body);
    if (userId === req.user.userId) throw new BadRequestException('Cannot change your own role');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        "UPDATE memberships SET role = $1 WHERE user_id = $2 AND role <> 'owner' RETURNING user_id, role",
        [role, userId],
      );
      if (!r.rows[0]) throw new NotFoundException('Member not found or is the owner');
      return r.rows[0];
    });
  }

  @Roles('owner', 'admin')
  @Delete('team/members/:userId')
  removeMember(@Req() req: AuthedRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const target = (await c.query('SELECT role FROM memberships WHERE user_id = $1', [userId]))
        .rows[0];
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === 'owner') throw new ForbiddenException('Cannot remove the owner');
      if (target.role === 'admin' && req.user.role !== 'owner') {
        throw new ForbiddenException('Only the owner can remove an admin');
      }
      await c.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await c.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2',
        [userId, req.user.tenantId],
      );
      return { removed: true };
    });
  }
}
 + params.length; };
      const members = q.tab === 'members';
      const from = members ? ' FROM memberships m JOIN users u ON u.id=m.user_id' : ' FROM invitations i';
      if (!members) clauses.push('i.accepted_at IS NULL AND i.expires_at > now()');
      if (q.q) {
        const p = arg(q.q);
        clauses.push(members ? "(strpos(lower(u.full_name),lower(" + p + "))>0 OR strpos(lower(u.email),lower(" + p + "))>0)" : "strpos(lower(i.email),lower(" + p + "))>0");
      }
      if (q.role !== 'all') clauses.push((members ? 'm.role' : 'i.role') + '=' + arg(q.role));
      if (members && q.availability !== 'all') clauses.push('m.available=' + arg(q.availability === 'available'));
      const where = from + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '');
      const total = Number((await c.query('SELECT count(*)::int AS n' + where, params)).rows[0].n);
      const fields = members ? 'm.user_id,m.role,m.available,u.email,u.full_name' : 'i.id,i.email,i.role,i.expires_at';
      const order = members ? 'm.created_at,m.user_id' : 'i.created_at DESC,i.id DESC';
      const items = (await c.query('SELECT ' + fields + where + ' ORDER BY ' + order + ' LIMIT 
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(inviteSchema, body);
    if (input.role === 'admin' && req.user.role !== 'owner')
      throw new ForbiddenException('Only the owner can invite admins');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const members = (await c.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n;
      const pending = (
        await c.query(
          'SELECT count(*)::int AS n FROM invitations WHERE accepted_at IS NULL AND expires_at > now()',
        )
      ).rows[0].n;
      await this.plans.assertWithinLimit(c, 'agents', members + pending);

      const token = randomBytes(32).toString('hex');
      const inserted = await c.query(
        `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`,
        [
          req.user.tenantId,
          input.email.toLowerCase(),
          input.role,
          createHash('sha256').update(token).digest('hex'),
          req.user.userId,
        ],
      );
      const brand = await this.mail.appearance(req.user.tenantId);
      const mailJob = input.sendEmail
        ? await this.mail.enqueue(
            req.user.tenantId,
            inserted.rows[0].id,
            input.email,
            token,
            input.language,
          )
        : null;
      return { inviteUrl: `${brand.origin}/accept-invitation?token=${token}`, mailJob };
    });
  }

  @Roles('owner')
  @Patch('team/members/:userId')
  changeRole(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const { role } = parse(roleSchema, body);
    if (userId === req.user.userId) throw new BadRequestException('Cannot change your own role');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        "UPDATE memberships SET role = $1 WHERE user_id = $2 AND role <> 'owner' RETURNING user_id, role",
        [role, userId],
      );
      if (!r.rows[0]) throw new NotFoundException('Member not found or is the owner');
      return r.rows[0];
    });
  }

  @Roles('owner', 'admin')
  @Delete('team/members/:userId')
  removeMember(@Req() req: AuthedRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const target = (await c.query('SELECT role FROM memberships WHERE user_id = $1', [userId]))
        .rows[0];
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === 'owner') throw new ForbiddenException('Cannot remove the owner');
      if (target.role === 'admin' && req.user.role !== 'owner') {
        throw new ForbiddenException('Only the owner can remove an admin');
      }
      await c.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await c.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2',
        [userId, req.user.tenantId],
      );
      return { removed: true };
    });
  }
}
 + (params.length + 1) + ' OFFSET 
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(inviteSchema, body);
    if (input.role === 'admin' && req.user.role !== 'owner')
      throw new ForbiddenException('Only the owner can invite admins');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const members = (await c.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n;
      const pending = (
        await c.query(
          'SELECT count(*)::int AS n FROM invitations WHERE accepted_at IS NULL AND expires_at > now()',
        )
      ).rows[0].n;
      await this.plans.assertWithinLimit(c, 'agents', members + pending);

      const token = randomBytes(32).toString('hex');
      const inserted = await c.query(
        `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`,
        [
          req.user.tenantId,
          input.email.toLowerCase(),
          input.role,
          createHash('sha256').update(token).digest('hex'),
          req.user.userId,
        ],
      );
      const brand = await this.mail.appearance(req.user.tenantId);
      const mailJob = input.sendEmail
        ? await this.mail.enqueue(
            req.user.tenantId,
            inserted.rows[0].id,
            input.email,
            token,
            input.language,
          )
        : null;
      return { inviteUrl: `${brand.origin}/accept-invitation?token=${token}`, mailJob };
    });
  }

  @Roles('owner')
  @Patch('team/members/:userId')
  changeRole(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const { role } = parse(roleSchema, body);
    if (userId === req.user.userId) throw new BadRequestException('Cannot change your own role');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        "UPDATE memberships SET role = $1 WHERE user_id = $2 AND role <> 'owner' RETURNING user_id, role",
        [role, userId],
      );
      if (!r.rows[0]) throw new NotFoundException('Member not found or is the owner');
      return r.rows[0];
    });
  }

  @Roles('owner', 'admin')
  @Delete('team/members/:userId')
  removeMember(@Req() req: AuthedRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const target = (await c.query('SELECT role FROM memberships WHERE user_id = $1', [userId]))
        .rows[0];
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === 'owner') throw new ForbiddenException('Cannot remove the owner');
      if (target.role === 'admin' && req.user.role !== 'owner') {
        throw new ForbiddenException('Only the owner can remove an admin');
      }
      await c.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await c.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2',
        [userId, req.user.tenantId],
      );
      return { removed: true };
    });
  }
}
 + (params.length + 2), [...params,q.limit,(q.page-1)*q.limit])).rows;
      return { items,total,role:req.user.role,metrics:{members:Number(memberCounts.members),available:Number(memberCounts.available),pending} };
    });
  }

  @Roles('owner', 'admin')
  @Post('team/invitations')
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(inviteSchema, body);
    if (input.role === 'admin' && req.user.role !== 'owner')
      throw new ForbiddenException('Only the owner can invite admins');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const members = (await c.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n;
      const pending = (
        await c.query(
          'SELECT count(*)::int AS n FROM invitations WHERE accepted_at IS NULL AND expires_at > now()',
        )
      ).rows[0].n;
      await this.plans.assertWithinLimit(c, 'agents', members + pending);

      const token = randomBytes(32).toString('hex');
      const inserted = await c.query(
        `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`,
        [
          req.user.tenantId,
          input.email.toLowerCase(),
          input.role,
          createHash('sha256').update(token).digest('hex'),
          req.user.userId,
        ],
      );
      const brand = await this.mail.appearance(req.user.tenantId);
      const mailJob = input.sendEmail
        ? await this.mail.enqueue(
            req.user.tenantId,
            inserted.rows[0].id,
            input.email,
            token,
            input.language,
          )
        : null;
      return { inviteUrl: `${brand.origin}/accept-invitation?token=${token}`, mailJob };
    });
  }

  @Roles('owner')
  @Patch('team/members/:userId')
  changeRole(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const { role } = parse(roleSchema, body);
    if (userId === req.user.userId) throw new BadRequestException('Cannot change your own role');
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const r = await c.query(
        "UPDATE memberships SET role = $1 WHERE user_id = $2 AND role <> 'owner' RETURNING user_id, role",
        [role, userId],
      );
      if (!r.rows[0]) throw new NotFoundException('Member not found or is the owner');
      return r.rows[0];
    });
  }

  @Roles('owner', 'admin')
  @Delete('team/members/:userId')
  removeMember(@Req() req: AuthedRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const target = (await c.query('SELECT role FROM memberships WHERE user_id = $1', [userId]))
        .rows[0];
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === 'owner') throw new ForbiddenException('Cannot remove the owner');
      if (target.role === 'admin' && req.user.role !== 'owner') {
        throw new ForbiddenException('Only the owner can remove an admin');
      }
      await c.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
      await c.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2',
        [userId, req.user.tenantId],
      );
      return { removed: true };
    });
  }
}
