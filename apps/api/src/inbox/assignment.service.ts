import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { pickLeastLoaded } from './assignment';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../events/events.service';
import { assignmentPolicySchema, notificationSettingsSchema } from '../business/sales-settings';
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

  async evaluate(
    c: PoolClient,
    context: {
      channelId?: string;
      departmentId?: string;
      tags?: string[];
      attributes?: Record<string, unknown>;
      previousOwner?: string | null;
      conversationId?: string;
    } = {},
  ) {
    const settings = (await c.query('SELECT settings FROM tenants')).rows[0]?.settings || {};
    const policy = assignmentPolicySchema.parse(settings.crmAssignment || {});
    const legacy = (await c.query('SELECT max_open_per_agent FROM inbox_settings')).rows[0];
    const max = policy.maxOpenPerAgent ?? legacy?.max_open_per_agent ?? 15;
    let ids = policy.memberIds;
    let ruleIndex: number | null = null;
    if (policy.enabled && policy.method === 'rules') {
      ruleIndex = policy.rules.findIndex(
        (x) =>
          (!x.channelId || x.channelId === context.channelId) &&
          (!x.departmentId || x.departmentId === context.departmentId) &&
          (!x.tag || context.tags?.includes(x.tag)) &&
          (!x.fieldKey || String(context.attributes?.[x.fieldKey] ?? '').trim() === x.fieldValue),
      );
      if (ruleIndex < 0)
        return { employee: null, reason: 'no_matching_rule', ruleIndex: null, candidates: [] };
      ids = policy.rules[ruleIndex].memberIds;
    }
    if (policy.enabled && !ids.length)
      return { employee: null, reason: 'no_participants', ruleIndex, candidates: [] };
    const rows = (
      await c.query(
        `SELECT m.user_id,m.available,
       (SELECT count(*)::int FROM conversations cv WHERE cv.assigned_to=m.user_id AND cv.status<>'closed' AND cv.archived_at IS NULL AND ($3::uuid IS NULL OR cv.id<>$3)) AS open,
       (SELECT count(*)::int FROM contacts ct WHERE ct.owner_id=m.user_id AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL) AS leads,
       ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM department_members dm JOIN departments d ON d.id=dm.department_id WHERE dm.department_id=$2 AND dm.user_id=m.user_id AND d.archived_at IS NULL)) AS department_ok
       FROM memberships m WHERE cardinality($1::uuid[])=0 OR m.user_id=ANY($1::uuid[]) ORDER BY m.user_id`,
        [ids, context.departmentId || null, context.conversationId || null],
      )
    ).rows;
    const candidates = rows.map((x) => ({
      userId: x.user_id as string,
      open: Number(x.open),
      leads: Number(x.leads),
      eligible: !!x.available && !!x.department_ok && x.open < max,
      reason: !x.available
        ? 'unavailable'
        : !x.department_ok
          ? 'department_mismatch'
          : x.open >= max
            ? 'at_capacity'
            : 'eligible',
    }));
    const members = candidates.filter((x) => x.eligible);
    if (!members.length)
      return { employee: null, reason: 'no_eligible_employee', ruleIndex, candidates };
    if (context.previousOwner && members.some((x) => x.userId === context.previousOwner))
      return {
        employee: context.previousOwner,
        reason: 'retained_eligible_owner',
        ruleIndex,
        candidates,
      };
    if (policy.enabled && policy.method === 'round_robin') {
      const employee =
        members[
          (members.findIndex((x) => x.userId === settings.crmAssignmentLast) + 1) % members.length
        ].userId;
      return { employee, reason: 'round_robin', ruleIndex, candidates };
    }
    const employee = pickLeastLoaded(
      members.map((x) => ({ userId: x.userId, open: x.open })),
      Number.MAX_SAFE_INTEGER,
    );
    return {
      employee,
      reason:
        policy.method === 'rules' && policy.enabled ? 'matching_rule_least_loaded' : 'least_loaded',
      ruleIndex,
      candidates,
    };
  }
  async candidate(c: PoolClient, context: Parameters<AssignmentService['evaluate']>[1] = {}) {
    return (await this.evaluate(c, context)).employee;
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
          'SELECT id,tags,attributes,owner_id FROM contacts WHERE id=$1 AND archived_at IS NULL AND merged_into_id IS NULL FOR UPDATE',
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
        attributes: contact.attributes,
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
  @OnEvent('domain.event', { suppressErrors: false })
  async routeAnswer(event: DomainEvent) {
    if (
      !['crm.bot.answer', 'crm.tag.added'].includes(event.type) ||
      typeof event.payload.contactId !== 'string'
    )
      return;
    const ids = await this.db.withTenant(
      event.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT id FROM conversations WHERE contact_id=$1 AND status<>'closed' AND archived_at IS NULL AND handled_by='bot' ORDER BY created_at,id",
            [event.payload.contactId],
          )
        ).rows,
    );
    for (const cv of ids) await this.autoAssignIfEnabled(event.tenantId, cv.id);
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
      if (settings.crmAssignment && !policy.enabled) return null;
      if (!force && (settings.crmAssignment ? !policy.enabled : !legacy.auto_assign)) return null;
      const cv = (
        await c.query('SELECT * FROM conversations WHERE id=$1 FOR UPDATE', [conversationId])
      ).rows[0];
      if (
        !cv ||
        cv.status === 'closed' ||
        cv.archived_at ||
        (cv.assigned_to && !force && cv.handled_by === 'human')
      )
        return null;
      const contact = (
        await c.query(
          'SELECT owner_id,tags,attributes FROM contacts WHERE id=$1 AND archived_at IS NULL AND merged_into_id IS NULL',
          [cv.contact_id],
        )
      ).rows[0];
      if (!contact) return null;
      const decision = await this.evaluate(c, {
        channelId: cv.channel_id,
        departmentId: cv.department_id,
        tags: contact.tags,
        attributes: contact.attributes,
        previousOwner: force ? null : cv.assigned_to || contact.owner_id,
        conversationId,
      });
      const agent = decision.employee;
      if (!agent) {
        // A failed manual retry must not discard an existing human assignment.
        if (force && cv.assigned_to && cv.handled_by === 'human') return null;
        await c.query('UPDATE conversations SET assigned_to=NULL WHERE id=$1', [conversationId]);
        if (policy.enabled)
          await c.query(
            'UPDATE contacts SET owner_id=NULL,updated_at=now() WHERE id=$1 AND owner_id IS NOT NULL',
            [cv.contact_id],
          );
        const last = (
          await c.query(
            "SELECT content->>'reason' AS reason FROM messages WHERE conversation_id=$1 AND is_internal AND content->>'event'='assignment_waiting' ORDER BY seq DESC LIMIT 1",
            [conversationId],
          )
        ).rows[0];
        if (last?.reason !== decision.reason)
          await c.query(
            `INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,is_internal) VALUES($1,$2,$3,'out','system','event',$4::jsonb,'sent',true)`,
            [
              tenantId,
              conversationId,
              cv.channel_id,
              JSON.stringify({ event: 'assignment_waiting', reason: decision.reason }),
            ],
          );
        const notices = notificationSettingsSchema.parse(settings.crmNotifications || {});
        if (notices.enabled && notices.kinds.includes('unassigned'))
          await c.query(
            `INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,priority,dedupe_key)
           SELECT $1,user_id,'unassigned','conversation',$2,$3,'محادثة تنتظر موظفًا مؤهلًا / Waiting for eligible employee','high',$4 FROM memberships WHERE role IN ('owner','admin') AND (cardinality($5::uuid[])=0 OR user_id=ANY($5::uuid[])) ON CONFLICT DO NOTHING`,
            [
              tenantId,
              conversationId,
              cv.contact_id,
              'assignment_waiting:' + conversationId + ':' + decision.reason,
              notices.targetIds,
            ],
          );
        return null;
      }
      if (agent === cv.assigned_to && !force) return agent;
      await c.query('UPDATE conversations SET assigned_to=$2 WHERE id=$1', [conversationId, agent]);
      if (policy.enabled)
        await c.query(
          'UPDATE contacts SET owner_id=$2,updated_at=now() WHERE id=$1 AND owner_id IS DISTINCT FROM $2',
          [cv.contact_id, agent],
        );
      await this.remember(c, agent);
      await c.query(
        `INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,is_internal) SELECT tenant_id,id,channel_id,'out','system','event',$2::jsonb,'sent',true FROM conversations WHERE id=$1`,
        [
          conversationId,
          JSON.stringify({
            event: 'assigned',
            userId: agent,
            auto: true,
            reason: decision.reason,
            ruleIndex: decision.ruleIndex,
          }),
        ],
      );
      await c.query(
        "UPDATE crm_notifications SET handled_at=COALESCE(handled_at,now()) WHERE resource_id=$1 AND dedupe_key LIKE 'assignment_waiting:%'",
        [conversationId],
      );
      this.events.emit('conversation.updated', { tenantId, conversationId, reason: 'assigned' });
      return agent;
    });
  }
}
