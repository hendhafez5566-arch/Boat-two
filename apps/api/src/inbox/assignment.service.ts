import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { pickLeastLoaded } from './assignment';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../events/events.service';
import { assignmentPolicySchema } from '../business/sales-settings';
import { PoolClient } from 'pg';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventEmitter2,
  ) {}

  async getSettings(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = (await c.query('SELECT * FROM inbox_settings')).rows[0];
      return {
        signature_enabled: r?.signature_enabled ?? false,
        signature_template: r?.signature_template ?? '— {{agent.name}}',
        human_session_minutes: r?.human_session_minutes ?? 0,
        delivery_error_tag: r?.delivery_error_tag ?? '',
        sla_escalation_enabled: r?.sla_escalation_enabled ?? false,
        escalation_user_id: r?.escalation_user_id ?? null,
        auto_assign: r?.auto_assign ?? false,
        max_open_per_agent: r?.max_open_per_agent ?? 15,
      };
    });
  }

  async saveSettings(
    tenantId: string,
    s: {
      auto_assign?: boolean;
      max_open_per_agent?: number;
      signature_enabled?: boolean;
      signature_template?: string;
      human_session_minutes?: number;
      delivery_error_tag?: string;
      sla_escalation_enabled?: boolean;
      escalation_user_id?: string | null;
    },
  ) {
    return this.db.withTenant(tenantId, async () => {
      const cur = await this.getSettings(tenantId);
      const m = { ...cur, ...s };
      await this.db.withTenant(tenantId, (c) =>
        c.query(
          `INSERT INTO inbox_settings (tenant_id, auto_assign, max_open_per_agent, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id) DO UPDATE SET auto_assign = $2, max_open_per_agent = $3, updated_at = now()`,
          [tenantId, m.auto_assign, m.max_open_per_agent],
        ),
      );
      await this.db.withTenant(tenantId, async (c) => {
        if (
          m.escalation_user_id &&
          !(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [m.escalation_user_id]))
            .rowCount
        )
          throw new BadRequestException('Escalation employee is not in this workspace');
        await c.query(
          'UPDATE inbox_settings SET signature_enabled=$1,signature_template=$2,human_session_minutes=$3,delivery_error_tag=$4,sla_escalation_enabled=$5,escalation_user_id=$6,updated_at=now()',
          [
            m.signature_enabled,
            m.signature_template,
            m.human_session_minutes,
            m.delivery_error_tag,
            m.sla_escalation_enabled,
            m.escalation_user_id,
          ],
        );
      });
      return m;
    });
  }

  async candidate(
    c: PoolClient,
    context: { channelId?: string; departmentId?: string; tags?: string[] } = {},
  ) {
    const settings = (await c.query('SELECT settings FROM tenants')).rows[0]?.settings || {};
    const policy = assignmentPolicySchema.parse(settings.crmAssignment || {});
    const legacy = (await c.query('SELECT max_open_per_agent FROM inbox_settings')).rows[0];
    let ids = policy.memberIds;
    if (policy.enabled && policy.method === 'rules') {
      const rule = policy.rules.find(
        (x) =>
          (!x.channelId || x.channelId === context.channelId) &&
          (!x.departmentId || x.departmentId === context.departmentId) &&
          (!x.tag || context.tags?.includes(x.tag)),
      );
      if (!rule) return null;
      ids = rule.memberIds;
    }
    if (policy.enabled && !ids.length) return null;
    const members = (
      await c.query(
        `SELECT m.user_id,
      (SELECT count(*)::int FROM conversations cv WHERE cv.assigned_to=m.user_id AND cv.status<>'closed') AS open,
      (SELECT count(*)::int FROM contacts ct WHERE ct.owner_id=m.user_id AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL) AS leads
      FROM memberships m WHERE m.available AND (cardinality($1::uuid[])=0 OR m.user_id=ANY($1::uuid[]))
      AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM department_members dm WHERE dm.department_id=$2 AND dm.user_id=m.user_id)) ORDER BY m.user_id`,
        [ids, context.departmentId || null],
      )
    ).rows.filter((x) => x.open < (legacy?.max_open_per_agent || 15));
    if (!members.length) return null;
    if (policy.enabled && policy.method === 'round_robin') {
      const last = settings.crmAssignmentLast;
      return members[(members.findIndex((x) => x.user_id === last) + 1) % members.length]
        .user_id as string;
    }
    return pickLeastLoaded(
      members.map((x) => ({ userId: x.user_id, open: x.open + (policy.enabled ? x.leads : 0) })),
      Number.MAX_SAFE_INTEGER,
    );
  }
  async pickAgent(tenantId: string): Promise<string | null> {
    return this.db.withTenant(tenantId, (c) => this.candidate(c));
  }
  private async remember(c: PoolClient, agent: string) {
    await c.query(
      "UPDATE tenants SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{crmAssignmentLast}',to_jsonb($1::text),true)",
      [agent],
    );
  }
  @OnEvent('domain.event', { suppressErrors: false })
  async lead(event: DomainEvent) {
    if (event.type !== 'crm.contacts.insert' || typeof event.payload.contactId !== 'string') return;
    return this.db.withTenant(event.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const settings = (await c.query('SELECT settings FROM tenants')).rows[0]?.settings || {};
      if (!assignmentPolicySchema.parse(settings.crmAssignment || {}).enabled) return;
      const contact = (
        await c.query(
          'SELECT id,tags,owner_id FROM contacts WHERE id=$1 AND archived_at IS NULL AND merged_into_id IS NULL FOR UPDATE',
          [event.payload.contactId],
        )
      ).rows[0];
      if (!contact || contact.owner_id) return;
      const cv = (
        await c.query(
          "SELECT channel_id,department_id FROM conversations WHERE contact_id=$1 AND status<>'closed' ORDER BY created_at DESC LIMIT 1",
          [contact.id],
        )
      ).rows[0];
      const agent = await this.candidate(c, {
        tags: contact.tags,
        channelId: cv?.channel_id,
        departmentId: cv?.department_id,
      });
      if (!agent) return;
      await c.query(
        'UPDATE contacts SET owner_id=$2,updated_at=now() WHERE id=$1 AND owner_id IS NULL',
        [contact.id, agent],
      );
      await this.remember(c, agent);
    });
  }
  /** Selection and write share a tenant lock, also across worker replicas. */
  async autoAssignIfEnabled(
    tenantId: string,
    conversationId: string,
    force = false,
  ): Promise<string | null> {
    return this.db.withTenant(tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const legacy = await this.getSettings(tenantId);
      const settings = (await c.query('SELECT settings FROM tenants')).rows[0]?.settings || {};
      const policy = assignmentPolicySchema.parse(settings.crmAssignment || {});
      if (!force && (settings.crmAssignment ? !policy.enabled : !legacy.auto_assign)) return null;
      const cv = (
        await c.query('SELECT * FROM conversations WHERE id=$1 FOR UPDATE', [conversationId])
      ).rows[0];
      if (!cv || cv.status === 'closed' || (cv.assigned_to && !force)) return null;
      const contact = (
        await c.query('SELECT owner_id,tags FROM contacts WHERE id=$1', [cv.contact_id])
      ).rows[0];
      // Keep the contact and conversation with the same eligible employee.
      const eligibleOwner =
        contact?.owner_id &&
        (
          await c.query(
            `SELECT 1 FROM memberships m WHERE m.user_id=$1 AND m.available AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM department_members dm WHERE dm.department_id=$2 AND dm.user_id=m.user_id))`,
            [contact.owner_id, cv.department_id],
          )
        ).rowCount;
      const agent =
        (!force && eligibleOwner ? contact.owner_id : null) ||
        (await this.candidate(c, {
          channelId: cv.channel_id,
          departmentId: cv.department_id,
          tags: contact?.tags,
        }));
      if (!agent) return null;
      await c.query('UPDATE conversations SET assigned_to=$2 WHERE id=$1', [conversationId, agent]);
      if (policy.enabled)
        await c.query(
          'UPDATE contacts SET owner_id=$2,updated_at=now() WHERE id=$1 AND owner_id IS NULL',
          [cv.contact_id, agent],
        );
      await this.remember(c, agent);
      await c.query(
        `INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,is_internal) SELECT tenant_id,id,channel_id,'out','system','event',$2::jsonb,'sent',true FROM conversations WHERE id=$1`,
        [conversationId, JSON.stringify({ event: 'assigned', userId: agent, auto: true })],
      );
      this.events.emit('conversation.updated', { tenantId, conversationId, reason: 'assigned' });
      return agent;
    });
  }
}
