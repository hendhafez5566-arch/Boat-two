import { z } from 'zod';
import { EventsService } from '../events/events.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PlansService } from '../plans/plans.service';
import { DatabaseService } from '../database/database.service';
import { DomainEvent } from '../events/events.service';
import { actionSchema, contactWhere, ruleSchema } from './schemas';
@Injectable()
export class AutomationService {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private events: EventsService,
  ) {}
  @OnEvent('domain.event', { suppressErrors: false }) async handle(event: DomainEvent) {
    const contactId = event.payload.contactId;
    if (typeof contactId !== 'string') return;
    await this.db.withTenant(event.tenantId, async (c) => {
      const root =
        (await c.query("SELECT NULLIF(current_setting('app.root_event_id',true),'') AS id")).rows[0]
          .id || event.id;
      const entitlement = await this.plans.getTenantPlan(c);
      if (!entitlement.features.automations) return;
      const rules = (
        await c.query(
          'SELECT * FROM automation_rules WHERE enabled AND trigger=$1 ORDER BY created_at,id',
          [event.type],
        )
      ).rows;
      for (const row of rules) {
        if (event.type === 'automation.scheduled' && event.payload.ruleId !== row.id) continue;
        if (
          (
            await c.query(
              'SELECT 1 FROM automation_runs WHERE rule_id=$1 AND root_id=$2 AND contact_id=$3',
              [row.id, root, contactId],
            )
          ).rowCount
        )
          continue;
        const rule = ruleSchema.parse(row);
        const w = contactWhere(rule.conditions);
        const match = (
          await c.query(`SELECT id FROM contacts WHERE ${w.sql} AND id=$5`, [
            ...w.params,
            contactId,
          ])
        ).rowCount;
        if (match)
          await this.actions(
            event.tenantId,
            contactId,
            rule.actions,
            `${event.id}:${row.id}`,
            row.id,
          );
        await c.query(
          'INSERT INTO automation_runs(tenant_id,rule_id,event_id,status,root_id,contact_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [event.tenantId, row.id, event.id, match ? 'completed' : 'skipped', root, contactId],
        );
      }
    });
  }
  private async actions(
    tenant: string,
    contactId: string,
    actions: z.infer<typeof actionSchema>[],
    key: string,
    ruleId?: string,
  ) {
    await this.db.withTenant(tenant, async (c) => {
      for (const [index, action] of actions.entries())
        switch (action.type) {
          case 'tag':
            await c.query(
              'UPDATE contacts SET tags=array_append(tags,$2),updated_at=now() WHERE id=$1 AND NOT $2=ANY(tags)',
              [contactId, action.tag],
            );
            break;
          case 'lifecycle':
            await c.query(
              'UPDATE contacts SET lifecycle=$2,updated_at=now() WHERE id=$1 AND lifecycle<>$2',
              [contactId, action.value],
            );
            break;
          case 'task':
            await c.query(
              'INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at) VALUES($1,$2,$3,now()+make_interval(mins=>$4))',
              [tenant, contactId, action.title, action.delayMinutes],
            );
            break;
          case 'note':
            await c.query('INSERT INTO crm_notes(tenant_id,contact_id,body) VALUES($1,$2,$3)', [
              tenant,
              contactId,
              action.text,
            ]);
            break;
          case 'delay':
            await this.events.publish(
              tenant,
              'automation.followup',
              contactId,
              { contactId, actions: action.actions, ruleId },
              `followup:${key}:${index}`,
              new Date(Date.now() + action.delayMinutes * 60000).toISOString(),
            );
            break;
        }
    });
  }
  @OnEvent('automation.followup', { suppressErrors: false })
  async followup(event: {
    tenantId: string;
    contactId: string;
    actions: unknown;
    eventId: string;
    ruleId?: string;
  }) {
    const enabled = await this.db.withTenant(event.tenantId, (c) => this.plans.getTenantPlan(c));
    if (!enabled.features.automations) return;
    if (event.ruleId) {
      const active = await this.db.withTenant(
        event.tenantId,
        async (c) =>
          (await c.query('SELECT 1 FROM automation_rules WHERE id=$1 AND enabled', [event.ruleId]))
            .rowCount,
      );
      if (!active) return;
    }
    const actions = z.array(actionSchema).max(10).parse(event.actions);
    await this.actions(event.tenantId, event.contactId, actions, event.eventId, event.ruleId);
  }
}
