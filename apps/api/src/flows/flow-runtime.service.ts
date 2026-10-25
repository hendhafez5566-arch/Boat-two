import { SequencesService } from '../sequences/sequences.service';
import { FlowActionsService } from './flow-actions.service';
import {GoogleService} from '../integrations/google.service';
import {valuesCsv} from '../integrations/contracts';
import { ExternalEffects } from '../events/external-effect';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AiService } from '../ai/ai.service';
import { AssignmentService } from '../inbox/assignment.service';
import { DatabaseService } from '../database/database.service';
import { MessageContent } from '../messaging/message-content';
import { MessageReceivedEvent, MessagingService } from '../messaging/messaging.service';
import {
  EngineDeps,
  EngineResult,
  FlowCandidate,
  FlowContext,
  FlowEngine,
  FlowGraph,
  FlowState,
  matchFlow,
  newState,
  clickableOptions,
} from './engine';
import { safeHttpRequest } from './http-safe';

const REPLY_WAIT_HOURS = 24;

interface Loaded {
  replyWaitHours?: number;
  eventId?: string;
  tenantId: string;
  conversationId: string;
  contactId: string;
  channelId: string;
  ctx: Pick<FlowContext, 'contact' | 'channel'>;
}

@Injectable()
export class FlowRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(FlowRuntimeService.name);
  private readonly chains = new Map<string, Promise<void>>();
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly effects: ExternalEffects,
    private readonly messaging: MessagingService,
    private readonly events: EventEmitter2,
    private readonly ai: AiService,
    private readonly assignment: AssignmentService,
    private readonly sequences: SequencesService,
    private readonly actions: FlowActionsService,
    private readonly google:GoogleService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** يضمن معالجة رسائل نفس المحادثة بالترتيب (نسخة واحدة من السيرفر؛ عند التوسّع نستبدله بقفل Redis) */
  private serial(key: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.chains.set(key, tail);
    void tail.then(() => {
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return next;
  }

  // ------------------------------------------------------------------ inbound

  @OnEvent('message.received', { suppressErrors: false })
  onMessage(e: MessageReceivedEvent) {
    return this.db.conversation(e.tenantId, e.conversationId, () => this.handleMessage(e));
  }

  @OnEvent('domain.event', { suppressErrors: false })
  async onDomain(e: import('../events/events.service').DomainEvent) {
    if (!e.type.startsWith('crm.') || typeof e.payload.contactId !== 'string') return;
    const conversations = await this.db.withTenant(
      e.tenantId,
      async (c) =>
        (
          await c.query(
            "SELECT cv.*,ch.type AS channel_type FROM conversations cv JOIN channels ch ON ch.id=cv.channel_id WHERE cv.contact_id=$1 AND cv.status<>'closed' AND cv.handled_by='bot'",
            [e.payload.contactId],
          )
        ).rows,
    );
    for (const cv of conversations)
      await this.onMessage({
        tenantId: e.tenantId,
        channelId: cv.channel_id,
        channelType: cv.channel_type,
        conversationId: cv.id,
        contactId: cv.contact_id,
        messageId: e.id,
        handledBy: 'bot',
        content: { text: '' },
        eventName: e.type,
      });
  }

  private async loadConversation(c: import('pg').PoolClient, conversationId: string) {
    const r = await c.query(
      `SELECT cv.handled_by, cv.status, cv.channel_id, cv.contact_id, ch.type AS channel_type,
              ct.name, ct.phone, ct.email, ct.attributes, ct.tags
       FROM conversations cv
       JOIN channels ch ON ch.id = cv.channel_id
       JOIN contacts ct ON ct.id = cv.contact_id
       WHERE cv.id = $1`,
      [conversationId],
    );
    return r.rows[0] as
      | {
          handled_by: string;
          status: string;
          channel_id: string;
          contact_id: string;
          channel_type: string;
          name: string | null;
          phone: string | null;
          email: string | null;
          attributes: Record<string, unknown>;
          tags: string[] | null;
        }
      | undefined;
  }

  private async handleMessage(e: MessageReceivedEvent) {
    const text = e.content.reply?.title ?? e.content.text ?? e.content.media?.caption ?? '';
    const replyId = e.content.reply?.id;

    const loaded = await this.db.withTenant(e.tenantId, async (c) => {
      const conv = await this.loadConversation(c, e.conversationId);
      if (!conv || conv.handled_by !== 'bot' || conv.status === 'closed') return null;

      let session = (
        await c.query(
          "SELECT * FROM flow_sessions WHERE conversation_id = $1 AND status = 'waiting'",
          [e.conversationId],
        )
      ).rows[0];
      if (session?.expires_at && new Date(session.expires_at) < new Date()) {
        await c.query(
          "UPDATE flow_sessions SET status = 'expired', updated_at = now() WHERE id = $1",
          [session.id],
        );
        session = undefined;
      }
      if (e.eventName && session) return null;
      if (session?.wait_kind === 'delay') return null; // الـ flow في مرحلة انتظار زمني

      if (session) {
        const g = (
          await c.query('SELECT graph FROM flow_versions WHERE id = $1', [session.version_id])
        ).rows[0];
        return { conv, session, graph: g.graph as FlowGraph };
      }

      const cands = (
        await c.query(
          `SELECT f.id AS flow_id, fv.id AS version_id, f.priority, fv.triggers, fv.channel_ids, fv.graph
           FROM flows f JOIN flow_versions fv ON fv.id = f.published_version_id
           WHERE f.status = 'published' AND NOT f.is_component ORDER BY f.priority DESC, f.created_at`,
        )
      ).rows;
      const inbound = (
        await c.query(
          "SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND direction = 'in'",
          [e.conversationId],
        )
      ).rows[0].n;
      const ran = (
        await c.query('SELECT DISTINCT flow_id FROM flow_sessions WHERE conversation_id = $1', [
          e.conversationId,
        ])
      ).rows;
      return {
        conv,
        cands,
        isFirst: inbound <= 1,
        ran: new Set<string>(ran.map((r) => r.flow_id)),
      };
    });
    if (!loaded) return;

    const ctx: FlowContext = {
      contact: {
        id: loaded.conv.contact_id,
        name: loaded.conv.name,
        phone: loaded.conv.phone,
        email: loaded.conv.email,
        attributes: { ...(loaded.conv.attributes ?? {}) },
        tags: loaded.conv.tags ?? [],
      },
      channel: { id: loaded.conv.channel_id, type: loaded.conv.channel_type },
      lastMessage: { text, replyId },
    };
    const base: Loaded = {
      eventId: e.messageId,
      tenantId: e.tenantId,
      conversationId: e.conversationId,
      contactId: loaded.conv.contact_id,
      channelId: loaded.conv.channel_id,
      ctx,
    };

    if ('session' in loaded && loaded.session && loaded.graph) {
      base.replyWaitHours = loaded.graph.policy?.sessionHours;
      const clickId = await this.recordButtonClick(base, loaded.session, loaded.graph, replyId);
      const engine = new FlowEngine(loaded.graph, this.makeDeps(base, loaded.session.flow_id));
      const result = await engine.resume(ctx, loaded.session.state as FlowState);
      if (clickId && result.status === 'error') await this.markClickErrored(base.tenantId, clickId);
      await this.saveSession(base, {
        existingId: loaded.session.id,
        flowId: loaded.session.flow_id,
        versionId: loaded.session.version_id,
        result,
      });
      return;
    }

    const cands = (
      loaded as {
        cands: {
          flow_id: string;
          version_id: string;
          priority: number;
          triggers: FlowCandidate['triggers'];
          channel_ids: string[];
          graph: FlowGraph;
        }[];
      }
    ).cands;
    const match = matchFlow(
      cands.map((x) => ({
        flowId: x.flow_id,
        versionId: x.version_id,
        priority: x.priority,
        triggers: x.triggers,
        channelIds: x.channel_ids,
      })),
      {
        text,
        eventName: e.eventName,
        replyId,
        channelId: loaded.conv.channel_id,
        isFirstMessage: (loaded as { isFirst: boolean }).isFirst,
        alreadyRunFlowIds: (loaded as { ran: Set<string> }).ran,
      },
    );
    if (!match) {
      await this.autoReply(base, text);
      return;
    }

    const graph = cands.find((x) => x.version_id === match.versionId)!.graph;
    base.replyWaitHours = graph.policy?.sessionHours;
    const engine = new FlowEngine(graph, this.makeDeps(base, match.flowId));
    const result = await engine.start(ctx, newState());
    await this.saveSession(base, { flowId: match.flowId, versionId: match.versionId, result });
  }

  /** يسجّل نقرة زر/صف قائمة/اختيار سؤال لو الرد يطابق خيارًا حقيقيًا في الخطوة المنتظِرة (الردود النصية الحرة لا تُعدّ) */
  private async recordButtonClick(
    b: Loaded,
    session: { flow_id: string; state: FlowState },
    graph: FlowGraph,
    replyId: string | undefined,
  ): Promise<string | null> {
    const w = session.state?.waiting;
    if (!replyId || !w) return null;
    const node = graph.nodes.find((n) => n.id === w.nodeId);
    if (!clickableOptions(node, w).some((o) => o.id === replyId)) return null;
    try {
      const r = await this.db.withTenant(b.tenantId, (c) =>
        c.query(
          `INSERT INTO flow_button_clicks (tenant_id, flow_id, node_id, option_id, contact_id, conversation_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [b.tenantId, session.flow_id, w.nodeId, replyId, b.contactId, b.conversationId],
        ),
      );
      return r.rows[0].id as string;
    } catch (err) {
      // الإحصائية لا يجوز أن تعطّل الرد على العميل
      this.log.warn(`button click not recorded: ${(err as Error).message}`);
      return null;
    }
  }

  /** النقرة التي انتهى تنفيذ ما بعدها بخطأ في الـ flow تُحسب خطأً على هذا الزر */
  private async markClickErrored(tenantId: string, clickId: string) {
    try {
      await this.db.withTenant(tenantId, (c) =>
        c.query('UPDATE flow_button_clicks SET errored = true WHERE id = $1', [clickId]),
      );
    } catch (err) {
      this.log.warn(`click error flag not saved: ${(err as Error).message}`);
    }
  }

  /** لا يوجد سيناريو مناسب: لو "الرد التلقائي بالذكاء الاصطناعي" مفعّل يجيب الـ AI مباشرة من قاعدة المعرفة */
  private async autoReply(b: Loaded, text: string) {
    if (!text.trim()) return;
    const settings = await this.ai.getSettings(b.tenantId);
    if (!settings.enabled || !settings.auto_reply) return;
    const deps = this.makeDeps(b);
    const r = await this.ai.replyInConversation({
      tenantId: b.tenantId,
      conversationId: b.conversationId,
      text,
    });
    if (r.reason && r.failed)
      this.log.warn(`AI auto-reply fallback (${r.reason}) for conversation ${b.conversationId}`);
    if (r.text) await deps.send({ text: r.text });
    if (r.handoff) await deps.handoff({});
  }

  // ------------------------------------------------------------------ delays

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const r = await this.db.query<{ id: string; tenant_id: string; conversation_id: string }>(
        'SELECT * FROM flow_claim_due_sessions($1)',
        [20],
      );
      await Promise.all(
        r.rows.map((row) =>
          this.db
            .conversation(row.tenant_id, row.conversation_id, () =>
              this.resumeDelay(row.tenant_id, row.id),
            )
            .catch((err) => this.log.error(`Delay resume failed: ${(err as Error).message}`)),
        ),
      );
    } catch (err) {
      this.log.error(`Scheduler tick failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async resumeDelay(tenantId: string, sessionId: string) {
    const loaded = await this.db.withTenant(tenantId, async (c) => {
      const session = (
        await c.query(
          "SELECT * FROM flow_sessions WHERE id = $1 AND status = 'waiting' AND wait_kind = 'delay'",
          [sessionId],
        )
      ).rows[0];
      if (!session) return null;
      const conv = await this.loadConversation(c, session.conversation_id);
      if (!conv || conv.handled_by !== 'bot' || conv.status === 'closed') {
        await c.query(
          "UPDATE flow_sessions SET status = 'handed_off', updated_at = now() WHERE id = $1",
          [sessionId],
        );
        return null;
      }
      const g = (
        await c.query('SELECT graph FROM flow_versions WHERE id = $1', [session.version_id])
      ).rows[0];
      return { session, conv, graph: g.graph as FlowGraph };
    });
    if (!loaded) return;

    const ctx: FlowContext = {
      contact: {
        id: loaded.conv.contact_id,
        name: loaded.conv.name,
        phone: loaded.conv.phone,
        email: loaded.conv.email,
        attributes: { ...(loaded.conv.attributes ?? {}) },
        tags: loaded.conv.tags ?? [],
      },
      channel: { id: loaded.conv.channel_id, type: loaded.conv.channel_type },
      lastMessage: { text: '' },
    };
    const base: Loaded = {
      tenantId,
      replyWaitHours: loaded.graph.policy?.sessionHours,
      conversationId: loaded.session.conversation_id,
      contactId: loaded.conv.contact_id,
      channelId: loaded.conv.channel_id,
      ctx,
    };
    const engine = new FlowEngine(loaded.graph, this.makeDeps(base, loaded.session.flow_id));
    const result = await this.db.eventScope(
      `delay:${sessionId}:${loaded.session.state.totalSteps}`,
      () => engine.resumeDelay(ctx, loaded.session.state as FlowState),
    );
    await this.saveSession(base, {
      existingId: sessionId,
      flowId: loaded.session.flow_id,
      versionId: loaded.session.version_id,
      result,
    });
  }

  // ------------------------------------------------------------------ plumbing

  private makeDeps(b: Loaded, flowId?: string): EngineDeps {
    return {
      readGoogleSheet:async(connectionId,spreadsheetId,range)=>{const result=await this.google.execute(b.tenantId,connectionId,{operation:'sheet_read',spreadsheetId,range}) as {data?:{values?:unknown[][]}};return valuesCsv(result.data?.values??[]);},
      executeButtonAction: (action, occurrence) => this.actions.execute(b, action, occurrence),
      ai: async (req) => {
        const r = await this.ai.replyInConversation({
          tenantId: b.tenantId,
          conversationId: b.conversationId,
          text: req.text,
          flowId,
          extraInstructions: req.instructions,
        });
        return { text: r.text, handoff: r.handoff, failed: r.failed };
      },
      send: async (content, meta) => {
        const r = await this.messaging.sendOutbound({
          tenantId: b.tenantId,
          conversationId: b.conversationId,
          content: content as MessageContent,
          senderType: 'bot',
          ...(flowId ? { flow: { flowId, nodeId: meta?.nodeId } } : {}),
        });
        void r; // Provider delivery is tracked by the durable outbound worker.
      },
      enrollSequence: (sequenceId) => this.sequences.enroll(b.tenantId, sequenceId, b.contactId),
      http: (spec) => this.effects.execute(b.tenantId, spec, () => safeHttpRequest(spec)),
      setContactAttribute: async (key, value) => {
        const json = JSON.stringify(value ?? null);
        if (json.length > 2000) throw new Error('Attribute value too large');
        await this.db.withTenant(b.tenantId, (c) =>
          c.query(
            'UPDATE contacts SET attributes = attributes || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1',
            [b.contactId, key, json],
          ),
        );
      },
      updateTags: async ({ add, remove }) => {
        await this.db.withTenant(b.tenantId, (c) =>
          c.query(
            `UPDATE contacts SET tags = (SELECT COALESCE(array_agg(DISTINCT t), '{}') FROM unnest(tags || $2::text[]) t WHERE NOT (t = ANY($3::text[]))), updated_at = now() WHERE id = $1`,
            [b.contactId, add, remove],
          ),
        );
      },
      addNote: async (body) => {
        await this.db.withTenant(b.tenantId, (c) =>
          c.query('INSERT INTO crm_notes(tenant_id, contact_id, body) VALUES ($1, $2, $3)', [b.tenantId, b.contactId, body]),
        );
      },
      handoff: async ({ assignTo, departmentId }) => {
        if (departmentId) {
          await this.actions.assign(b, { userId: assignTo, departmentId });
          return;
        }
        await this.db.withTenant(b.tenantId, async (c) => {
          if (assignTo) {
            const ok = await c.query('SELECT 1 FROM memberships WHERE user_id = $1', [assignTo]);
            if (!ok.rowCount) assignTo = undefined;
          }
          await c.query(
            "UPDATE conversations SET handled_by = 'human', status = 'open', assigned_to = COALESCE($2::uuid, assigned_to) WHERE id = $1",
            [b.conversationId, assignTo ?? null],
          );
          await c.query(
            `INSERT INTO messages (tenant_id, conversation_id, channel_id, direction, sender_type, type, content, status, is_internal)
             SELECT tenant_id, id, channel_id, 'out', 'system', 'event', $2::jsonb, 'sent', true FROM conversations WHERE id = $1`,
            [b.conversationId, JSON.stringify({ event: 'handoff', assignedTo: assignTo ?? null })],
          );
        });
        if (!assignTo)
          await this.assignment.autoAssignIfEnabled(b.tenantId, b.conversationId).catch(() => null);
        this.events.emit('conversation.handoff', {
          tenantId: b.tenantId,
          conversationId: b.conversationId,
        });
      },
      closeConversation: async () => {
        await this.db.withTenant(b.tenantId, (c) =>
          c.query("UPDATE conversations SET status = 'closed' WHERE id = $1", [b.conversationId]),
        );
      },
      now: () => new Date(),
      random: Math.random,
    };
  }

  private async saveSession(
    b: Loaded,
    p: { existingId?: string; flowId: string; versionId: string; result: EngineResult },
  ) {
    const { result } = p;
    if (result.status === 'error') this.log.warn(`Flow ${p.flowId} errored: ${result.error}`);
    const waitKind = result.status === 'waiting' ? (result.waitKind ?? null) : null;
    const waitUntil = waitKind === 'delay' ? (result.waitUntil ?? null) : null;
    const expiresIn = waitKind && waitKind !== 'delay' ? (b.replyWaitHours ?? REPLY_WAIT_HOURS) : null;

    await this.db.withTenant(b.tenantId, async (c) => {
      if (p.existingId) {
        await c.query(
          `UPDATE flow_sessions SET status = $2, state = $3, wait_kind = $4, wait_until = $5,
             expires_at = CASE WHEN $6::int IS NULL THEN NULL ELSE now() + ($6::int || ' hours')::interval END,
             lease_until = NULL, error = $7, updated_at = now()
           WHERE id = $1`,
          [
            p.existingId,
            result.status,
            JSON.stringify(result.state),
            waitKind,
            waitUntil,
            expiresIn,
            result.error ?? null,
          ],
        );
      } else {
        await c.query(
          `INSERT INTO flow_sessions (tenant_id, flow_id, version_id, conversation_id, contact_id, status, state, wait_kind, wait_until, expires_at, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   CASE WHEN $10::int IS NULL THEN NULL ELSE now() + ($10::int || ' hours')::interval END, $11)`,
          [
            b.tenantId,
            p.flowId,
            p.versionId,
            b.conversationId,
            b.contactId,
            result.status,
            JSON.stringify(result.state),
            waitKind,
            waitUntil,
            expiresIn,
            result.error ?? null,
          ],
        );
      }
    });
  }
}
