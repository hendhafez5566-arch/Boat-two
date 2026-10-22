import {
  BadRequestException,
  Body,
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
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';

const inviteSchema = z.object({ email: z.string().email(), role: z.enum(['admin', 'agent']) });
const roleSchema = z.object({ role: z.enum(['admin', 'agent']) });

@Controller()
export class WorkspaceController {
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
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
      return { tenant, role: req.user.role, plan, usage: { agents, ...counts } };
    });
  }

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
        preferredPlan: z.enum(['free', 'starter', 'pro', 'business']),
      }),
      body,
    );
    return this.db.withTenant(
      req.user.tenantId,
      async (c) =>
        (
          await c.query(
            `UPDATE tenants SET name=$1, settings=settings || $2::jsonb, preferred_plan=$3 RETURNING id, name, settings, preferred_plan, onboarding_completed_at`,
            [
              input.name,
              JSON.stringify({
                industry: input.industry,
                timezone: input.timezone,
                language: input.language,
              }),
              input.preferredPlan,
            ],
          )
        ).rows[0],
    );
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
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      }),
      query,
    );
    return this.db.withTenant(req.user.tenantId, async (c) => {
      const items = (
        await c.query(
          `SELECT a.id, a.action, a.resource_type, a.resource_id, a.created_at, u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC, a.id DESC LIMIT $1 OFFSET $2`,
          [q.limit, (q.page - 1) * q.limit],
        )
      ).rows;
      const total = (await c.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n;
      return { items, total, page: q.page, limit: q.limit };
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
      const invites = await c.query(
        `SELECT id, email, role, expires_at FROM invitations
         WHERE accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
      );
      return { members: members.rows, pendingInvitations: invites.rows };
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
      await c.query(
        `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')`,
        [
          req.user.tenantId,
          input.email.toLowerCase(),
          input.role,
          createHash('sha256').update(token).digest('hex'),
          req.user.userId,
        ],
      );
      // إرسال الإيميل يُضاف في مرحلة لاحقة؛ حالياً نرجع الرابط ليرسله المستخدم يدوياً
      return { inviteUrl: `${env.APP_URL}/accept-invitation?token=${token}` };
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
