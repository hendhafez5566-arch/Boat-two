import { scoringSignalsSchema } from './sales-settings';
import { AssignmentService } from '../inbox/assignment.service';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from './notifications.service';
import { notificationSettingsSchema, assignmentPolicySchema } from './sales-settings';
@Controller('crm/sales')
export class SalesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly assignment: AssignmentService,
  ) {}
  @Get('notifications') async list(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(
      z.object({
        tab: z.enum(['all', 'unread', 'handled']).default('all'),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      }),
      query,
    );
    await this.notifications.refresh(r.user.tenantId, r.user.userId);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      // A former assignee must lose notification detail access on reassignment.
      const visibility = `user_id=$1 AND EXISTS(SELECT 1 FROM contacts ct WHERE ct.id=crm_notifications.contact_id AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL AND ($2::boolean OR ct.owner_id=$1 OR EXISTS(SELECT 1 FROM crm_tasks t WHERE t.contact_id=ct.id AND t.assigned_to=$1) OR EXISTS(SELECT 1 FROM conversations cv WHERE cv.contact_id=ct.id AND cv.assigned_to=$1) OR EXISTS(SELECT 1 FROM crm_deals d WHERE d.contact_id=ct.id AND d.owner_id=$1)))`;
      const args = [r.user.userId, r.user.role !== 'agent'];
      return {
        unread: (
          await c.query(
            `SELECT count(*)::int AS n FROM crm_notifications WHERE ${visibility} AND read_at IS NULL AND handled_at IS NULL`,
            args,
          )
        ).rows[0].n,
        items: (
          await c.query(
            `SELECT * FROM crm_notifications WHERE ${visibility} AND ($3='all' OR $3='unread' AND read_at IS NULL AND handled_at IS NULL OR $3='handled' AND handled_at IS NOT NULL) ORDER BY created_at DESC,id LIMIT 30 OFFSET $4`,
            [...args, q.tab, (q.page - 1) * 30],
          )
        ).rows,
      };
    });
  }
  @Post('notifications/read-all') readAll(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query(
        'UPDATE crm_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1',
        [r.user.userId],
      );
      return { ok: true };
    });
  }
  @Post('notifications/:id') update(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ handled: z.boolean().default(false) }).strict(), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const result = await c.query(
        'UPDATE crm_notifications SET read_at=COALESCE(read_at,now()),handled_at=CASE WHEN $3 THEN now() ELSE handled_at END WHERE id=$1 AND user_id=$2 RETURNING id',
        [id, r.user.userId, b.handled],
      );
      if (!result.rowCount) throw new NotFoundException();
      return { ok: true };
    });
  }
  @Get('settings') @Roles('owner', 'admin') settings(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const s = (await c.query('SELECT settings FROM tenants')).rows[0]?.settings || {};
      return {
        notifications: notificationSettingsSchema.parse(s.crmNotifications || {}),
        assignment: assignmentPolicySchema.parse(s.crmAssignment || {}),
      };
    });
  }
  @Post('settings') @Roles('owner', 'admin') save(@Req() r: AuthedRequest, @Body() body: unknown) {
    const schema = z.object({
      notifications: notificationSettingsSchema,
      assignment: assignmentPolicySchema,
    });
    const b = parse(schema.extend({ expected: schema }).strict(), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const current =
        (await c.query('SELECT settings FROM tenants FOR NO KEY UPDATE')).rows[0]?.settings || {};
      const normalized = {
        notifications: notificationSettingsSchema.parse(current.crmNotifications || {}),
        assignment: assignmentPolicySchema.parse(current.crmAssignment || {}),
      };
      if (JSON.stringify(normalized) !== JSON.stringify(b.expected))
        throw new ConflictException('Settings changed. Reload before saving.');
      const ids = [
        ...b.notifications.targetIds,
        ...b.assignment.memberIds,
        ...b.assignment.rules.flatMap((x) => x.memberIds),
      ];
      for (const id of new Set(ids))
        if (!(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [id])).rowCount)
          throw new NotFoundException('Employee not in workspace');
      for (const rule of b.assignment.rules) {
        if (
          rule.channelId &&
          !(await c.query('SELECT 1 FROM channels WHERE id=$1', [rule.channelId])).rowCount
        )
          throw new NotFoundException('Channel not in workspace');
        if (
          rule.departmentId &&
          !(await c.query('SELECT 1 FROM departments WHERE id=$1', [rule.departmentId])).rowCount
        )
          throw new NotFoundException('Department not in workspace');
      }
      await c.query(
        `UPDATE tenants SET settings=COALESCE(settings,'{}'::jsonb)||jsonb_build_object('crmNotifications',$1::jsonb,'crmAssignment',$2::jsonb)`,
        [JSON.stringify(b.notifications), JSON.stringify(b.assignment)],
      );
      return { notifications: b.notifications, assignment: b.assignment };
    });
  }
  @Post('assignment-test') @Roles('owner', 'admin') test(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          channelId: z.string().uuid().optional(),
          departmentId: z.string().uuid().optional(),
          tags: z.array(z.string().max(50)).max(30).optional(),
          attributes: z
            .record(
              z.string().max(100),
              z.union([z.string().max(200), z.number().finite(), z.boolean()]),
            )
            .refine((x) => Object.keys(x).length <= 30)
            .optional(),
          previousOwner: z.string().uuid().optional(),
        })
        .strict(),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const policy = assignmentPolicySchema.parse(
        (await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmAssignment || {},
      );
      if (!policy.enabled)
        return { employee: null, reason: 'policy_disabled', ruleIndex: null, candidates: [] };
      for (const [id, table] of [
        [b.channelId, 'channels'],
        [b.departmentId, 'departments'],
        [b.previousOwner, 'memberships'],
      ] as const) {
        if (
          id &&
          !(
            await c.query(
              `SELECT 1 FROM ${table} WHERE ${table === 'memberships' ? 'user_id' : 'id'}=$1`,
              [id],
            )
          ).rowCount
        )
          throw new NotFoundException('Test context outside workspace');
      }
      return this.assignment.evaluate(c, b);
    });
  }
  @Get('assignment-queue') @Roles('owner', 'admin') queue(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) => ({
      total: (
        await c.query(
          "SELECT count(*)::int n FROM conversations cv JOIN contacts ct ON ct.id=cv.contact_id WHERE cv.assigned_to IS NULL AND cv.status<>'closed' AND cv.archived_at IS NULL AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL",
        )
      ).rows[0].n,
      items: (
        await c.query(`SELECT cv.id,cv.channel_id,cv.created_at,ct.name,
        (SELECT content->>'reason' FROM messages WHERE conversation_id=cv.id AND is_internal AND content->>'event'='assignment_waiting' ORDER BY seq DESC LIMIT 1) AS reason
        FROM conversations cv JOIN contacts ct ON ct.id=cv.contact_id WHERE cv.assigned_to IS NULL AND cv.status<>'closed' AND cv.archived_at IS NULL AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL ORDER BY cv.created_at LIMIT 100`)
      ).rows,
    }));
  }
  @Get('scoring-signals') @Roles('owner', 'admin') signals(@Req() r: AuthedRequest) {
    return this.db.withTenant(r.user.tenantId, async (c) =>
      scoringSignalsSchema.parse(
        (await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmScoringSignals || {},
      ),
    );
  }
  @Post('scoring-signals') @Roles('owner', 'admin') saveSignals(
    @Req() r: AuthedRequest,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({ rules: scoringSignalsSchema, expected: scoringSignalsSchema }).strict(),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const current = scoringSignalsSchema.parse(
        (await c.query('SELECT settings FROM tenants FOR NO KEY UPDATE')).rows[0]?.settings
          ?.crmScoringSignals || {},
      );
      if (JSON.stringify(current) !== JSON.stringify(b.expected))
        throw new ConflictException('Scoring settings changed');
      await c.query(
        "UPDATE tenants SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{crmScoringSignals}',$1::jsonb,true)",
        [JSON.stringify(b.rules)],
      );
      return b.rules;
    });
  }
  @Get('assignment-history') @Roles('owner', 'admin') history(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            `SELECT a.id,a.resource_type,a.resource_id,a.details,a.created_at,u.full_name FROM audit_logs a LEFT JOIN users u ON u.id::text=a.details->>'to' WHERE a.action='owner_changed' ORDER BY a.created_at DESC LIMIT 50`,
          )
        ).rows,
    );
  }
}
