import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { DomainEvent } from '../events/events.service';
import { notificationSettingsSchema } from './sales-settings';
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}
  async add(
    c: PoolClient,
    tenant: string,
    item: {
      kind: string;
      type: string;
      id: string;
      contactId: string;
      title: string;
      key: string;
      userId?: string | null;
    },
    cachedSettings?: ReturnType<typeof notificationSettingsSchema.parse>,
  ) {
    const settings =
      cachedSettings ??
      notificationSettingsSchema.parse(
        (await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmNotifications || {},
      );
    if (!settings.enabled || !settings.kinds.includes(item.kind as (typeof settings.kinds)[number]))
      return;
    // Assigned staff receive their own alerts; unassigned leads reach managers only.
    await c.query(
      `INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,priority,dedupe_key)
      SELECT $1,user_id,$2,$3,$4,$5,$6,$7,$8 FROM memberships
      WHERE ($9::uuid IS NOT NULL AND user_id=$9 OR $9::uuid IS NULL AND role IN ('owner','admin'))
      AND (cardinality($10::uuid[])=0 OR user_id=ANY($10::uuid[])) ON CONFLICT DO NOTHING`,
      [
        tenant,
        item.kind,
        item.type,
        item.id,
        item.contactId,
        item.title.slice(0, 200),
        settings.highPriority.includes(item.kind as (typeof settings.kinds)[number])
          ? 'high'
          : 'normal',
        item.key,
        item.userId || null,
        settings.targetIds,
      ],
    );
  }
  @OnEvent('domain.event', { suppressErrors: false })
  async handle(event: DomainEvent) {
    if (event.type !== 'crm.contacts.insert') return;
    const id = event.payload.contactId;
    if (typeof id !== 'string') return;
    await this.db.withTenant(event.tenantId, async (c) => {
      const contact = (
        await c.query(
          'SELECT id,name,owner_id FROM contacts WHERE id=$1 AND archived_at IS NULL AND merged_into_id IS NULL',
          [id],
        )
      ).rows[0];
      if (!contact) return;
      if (event.type === 'crm.contacts.insert')
        await this.add(c, event.tenantId, {
          kind: 'new_lead',
          type: 'contact',
          id,
          contactId: id,
          title: contact.name,
          key: `new:${id}`,
          userId: contact.owner_id,
        });
    });
  }
  async refresh(tenant: string, user: string) {
    return this.db.withTenant(tenant, async (c) => {
      // Bounded scans; independent dedupe keys keep reads and retries idempotent.
      const s = notificationSettingsSchema.parse(
        (await c.query('SELECT settings FROM tenants')).rows[0]?.settings?.crmNotifications || {},
      );
      if (!s.enabled) return;
      const tasks = (
        await c.query(
          `SELECT t.*,ct.name FROM crm_tasks t JOIN contacts ct ON ct.id=t.contact_id WHERE t.status='open' AND t.due_at<=now()+make_interval(mins=>$1) AND (t.assigned_to=$2 OR t.assigned_to IS NULL) AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL AND NOT EXISTS(SELECT 1 FROM crm_notifications n WHERE n.user_id=$2 AND n.dedupe_key=(CASE WHEN t.due_at<now() THEN 'task_overdue' ELSE 'task_due' END)||':'||t.id::text||':'||to_char(t.due_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY t.due_at LIMIT 100`,
          [s.dueMinutes, user],
        )
      ).rows;
      for (const t of tasks) {
        const kind = Date.parse(t.due_at) < Date.now() ? 'task_overdue' : 'task_due';
        await this.add(
          c,
          tenant,
          {
            kind,
            type: 'task',
            id: t.id,
            contactId: t.contact_id,
            title: t.title,
            key: `${kind}:${t.id}:${new Date(t.due_at).toISOString()}`,
            userId: t.assigned_to,
          },
          s,
        );
      }
      const deals = (
        await c.query(
          `SELECT d.* FROM crm_deals d JOIN contacts ct ON ct.id=d.contact_id WHERE d.status='open' AND (d.owner_id=$1 OR d.owner_id IS NULL) AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL AND (d.updated_at<now()-make_interval(days=>$2) OR d.expected_close<=now()+make_interval(days=>$3)) ORDER BY d.updated_at LIMIT 100`,
          [user, s.staleDays, s.closingDays],
        )
      ).rows;
      for (const d of deals) {
        const stale = Date.parse(d.updated_at) < Date.now() - s.staleDays * 86400000;
        for (const kind of [
          ...(stale ? ['stale_deal'] : []),
          ...(d.expected_close &&
          Date.parse(d.expected_close) <= Date.now() + s.closingDays * 86400000
            ? ['closing_deal']
            : []),
        ])
          await this.add(
            c,
            tenant,
            {
              kind,
              type: 'deal',
              id: d.id,
              contactId: d.contact_id,
              title: d.title,
              key: `${kind}:${d.id}:${kind === 'stale_deal' ? new Date(d.updated_at).toISOString() : new Date(d.expected_close).toISOString()}`,
              userId: d.owner_id,
            },
            s,
          );
      }
      const leads = (
        await c.query(
          `SELECT id,name FROM contacts WHERE owner_id IS NULL AND lifecycle IN ('lead','qualified') AND archived_at IS NULL AND merged_into_id IS NULL AND NOT EXISTS(SELECT 1 FROM crm_notifications n WHERE n.user_id=$1 AND n.dedupe_key='unassigned:'||contacts.id::text) ORDER BY created_at DESC LIMIT 100`,
          [user],
        )
      ).rows;
      for (const l of leads)
        await this.add(
          c,
          tenant,
          {
            kind: 'unassigned',
            type: 'contact',
            id: l.id,
            contactId: l.id,
            title: l.name,
            key: `unassigned:${l.id}`,
          },
          s,
        );
      const cvs = (
        await c.query(
          `SELECT cv.* FROM conversations cv JOIN contacts ct ON ct.id=cv.contact_id WHERE cv.status<>'closed' AND cv.handled_by='human' AND cv.last_inbound_at<now()-make_interval(mins=>$1) AND (cv.assigned_to=$2 OR cv.assigned_to IS NULL) AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=cv.id AND m.sender_type='agent' AND NOT m.is_internal AND m.created_at>=cv.last_inbound_at) ORDER BY cv.last_inbound_at LIMIT 100`,
          [s.replyMinutes, user],
        )
      ).rows;
      for (const cv of cvs)
        await this.add(
          c,
          tenant,
          {
            kind: 'awaiting_reply',
            type: 'conversation',
            id: cv.id,
            contactId: cv.contact_id,
            title: '',
            key: `reply:${cv.id}:${new Date(cv.last_inbound_at).toISOString()}`,
            userId: cv.assigned_to,
          },
          s,
        );
      const changes = (
        await c.query(
          `SELECT a.*,ct.id AS contact_id,ct.name FROM audit_logs a JOIN contacts ct ON (a.resource_type='contacts' AND ct.id::text=a.resource_id) OR (a.resource_type='crm_deals' AND ct.id=(SELECT contact_id FROM crm_deals WHERE id::text=a.resource_id)) OR (a.resource_type='conversations' AND ct.id=(SELECT contact_id FROM conversations WHERE id::text=a.resource_id)) WHERE a.action='owner_changed' AND a.details->>'to'=$1 AND ct.archived_at IS NULL AND ct.merged_into_id IS NULL ORDER BY a.created_at DESC LIMIT 100`,
          [user],
        )
      ).rows;
      for (const a of changes)
        await this.add(
          c,
          tenant,
          {
            kind: 'assigned',
            type:
              a.resource_type === 'conversations'
                ? 'conversation'
                : a.resource_type === 'crm_deals'
                  ? 'deal'
                  : 'contact',
            id: a.resource_id,
            contactId: a.contact_id,
            title: a.name,
            key: `assigned:${a.id}`,
            userId: user,
          },
          s,
        );
    });
  }
}
