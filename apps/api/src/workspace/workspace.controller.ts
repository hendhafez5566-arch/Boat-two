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
      const tenant = (await c.query('SELECT id, name, slug, created_at FROM tenants')).rows[0];
      const plan = await this.plans.getTenantPlan(c);
      const agents = (await c.query('SELECT count(*)::int AS n FROM memberships')).rows[0].n;
      return { tenant, role: req.user.role, plan, usage: { agents } };
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

  @Roles('owner', 'admin') @Post('team/invitations')
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parse(inviteSchema, body);
    return this.db.withTenant(req.user.tenantId, async (c) => {
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

  @Roles('owner') @Patch('team/members/:userId')
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

  @Roles('owner', 'admin') @Delete('team/members/:userId')
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
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2', [
        userId,
        req.user.tenantId,
      ]);
      return { removed: true };
    });
  }
}
