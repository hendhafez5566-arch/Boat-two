import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { pickLeastLoaded } from './assignment';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventEmitter2,
  ) {}

  async getSettings(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = (await c.query('SELECT auto_assign, max_open_per_agent FROM inbox_settings')).rows[0];
      return { auto_assign: r?.auto_assign ?? false, max_open_per_agent: r?.max_open_per_agent ?? 15 };
    });
  }

  async saveSettings(tenantId: string, s: { auto_assign?: boolean; max_open_per_agent?: number }) {
    const cur = await this.getSettings(tenantId);
    const m = { ...cur, ...s };
    await this.db.withTenant(tenantId, (c) =>
      c.query(
        `INSERT INTO inbox_settings (tenant_id, auto_assign, max_open_per_agent, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id) DO UPDATE SET auto_assign = $2, max_open_per_agent = $3, updated_at = now()`,
        [tenantId, m.auto_assign, m.max_open_per_agent],
      ),
    );
    return m;
  }

  /** أقل موظف متاح انشغالاً. يرجع null لو لا أحد متاح أو الكل وصل للحد الأقصى */
  async pickAgent(tenantId: string): Promise<string | null> {
    const { max_open_per_agent } = await this.getSettings(tenantId);
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT m.user_id, count(cv.id)::int AS open
         FROM memberships m
         LEFT JOIN conversations cv ON cv.assigned_to = m.user_id AND cv.status <> 'closed'
         WHERE m.available
         GROUP BY m.user_id`,
      );
      return pickLeastLoaded(r.rows.map((x) => ({ userId: x.user_id, open: x.open })), max_open_per_agent);
    });
  }

  /** يعيّن المحادثة تلقائياً لو الميزة مفعّلة ولم تكن معيّنة. يرجع معرّف الموظف أو null */
  async autoAssignIfEnabled(tenantId: string, conversationId: string, force = false): Promise<string | null> {
    const settings = await this.getSettings(tenantId);
    if (!settings.auto_assign && !force) return null;
    const agent = await this.pickAgent(tenantId);
    if (!agent) return null;
    const done = await this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `UPDATE conversations SET assigned_to = $2 WHERE id = $1 AND (assigned_to IS NULL OR $3::boolean) RETURNING id`,
        [conversationId, agent, force],
      );
      if (r.rowCount) {
        await c.query(
          `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, type, content, status, is_internal)
           SELECT tenant_id, id, channel_id, 'out', 'system', 'event', $2::jsonb, 'sent', true FROM conversations WHERE id = $1`,
          [conversationId, JSON.stringify({ event: 'assigned', userId: agent, auto: true })],
        );
      }
      return r.rowCount;
    });
    if (!done) return null;
    this.events.emit('conversation.updated', { tenantId, conversationId, reason: 'assigned' });
    return agent;
  }
}
