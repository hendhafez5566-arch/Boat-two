/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { evaluateRule } from '../flows/engine/conditions';
import { isValidTimezone } from '../flows/engine/hours';
import { getPath } from '../flows/engine/text';
import { MessageContent, validateOutbound } from '../messaging/message-content';
import { MessagingService } from '../messaging/messaging.service';
import { PlansService } from '../plans/plans.service';
import { computeNextRun } from './schedule';
import { SequenceStep, sequenceSchema } from './sequences.schemas';

@Injectable()
export class SequencesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SequencesService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly messaging: MessagingService,
    private readonly plans: PlansService,
  ) {}

  /** الوسوم المستخدمة فعلاً على جهات الاتصال مع عدد كل وسم (تُستخدم في شاشة الشرط) */
  async labels(tenantId: string): Promise<{ label: string; contacts: number }[]> {
    const r = await this.db.withTenant(tenantId, (c) =>
      c.query(
        `SELECT t AS label, count(*)::int AS contacts
           FROM contacts, unnest(tags) t
          WHERE archived_at IS NULL AND merged_into_id IS NULL
          GROUP BY t ORDER BY count(*) DESC, t LIMIT 500`,
      ),
    );
    return r.rows;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 10000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------------ CRUD

  list(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) =>
      (
        await c.query(
          `SELECT s.id, s.name, s.status, s.channel_id, ch.name AS channel_name, s.timezone, s.delivery_time,
                  s.stop_on_reply, jsonb_array_length(s.steps) AS step_count, s.updated_at,
                  (SELECT count(*)::int FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'active') AS active,
                  (SELECT count(*)::int FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'completed') AS completed
             FROM sequences s JOIN channels ch ON ch.id = s.channel_id ORDER BY s.created_at DESC LIMIT 200`,
        )
      ).rows,
    );
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.withTenant(tenantId, async (c) => (await c.query('SELECT * FROM sequences WHERE id = $1', [id])).rows[0]);
    if (!row) throw new NotFoundException('Sequence not found');
    return row;
  }

  private validate(input: z.infer<typeof sequenceSchema>) {
    if (!isValidTimezone(input.timezone)) throw new BadRequestException({code: 'VALIDATION', issues: [{path: ['timezone'], message: 'اختر منطقة زمنية صحيحة مثل Africa/Cairo'}]});
    const ids = new Set<string>();
    for (const s of input.steps) {
      if (ids.has(s.id)) throw new BadRequestException({code: 'VALIDATION', issues: [{path: ['steps', input.steps.indexOf(s)], message: 'توجد خطوة مكررة؛ احذف النسخة المكررة وأضف خطوة جديدة'}]});
      ids.add(s.id);
      try {
        validateOutbound(s.content as MessageContent);
        if (!s.content.template && !s.content.media && !s.content.location && !String(s.content.text || '').trim())
          throw new BadRequestException('Empty message');
      } catch {
        throw new BadRequestException({code: 'VALIDATION', issues: [{path: ['steps', input.steps.indexOf(s), 'content'], message: 'راجع محتوى الرسالة: أدخل نصًا أو قالبًا أو مرفقًا صالحًا، والتزم بحدود أزرار وقوائم القناة'}]});
      }
    }
  }

  async create(tenantId: string, input: z.infer<typeof sequenceSchema>) {
    this.validate(input);
    return this.db.withTenant(tenantId, async (c) => {
      const ch = (await c.query('SELECT type FROM channels WHERE id = $1', [input.channelId])).rows[0];
      if (!ch) throw new BadRequestException({code:'VALIDATION', issues:[{path:['channelId'],message:'القناة غير متاحة؛ اختر قناة أخرى من قنوات الشركة'}]});
      if (!['whatsapp','facebook','instagram'].includes(ch.type)) throw new BadRequestException({code:'VALIDATION', issues:[{path:['channelId'],message:'التسلسلات تحتاج قناة واتساب أو ماسنجر أو إنستغرام؛ قناة الموقع غير مؤهلة'}]});
      return (
        await c.query(
          `INSERT INTO sequences (tenant_id, name, channel_id, timezone, delivery_time, stop_on_reply, steps)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [tenantId, input.name, input.channelId, input.timezone, input.deliveryTime ?? null, input.stopOnReply, JSON.stringify(input.steps)],
        )
      ).rows[0];
    });
  }

  async update(tenantId: string, id: string, input: z.infer<typeof sequenceSchema>) {
    this.validate(input);
    return this.db.withTenant(tenantId, async (c) => {
      const existing = (await c.query('SELECT channel_id FROM sequences WHERE id=$1', [id])).rows[0];
      if (!existing) throw new NotFoundException('Sequence not found');
      if (input.channelId !== existing.channel_id) throw new BadRequestException({code:'VALIDATION',issues:[{path:['channelId'],message:'لا يمكن تغيير قناة التسلسل بعد إنشائه؛ أنشئ تسلسلاً جديدًا للقناة الأخرى'}]});
      const row = (
        await c.query(
          `UPDATE sequences SET name=$2, timezone=$3, delivery_time=$4, stop_on_reply=$5, steps=$6, updated_at=now()
            WHERE id=$1 RETURNING *`,
          [id, input.name, input.timezone, input.deliveryTime ?? null, input.stopOnReply, JSON.stringify(input.steps)],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Sequence not found');
      return row;
    });
  }

  async setStatus(tenantId: string, id: string, status: 'active' | 'paused') {
    return this.db.withTenant(tenantId, async (c) => {
      const s = (await c.query('SELECT steps FROM sequences WHERE id=$1', [id])).rows[0];
      if (!s) throw new NotFoundException('Sequence not found');
      if (status === 'active' && !(s.steps ?? []).length) throw new BadRequestException('Add at least one step first');
      await c.query('UPDATE sequences SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
      return { id, status };
    });
  }

  async remove(tenantId: string, id: string) {
    await this.db.withTenant(tenantId, (c) => c.query('DELETE FROM sequences WHERE id=$1', [id]));
    return { ok: true };
  }

  /** Per-step statistics: sequence messages are tagged with flow_id = sequence id and flow_node_id = step id */
  stats(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT m.flow_node_id AS step_id,
                count(*) FILTER (WHERE m.status IN ('sent','delivered','read'))::int AS sent,
                count(*) FILTER (WHERE m.status IN ('delivered','read'))::int AS delivered,
                count(DISTINCT cv.contact_id)::int AS subscribers,
                count(*) FILTER (WHERE m.status = 'failed')::int AS errors
           FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
          WHERE m.flow_id = $1 AND m.direction = 'out' AND m.flow_node_id IS NOT NULL GROUP BY m.flow_node_id`,
        [id],
      );
      return Object.fromEntries(r.rows.map((x: any) => [x.step_id, x]));
    });
  }

  // ------------------------------------------------------------------ enrollment

  async enroll(tenantId: string, sequenceId: string, contactId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const s = (await c.query('SELECT * FROM sequences WHERE id=$1', [sequenceId])).rows[0];
      if (!s) throw new NotFoundException('Sequence not found');
      if (s.status !== 'active') throw new BadRequestException('Sequence is not active');
      const steps = s.steps as SequenceStep[];
      if (!steps.length) throw new BadRequestException('Sequence has no steps');
      const linked = await c.query('SELECT 1 FROM contact_channels WHERE contact_id=$1 AND channel_id=$2', [contactId, s.channel_id]);
      if (!linked.rowCount) throw new BadRequestException('Contact is not reachable on the sequence channel');
      const next = computeNextRun(new Date(), steps[0], s.timezone, s.delivery_time);
      const r = await c.query(
        `INSERT INTO sequence_enrollments (tenant_id, sequence_id, contact_id, next_run_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (sequence_id, contact_id) DO UPDATE
           SET status='active', step_index=0, next_run_at=EXCLUDED.next_run_at, stop_reason=NULL, last_error=NULL, lease_until=NULL, updated_at=now()
           WHERE sequence_enrollments.status <> 'active'
         RETURNING id`,
        [tenantId, sequenceId, contactId, next],
      );
      return { enrolled: !!r.rowCount, nextRunAt: next };
    });
  }

  async stopForContact(tenantId: string, sequenceId: string, contactId: string, reason = 'manual') {
    await this.db.withTenant(tenantId, (c) =>
      c.query(
        "UPDATE sequence_enrollments SET status='stopped', stop_reason=$4, updated_at=now() WHERE sequence_id=$1 AND contact_id=$2 AND tenant_id=$3 AND status='active'",
        [sequenceId, contactId, tenantId, reason],
      ),
    );
  }

  @OnEvent('message.received')
  async onInbound(e: { tenantId: string; contactId: string; channelId: string }) {
    try {
      await this.db.withTenant(e.tenantId, (c) =>
        c.query(
          `UPDATE sequence_enrollments en SET status='stopped', stop_reason='replied', updated_at=now()
             FROM sequences s
            WHERE s.id = en.sequence_id AND s.stop_on_reply AND s.channel_id = $2
              AND en.contact_id = $1 AND en.status = 'active'`,
          [e.contactId, e.channelId],
        ),
      );
    } catch (err) {
      this.log.error(`Stop-on-reply failed: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ worker

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await this.db.query<{ id: string; tenant_id: string }>('SELECT * FROM sequence_claim_due($1)', [25]);
      for (const row of due.rows) {
        await this.process(row.tenant_id, row.id).catch((err) =>
          this.log.error(`Sequence step failed: ${(err as Error).message}`),
        );
      }
    } catch (err) {
      this.log.error(`Sequence tick failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async process(tenantId: string, enrollmentId: string) {
    await this.db.withTenant(tenantId, async (c) => {
      const e = (
        await c.query("SELECT * FROM sequence_enrollments WHERE id=$1 AND status='active' FOR UPDATE", [enrollmentId])
      ).rows[0];
      if (!e) return;
      const s = (await c.query('SELECT * FROM sequences WHERE id=$1', [e.sequence_id])).rows[0];
      if (!s || s.status !== 'active') {
        await c.query('UPDATE sequence_enrollments SET lease_until=NULL WHERE id=$1', [e.id]);
        return;
      }
      const steps = s.steps as SequenceStep[];
      const step = steps[e.step_index];
      const stop = (reason: string) =>
        c.query("UPDATE sequence_enrollments SET status='stopped', stop_reason=$2, lease_until=NULL, updated_at=now() WHERE id=$1", [e.id, reason]);
      if (!step) {
        await c.query("UPDATE sequence_enrollments SET status='completed', lease_until=NULL, updated_at=now() WHERE id=$1", [e.id]);
        return;
      }

      const contact = (
        await c.query('SELECT id, name, phone, email, attributes, tags, archived_at, merged_into_id FROM contacts WHERE id=$1', [e.contact_id])
      ).rows[0];
      if (!contact || contact.archived_at || contact.merged_into_id) return void (await stop('contact_unavailable'));
      const consent = await c.query("SELECT 1 FROM contact_consents WHERE contact_id=$1 AND channel_id=$2 AND status='opted_in'", [e.contact_id, s.channel_id]);
      if (!consent.rowCount) return void (await stop('no_consent'));
      const policy = (await c.query('SELECT marketing_enabled FROM channel_delivery_policy WHERE channel_id=$1', [s.channel_id])).rows[0];
      if (!policy?.marketing_enabled) return void (await stop('channel_policy'));
      const plan = await this.plans.getTenantPlan(c);
      if (!plan.features.broadcasts) return void (await stop('plan'));

      let lastError: string | null = null;
      let send = true;
      if (step.condition) {
        const ctxObj = { contact: { name: contact.name, phone: contact.phone, email: contact.email, attributes: contact.attributes ?? {}, tags: contact.tags ?? [] } };
        send = evaluateRule(
          { id: step.id, match: step.condition.match, conditions: step.condition.conditions as any },
          {
            vars: {},
            contact: ctxObj.contact,
            channelType: '',
            lastText: '',
            resolve: (p: string) => getPath(ctxObj, p),
          },
        );
      }
      if (send) {
        const conv = (
          await c.query("SELECT id FROM conversations WHERE contact_id=$1 AND channel_id=$2 AND status<>'closed' ORDER BY created_at DESC LIMIT 1", [e.contact_id, s.channel_id])
        ).rows[0];
        if (!conv) lastError = 'No active channel conversation';
        else
          try {
            await this.messaging.sendOutbound({
              tenantId,
              conversationId: conv.id,
              content: step.content as MessageContent,
              senderType: 'system',
              flow: { flowId: s.id, nodeId: step.id },
            });
          } catch (err) {
            lastError = (err as any)?.response?.code ?? (err as Error).message;
          }
      }

      const nextIdx = e.step_index + 1;
      if (nextIdx >= steps.length) {
        await c.query(
          "UPDATE sequence_enrollments SET status='completed', step_index=$2, last_error=$3, lease_until=NULL, updated_at=now() WHERE id=$1",
          [e.id, nextIdx, lastError],
        );
        return;
      }
      const nextRun = computeNextRun(new Date(), steps[nextIdx], s.timezone, s.delivery_time);
      await c.query(
        'UPDATE sequence_enrollments SET step_index=$2, next_run_at=$3, last_error=$4, lease_until=NULL, updated_at=now() WHERE id=$1',
        [e.id, nextIdx, nextRun, lastError],
      );
    });
  }
}
