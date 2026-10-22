import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { FlowEngine, FlowGraph, FlowState, newState, OutContent, validateGraph } from './engine';
import { createFlowSchema, testFlowSchema, updateFlowSchema } from './flow-schemas';
import { safeHttpRequest } from './http-safe';

const LIST_COLS = 'id, name, description, status, priority, triggers, channel_ids, published_version_id, created_at, updated_at';

const defaultGraph = (): FlowGraph => ({
  startNodeId: 'start',
  nodes: [
    { id: 'start', type: 'message', position: { x: 80, y: 80 }, data: { text: 'مرحباً! كيف يمكنني مساعدتك؟' }, edges: { next: 'end' } },
    { id: 'end', type: 'end', position: { x: 80, y: 280 }, data: {}, edges: {} },
  ],
});

@Injectable()
export class FlowsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
    private readonly ai: AiService,
  ) {}

  list(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT f.id, f.name, f.description, f.status, f.priority, f.triggers, f.channel_ids, f.updated_at,
                v.version AS published_version
         FROM flows f LEFT JOIN flow_versions v ON v.id = f.published_version_id
         ORDER BY f.updated_at DESC`,
      );
      return r.rows;
    });
  }

  get(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT f.id, f.name, f.description, f.status, f.priority, f.triggers, f.channel_ids, f.draft_graph,
                f.updated_at, v.version AS published_version
         FROM flows f LEFT JOIN flow_versions v ON v.id = f.published_version_id WHERE f.id = $1`,
        [id],
      );
      if (!r.rows[0]) throw new NotFoundException('Flow not found');
      return r.rows[0];
    });
  }

  create(tenantId: string, userId: string, input: z.infer<typeof createFlowSchema>) {
    return this.db.withTenant(tenantId, async (c) => {
      const n = (await c.query('SELECT count(*)::int AS n FROM flows')).rows[0].n;
      await this.plans.assertWithinLimit(c, 'flows', n);
      const r = await c.query(
        `INSERT INTO flows (tenant_id, name, description, draft_graph, triggers, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${LIST_COLS}`,
        [tenantId, input.name, input.description ?? null, JSON.stringify(defaultGraph()), JSON.stringify([{ type: 'first_message' }]), userId],
      );
      return r.rows[0];
    });
  }

  update(tenantId: string, id: string, input: z.infer<typeof updateFlowSchema>) {
    return this.db.withTenant(tenantId, async (c) => {
      if (input.channelIds?.length) {
        const ok = await c.query('SELECT count(*)::int AS n FROM channels WHERE id = ANY($1::uuid[])', [input.channelIds]);
        if (ok.rows[0].n !== input.channelIds.length) throw new BadRequestException('Unknown channel id');
      }
      const r = await c.query(
        `UPDATE flows SET
           name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           priority = COALESCE($5, priority),
           triggers = COALESCE($6::jsonb, triggers),
           channel_ids = COALESCE($7::uuid[], channel_ids),
           draft_graph = COALESCE($8::jsonb, draft_graph),
           updated_at = now()
         WHERE id = $1 RETURNING ${LIST_COLS}`,
        [
          id,
          input.name ?? null,
          input.description !== undefined,
          input.description ?? null,
          input.priority ?? null,
          input.triggers ? JSON.stringify(input.triggers) : null,
          input.channelIds ?? null,
          input.graph ? JSON.stringify(input.graph) : null,
        ],
      );
      if (!r.rows[0]) throw new NotFoundException('Flow not found');
      return r.rows[0];
    });
  }

  validate(graph: FlowGraph) {
    return validateGraph(graph);
  }

  publish(tenantId: string, userId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const f = (await c.query('SELECT draft_graph, triggers, channel_ids FROM flows WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!f) throw new NotFoundException('Flow not found');

      const { errors, warnings } = validateGraph(f.draft_graph);
      if (!(f.triggers ?? []).length) errors.push({ message: 'Add at least one trigger before publishing' });
      if (errors.length) throw new BadRequestException({ code: 'FLOW_INVALID', errors, warnings });

      const version = (await c.query('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM flow_versions WHERE flow_id = $1', [id])).rows[0].v;
      const v = (
        await c.query(
          `INSERT INTO flow_versions (tenant_id, flow_id, version, graph, triggers, channel_ids, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, version`,
          [tenantId, id, version, JSON.stringify(f.draft_graph), JSON.stringify(f.triggers), f.channel_ids, userId],
        )
      ).rows[0];
      await c.query("UPDATE flows SET status = 'published', published_version_id = $2, updated_at = now() WHERE id = $1", [id, v.id]);
      return { published: true, version: v.version, warnings };
    });
  }

  unpublish(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query("UPDATE flows SET status = 'draft', published_version_id = NULL, updated_at = now() WHERE id = $1", [id]);
      if (!r.rowCount) throw new NotFoundException('Flow not found');
      return { published: false };
    });
  }

  remove(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query('DELETE FROM flows WHERE id = $1', [id]);
      if (!r.rowCount) throw new NotFoundException('Flow not found');
      return { removed: true };
    });
  }

  duplicate(tenantId: string, userId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const n = (await c.query('SELECT count(*)::int AS n FROM flows')).rows[0].n;
      await this.plans.assertWithinLimit(c, 'flows', n);
      const r = await c.query(
        `INSERT INTO flows (tenant_id, name, description, priority, triggers, channel_ids, draft_graph, created_by)
         SELECT tenant_id, name || ' (copy)', description, priority, triggers, channel_ids, draft_graph, $2
         FROM flows WHERE id = $1 RETURNING ${LIST_COLS}`,
        [id, userId],
      );
      if (!r.rows[0]) throw new NotFoundException('Flow not found');
      return r.rows[0];
    });
  }

  /** محاكاة بدون إرسال فعلي: العميل يعيد state في كل دور لمحادثة تجريبية متعددة الخطوات */
  async test(tenantId: string, id: string, input: z.infer<typeof testFlowSchema>) {
    const flow = await this.get(tenantId, id);
    const graph = flow.draft_graph as FlowGraph;
    const state = (input.state as FlowState | undefined) ?? newState();
    const transcript: { role: 'bot' | 'system'; content: OutContent | string }[] = [];
    const attrs: Record<string, unknown> = {};

    const engine = new FlowEngine(graph, {
      ai: async (req) => {
        const r = await this.ai.playground(tenantId, req.text);
        transcript.push({ role: 'system', content: `AI${r.sources.length ? ` (sources: ${r.sources.map((x) => x.title).join(', ')})` : ''}${r.reason ? ` [${r.reason}]` : ''}` });
        return { text: r.text, handoff: r.handoff, failed: r.failed };
      },
      send: async (content) => void transcript.push({ role: 'bot', content }),
      http: async (spec) => {
        if (!input.allowHttp) {
          transcript.push({ role: 'system', content: `HTTP ${spec.method} ${spec.url} (skipped in test mode)` });
          return { status: 200, ok: true, body: {} };
        }
        return safeHttpRequest(spec);
      },
      setContactAttribute: async (k, v) => void (attrs[k] = v),
      handoff: async () => void transcript.push({ role: 'system', content: 'Handed off to a human agent' }),
      closeConversation: async () => void transcript.push({ role: 'system', content: 'Conversation closed' }),
      now: () => new Date(),
      random: Math.random,
    });

    const ctx = {
      contact: { name: 'Test User', phone: '+201000000000', email: null, attributes: attrs },
      channel: { type: 'test' },
      lastMessage: { text: input.text, replyId: input.replyId },
    };

    const result = !input.state
      ? await engine.start(ctx, state)
      : input.advanceDelay
        ? await engine.resumeDelay(ctx, state)
        : await engine.resume(ctx, state);

    return {
      status: result.status,
      waitKind: result.waitKind ?? null,
      error: result.error ?? null,
      state: result.state,
      transcript,
      contactAttributes: attrs,
    };
  }
}
