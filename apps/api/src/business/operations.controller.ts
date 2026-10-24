import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/decorators';
import { AuthedRequest } from '../common/types';
import { parse } from '../common/zod';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { EventsService } from '../events/events.service';
import { OutboundService } from '../messaging/outbound.service';
import { pagination, ruleSchema } from './schemas';
@Controller()
@Roles('owner', 'admin')
export class OperationsController {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private events: EventsService,
    private outbound: OutboundService,
  ) {}
  @Get('automations') list(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (await c.query('SELECT * FROM automation_rules ORDER BY created_at DESC LIMIT 100')).rows,
    );
  }
  @Post('automations') create(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(ruleSchema, body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      await this.plans.assertFeature(c, 'automations');
      await this.plans.assertWithinLimit(
        c,
        'automation_rules',
        (await c.query('SELECT count(*)::int AS n FROM automation_rules')).rows[0].n,
      );
      return (
        await c.query(
          'INSERT INTO automation_rules(tenant_id,name,enabled,trigger,conditions,actions) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            r.user.tenantId,
            b.name,
            b.enabled,
            b.trigger,
            JSON.stringify(b.conditions),
            JSON.stringify(b.actions),
          ],
        )
      ).rows[0];
    });
  }
  @Patch('automations/:id') update(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      ruleSchema.and(
        z.object({
          expectedRevision: z.number().int().min(1).optional(),
          canvasPositions: z
            .record(
              z.object({
                x: z.number().finite().min(-100000).max(100000),
                y: z.number().finite().min(-100000).max(100000),
              }),
            )
            .refine((v) => Object.keys(v).length <= 100)
            .optional(),
        }),
      ),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const current = (
        await c.query('SELECT revision FROM automation_rules WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!current) throw new NotFoundException();
      if (b.expectedRevision !== undefined && b.expectedRevision !== current.revision)
        throw new ConflictException('Workflow changed; reload before saving');
      if (b.enabled) await this.plans.assertFeature(c, 'automations');
      const row = (
        await c.query(
          'UPDATE automation_rules SET name=$2,enabled=$3,trigger=$4,conditions=$5,actions=$6,canvas_positions=COALESCE($7,canvas_positions) WHERE id=$1 RETURNING *',
          [
            id,
            b.name,
            b.enabled,
            b.trigger,
            JSON.stringify(b.conditions),
            JSON.stringify(b.actions),
            b.canvasPositions ? JSON.stringify(b.canvasPositions) : null,
          ],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  @Get('automations/:id/versions') versions(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT revision,snapshot,actor_id,created_at FROM automation_rule_versions WHERE rule_id=$1 ORDER BY revision DESC LIMIT 50',
            [id],
          )
        ).rows,
    );
  }
  @Post('automations/:id/schedule') schedule(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ contactId: z.string().uuid(), at: z.string().datetime() }), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      await this.plans.assertFeature(c, 'automations');
      if (
        !(
          await c.query(
            "SELECT 1 FROM automation_rules WHERE id=$1 AND enabled AND trigger='automation.scheduled'",
            [id],
          )
        ).rowCount
      )
        throw new BadRequestException('Enable a scheduled rule first');
      if (!(await c.query('SELECT 1 FROM contacts WHERE id=$1', [b.contactId])).rowCount)
        throw new NotFoundException('Contact not found');
      await this.events.publish(
        r.user.tenantId,
        'automation.scheduled',
        b.contactId,
        { ruleId: id, contactId: b.contactId },
        undefined,
        b.at,
      );
      return { scheduled: true };
    });
  }
  @Get('automations/schedules') schedules(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT id,type,status,available_at,error,attempts FROM domain_events WHERE type IN ('automation.scheduled','automation.followup') ORDER BY created_at DESC LIMIT 100",
          )
        ).rows,
    );
  }
  @Patch('automations/schedules/:eventId') changeSchedule(
    @Req() r: AuthedRequest,
    @Param('eventId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.union([
        z.object({ cancel: z.literal(true) }),
        z.object({
          at: z
            .string()
            .datetime()
            .refine((at) => Date.parse(at) > Date.now(), 'Choose a future time'),
        }),
      ]),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM domain_events WHERE id=$1 AND type IN ('automation.scheduled','automation.followup') AND status='pending' AND attempts=0 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new BadRequestException('Only unattempted pending schedules can be changed');
      if ('cancel' in b)
        await c.query(
          "UPDATE domain_events SET status='completed',completed_at=now(),error='Canceled by operator' WHERE id=$1",
          [id],
        );
      else {
        await this.plans.assertFeature(c, 'automations');
        await c.query('UPDATE domain_events SET available_at=$2 WHERE id=$1', [id, b.at]);
      }
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,$2,$3,'automation_schedule',$4)",
        [r.user.tenantId, r.user.userId, 'cancel' in b ? 'cancel' : 'reschedule', id],
      );
      return { changed: true };
    });
  }
  @Get('automations/failures') failures(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT f.*,a.name,e.status AS event_status FROM automation_failures f LEFT JOIN automation_rules a ON a.id=f.rule_id LEFT JOIN domain_events e ON e.id=f.event_id ORDER BY f.created_at DESC LIMIT 100',
          )
        ).rows,
    );
  }
  @Post('automations/failures/:id/retry') retryFailure(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const failure = (await c.query('SELECT * FROM automation_failures WHERE id=$1', [id]))
        .rows[0];
      if (!failure) throw new NotFoundException();
      if (
        !(
          await c.query(
            "UPDATE domain_events SET status='pending',attempts=0,error=NULL,available_at=now() WHERE id=$1 AND status='failed'",
            [failure.event_id],
          )
        ).rowCount
      )
        throw new BadRequestException('Only exhausted failed events can be retried');
      return { queued: true, ambiguousEffectsWillNotReplay: true };
    });
  }
  @Get('automations/history') history(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(pagination, query);
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT a.*,r.name FROM automation_runs a JOIN automation_rules r ON r.id=a.rule_id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2',
            [q.limit, (q.page - 1) * q.limit],
          )
        ).rows,
    );
  }
  @Get('delivery') delivery(@Req() r: AuthedRequest, @Query() query: unknown) {
    const q = parse(pagination, query);
    return this.db.withTenant(r.user.tenantId, async (c) => ({
      outbound: (
        await c.query(
          'SELECT j.*,m.status AS message_status,m.conversation_id FROM outbound_jobs j JOIN messages m ON m.id=j.message_id ORDER BY j.created_at DESC LIMIT $1 OFFSET $2',
          [q.limit, (q.page - 1) * q.limit],
        )
      ).rows,
      events: (
        await c.query(
          'SELECT id,type,status,attempts,error,created_at FROM domain_events ORDER BY seq DESC LIMIT $1 OFFSET $2',
          [q.limit, (q.page - 1) * q.limit],
        )
      ).rows,
    }));
  }
  @Post('delivery/:id/retry') retry(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.outbound.retry(r.user.tenantId, id);
  }
  @Post('delivery/:id/reconcile')
  reconcile(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z
        .object({
          result: z.enum(['sent', 'failed']),
          externalId: z.string().min(1).max(500).optional(),
          evidence: z.string().trim().min(10).max(1000),
        })
        .refine(
          (x) => x.result !== 'sent' || !!x.externalId,
          'Provider message ID required for a confirmed send',
        ),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const job = (
        await c.query(
          "SELECT message_id FROM outbound_jobs WHERE id=$1 AND status='ambiguous' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!job) throw new BadRequestException('Only ambiguous deliveries can be reconciled');
      await c.query('UPDATE outbound_jobs SET status=$2,error=$3,updated_at=now() WHERE id=$1', [
        id,
        b.result,
        b.evidence,
      ]);
      await c.query(
        'UPDATE messages SET status=$2,external_id=COALESCE($3,external_id),error=$4 WHERE id=$1',
        [job.message_id, b.result, b.externalId ?? null, b.result === 'failed' ? b.evidence : null],
      );
      await c.query(
        "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,details) VALUES($1,$2,'delivery_reconciled','outbound_jobs',$3,$4)",
        [r.user.tenantId, r.user.userId, id, JSON.stringify(b)],
      );
      return { reconciled: true };
    });
  }

  @Post('events/:id/retry') retryEvent(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          "UPDATE domain_events SET status='pending',attempts=0,available_at=now(),error=NULL WHERE id=$1 AND status='failed' RETURNING id",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  @Roles('owner', 'admin', 'agent') @Get('departments') departments(
    @Req() r: AuthedRequest,
    @Query() query: unknown,
  ) {
    const options = parse(
      z.object({ includeArchived: z.enum(['true', 'false']).default('false') }),
      query,
    );
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT d.*,COALESCE((SELECT jsonb_agg(user_id) FROM department_members WHERE department_id=d.id),'[]') AS members FROM departments d WHERE ($1 OR d.archived_at IS NULL) ORDER BY name",
            [options.includeArchived === 'true'],
          )
        ).rows,
    );
  }
  @Get('departments/metrics') metrics(@Req() r: AuthedRequest, @Query() query: unknown) {
    const b = parse(
      z
        .object({ from: z.string().datetime(), to: z.string().datetime() })
        .refine(
          (b) =>
            Date.parse(b.to) > Date.parse(b.from) &&
            Date.parse(b.to) - Date.parse(b.from) <= 366 * 86400000,
        ),
      query,
    );
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            `SELECT d.id,d.name,d.sla_minutes,count(cv.id)::int AS conversations,
      count(reply.sent_at)::int AS responded,count(cv.id) FILTER(WHERE inbound.received_at IS NOT NULL AND reply.sent_at IS NULL)::int AS unanswered,
      round(avg(extract(epoch FROM(reply.sent_at-inbound.received_at))))::int AS average_response_seconds,
      count(cv.id) FILTER(WHERE inbound.received_at IS NOT NULL AND COALESCE(reply.sent_at,now())-inbound.received_at>d.sla_minutes*interval '1 minute')::int AS current_target_breaches
      FROM departments d LEFT JOIN conversations cv ON cv.department_id=d.id AND cv.created_at>=$1 AND cv.created_at<$2
      LEFT JOIN LATERAL(SELECT min(created_at) AS received_at FROM messages WHERE conversation_id=cv.id AND direction='in') inbound ON true
      LEFT JOIN LATERAL(SELECT min(created_at) AS sent_at FROM messages WHERE conversation_id=cv.id AND direction='out' AND sender_type='agent' AND NOT is_internal AND status IN ('sent','delivered','read') AND created_at>=inbound.received_at) reply ON true
      GROUP BY d.id ORDER BY d.name`,
            [b.from, b.to],
          )
        ).rows,
    );
  }
  @Patch('departments/:id') updateDepartment(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        slaMinutes: z.number().int().min(1).max(10080),
        members: z
          .array(z.string().uuid())
          .max(100)
          .refine((ids) => new Set(ids).size === ids.length),
        expectedUpdatedAt: z.string().datetime().optional(),
      }),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      for (const member of b.members)
        if (!(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [member])).rowCount)
          throw new BadRequestException('Department member outside workspace');
      const row = (
        await c.query(
          `UPDATE departments SET name=$2,sla_minutes=$3,updated_at=now() WHERE id=$1 AND ($4::timestamptz IS NULL OR date_trunc('milliseconds',updated_at)=$4) RETURNING *`,
          [id, b.name, b.slaMinutes, b.expectedUpdatedAt ?? null],
        )
      ).rows[0];
      if (!row) {
        if (!(await c.query('SELECT 1 FROM departments WHERE id=$1', [id])).rowCount)
          throw new NotFoundException();
        throw new BadRequestException('Department changed; refresh before saving');
      }
      await c.query('DELETE FROM department_members WHERE department_id=$1', [id]);
      for (const member of b.members)
        await c.query(
          'INSERT INTO department_members(tenant_id,department_id,user_id) VALUES($1,$2,$3)',
          [r.user.tenantId, id, member],
        );
      return row;
    });
  }
  @Patch('departments/:id/archive') archiveDepartment(
    @Req() r: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ archived: z.boolean() }), body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      const row = (
        await c.query(
          'UPDATE departments SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING *',
          [id, b.archived],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  @Post('departments') department(@Req() r: AuthedRequest, @Body() body: unknown) {
    const b = parse(
      z.object({
        name: z.string().min(1).max(100),
        slaMinutes: z.number().int().min(1).max(10080),
        members: z.array(z.string().uuid()).max(100),
      }),
      body,
    );
    return this.db.withTenant(r.user.tenantId, async (c) => {
      for (const id of b.members)
        if (!(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [id])).rowCount)
          throw new BadRequestException('Department member outside workspace');
      const row = (
        await c.query(
          'INSERT INTO departments(tenant_id,name,sla_minutes) VALUES($1,$2,$3) RETURNING *',
          [r.user.tenantId, b.name, b.slaMinutes],
        )
      ).rows[0];
      for (const id of new Set(b.members))
        await c.query(
          'INSERT INTO department_members(tenant_id,department_id,user_id) VALUES($1,$2,$3)',
          [r.user.tenantId, row.id, id],
        );
      return row;
    });
  }
}
