import {
  BadRequestException,
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
    const b = parse(ruleSchema, body);
    return this.db.withTenant(r.user.tenantId, async (c) => {
      if (b.enabled) await this.plans.assertFeature(c, 'automations');
      const row = (
        await c.query(
          'UPDATE automation_rules SET name=$2,enabled=$3,trigger=$4,conditions=$5,actions=$6 WHERE id=$1 RETURNING *',
          [
            id,
            b.name,
            b.enabled,
            b.trigger,
            JSON.stringify(b.conditions),
            JSON.stringify(b.actions),
          ],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      return row;
    });
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
  @Roles('owner', 'admin', 'agent') @Get('departments') departments(@Req() r: AuthedRequest) {
    return this.db.withTenant(
      r.user.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT d.*,COALESCE((SELECT jsonb_agg(user_id) FROM department_members WHERE department_id=d.id),'[]') AS members FROM departments d ORDER BY name",
          )
        ).rows,
    );
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
