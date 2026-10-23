import { integrationHeaders } from './integration-auth';
import { CryptoService } from '../messaging/crypto.service';
import { safeHttpRequest } from '../flows/http-safe';
import { ExternalEffects } from '../events/external-effect';
import { env } from '../config/env';
import { z } from 'zod';
import { EventsService } from '../events/events.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PlansService } from '../plans/plans.service';
import { DatabaseService } from '../database/database.service';
import { DomainEvent } from '../events/events.service';
import { actionSchema, conditionWhere, ruleSchema } from './schemas';
@Injectable()
export class AutomationService {
  constructor(
    private db: DatabaseService,
    private plans: PlansService,
    private events: EventsService,
    private effects: ExternalEffects,
    private crypto: CryptoService,
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
        const w = conditionWhere(rule.conditions);
        const match = (
          await c.query(`SELECT id FROM contacts WHERE ${w.sql} AND id=$${w.params.length + 1}`, [
            ...w.params,
            contactId,
          ])
        ).rowCount;
        try {
          if (match)
            await this.actions(
              event.tenantId,
              contactId,
              rule.actions,
              `${event.id}:${row.id}`,
              row.id,
            );
        } catch (error) {
          await this.db.detached(event.tenantId, (client) =>
            client.query(
              `INSERT INTO automation_failures(tenant_id,rule_id,event_id,contact_id,error) VALUES($1,$2,$3,$4,$5)
            ON CONFLICT(tenant_id,rule_id,event_id) DO UPDATE SET attempts=automation_failures.attempts+1,error=EXCLUDED.error,resolved_at=NULL`,
              [event.tenantId, row.id, event.id, contactId, (error as Error).message.slice(0, 300)],
            ),
          );
          throw error;
        }
        await c.query(
          'UPDATE automation_failures SET resolved_at=now() WHERE rule_id=$1 AND event_id=$2',
          [row.id, event.id],
        );
        await c.query(
          'INSERT INTO automation_runs(tenant_id,rule_id,event_id,status,root_id,contact_id,rule_revision) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
          [
            event.tenantId,
            row.id,
            event.id,
            match ? 'completed' : 'skipped',
            root,
            contactId,
            row.revision,
          ],
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
          case 'branch': {
            const where = conditionWhere(action.conditions);
            const match = (
              await c.query(
                `SELECT 1 FROM contacts WHERE ${where.sql} AND id=$${where.params.length + 1}`,
                [...where.params, contactId],
              )
            ).rowCount;
            await this.actions(
              tenant,
              contactId,
              match ? action.then : action.otherwise,
              `${key}:branch:${index}`,
              ruleId,
            );
            break;
          }
          case 'http': {
            if (env.EXTERNAL_DELIVERY_ENABLED !== 'true')
              throw new Error('External automation HTTP delivery is disabled');
            let secret:
              | {
                  value_enc: string;
                  version: number;
                  auth_type: string;
                  header_name: string | null;
                }
              | undefined;
            if (action.secretId) {
              secret = (
                await c.query(
                  'SELECT value_enc,version,auth_type,header_name FROM integration_secrets WHERE id=$1 AND enabled AND $2=ANY(allowed_hosts)',
                  [action.secretId, new URL(action.url).hostname],
                )
              ).rows[0];
              if (!secret)
                throw new Error(
                  'Integration secret is disabled, not found or not authorized for this hostname',
                );
            }
            const response = await this.effects.execute(
              tenant,
              {
                ruleId,
                url: action.url,
                body: action.body,
                secretId: action.secretId,
                secretVersion: secret?.version,
                headers: action.headers,
                authType: secret?.auth_type,
                headerName: secret?.header_name,
              },
              () =>
                safeHttpRequest({
                  method: 'POST',
                  url: action.url,
                  headers: {
                    'Content-Type': 'application/json',
                    ...action.headers,
                    ...(secret
                      ? integrationHeaders(
                          {
                            ...secret,
                            value: this.crypto.decrypt<{ value: string }>(secret.value_enc).value,
                          },
                          action.body,
                        )
                      : {}),
                    'Idempotency-Key': `${key}:${index}`,
                  },
                  body: action.body,
                  timeoutMs: 10000,
                }),
            );
            if (!response.ok) throw new Error(`Automation HTTP returned ${response.status}`);
            break;
          }
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
    return this.db.withTenant(event.tenantId, async (c) => {
      // Serialize with CRM merge so resolution and all local writes share one canonical target.
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const plan = await this.plans.getTenantPlan(c);
      if (!plan.features.automations) return;
      if (
        event.ruleId &&
        !(await c.query('SELECT 1 FROM automation_rules WHERE id=$1 AND enabled', [event.ruleId]))
          .rowCount
      )
        return;
      let contactId = event.contactId;
      const visited = new Set<string>();
      for (;;) {
        if (visited.has(contactId) || visited.size >= 20)
          throw new Error('Contact merge chain requires operator review');
        visited.add(contactId);
        const contact = (
          await c.query('SELECT id,merged_into_id,archived_at FROM contacts WHERE id=$1', [
            contactId,
          ])
        ).rows[0];
        if (!contact) return;
        if (contact.merged_into_id) {
          contactId = contact.merged_into_id;
          continue;
        }
        if (contact.archived_at) return;
        break;
      }
      const actions = z.array(actionSchema).max(10).parse(event.actions);
      await this.actions(event.tenantId, contactId, actions, event.eventId, event.ruleId);
      if (contactId !== event.contactId)
        await c.query(
          "INSERT INTO audit_logs(tenant_id,action,resource_type,resource_id,details) VALUES($1,'automation_followup_retarget','contacts',$2,$3)",
          [
            event.tenantId,
            contactId,
            JSON.stringify({
              sourceId: event.contactId,
              eventId: event.eventId,
              ruleId: event.ruleId ?? null,
            }),
          ],
        );
    });
  }
}
