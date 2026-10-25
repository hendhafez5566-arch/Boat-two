import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { AiService } from '../ai/ai.service';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { FlowEngine, FlowGraph, FlowState, newState, OutContent, validateGraph } from './engine';
import { isAllowedSheetHost } from './engine/sheet';
import { createFlowSchema, testFlowSchema, updateFlowSchema, flowTransferSchema } from './flow-schemas';
import { localizedFlowTemplates } from './templates';
import { expandSubflows } from './expand';
import { safeHttpRequest } from './http-safe';

const LIST_COLS =
  'id, name, description, status, priority, triggers, channel_ids, published_version_id, created_at, updated_at, folder_name';

const defaultGraph = (language: 'ar' | 'en' = 'ar'): FlowGraph => ({
  startNodeId: 'start',
  nodes: [
    {
      id: 'start',
      type: 'message',
      position: { x: 80, y: 80 },
      data: {
        text: language === 'en' ? 'Hello! How can I help you?' : 'مرحباً! كيف يمكنني مساعدتك؟',
      },
      edges: { next: 'end' },
    },
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
        `SELECT f.folder_name,f.is_component,f.id, f.name, f.description, f.status, f.priority, f.triggers, f.channel_ids, f.updated_at,
                v.version AS published_version
         FROM flows f LEFT JOIN flow_versions v ON v.id = f.published_version_id
         ORDER BY f.updated_at DESC`,
      );
      return r.rows;
    });
  }

  /** إحصائيات كل خطوة: الحالة تتحدّث من webhooks التسليم (delivered/read/failed) في جدول الرسائل */
  stats(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT m.flow_node_id AS node_id,
                count(*) FILTER (WHERE m.status IN ('sent','delivered','read'))::int AS sent,
                count(*) FILTER (WHERE m.status IN ('delivered','read'))::int AS delivered,
                count(DISTINCT cv.contact_id)::int AS subscribers,
                count(*) FILTER (WHERE m.status = 'failed')::int AS errors
           FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
          WHERE m.flow_id = $1 AND m.direction = 'out' AND m.flow_node_id IS NOT NULL
          GROUP BY m.flow_node_id`,
        [id],
      );
      return Object.fromEntries(
        r.rows.map((x: { node_id: string; sent: number; delivered: number; subscribers: number; errors: number }) => [x.node_id, { sent: x.sent, delivered: x.delivered, subscribers: x.subscribers, errors: x.errors }]),
      ) as Record<string, { sent: number; delivered: number; subscribers: number; errors: number }>;
    });
  }

  /** نقرات كل زر/صف قائمة: المفتاح `${nodeId}:${optionId}` */
  buttonStats(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT node_id, option_id, count(*)::int AS clicks, count(DISTINCT contact_id)::int AS subscribers,
                count(*) FILTER (WHERE errored)::int AS errors
           FROM flow_button_clicks WHERE flow_id = $1 GROUP BY node_id, option_id`,
        [id],
      );
      return Object.fromEntries(
        r.rows.map((x: { node_id: string; option_id: string; clicks: number; subscribers: number; errors: number }) => [
          `${x.node_id}:${x.option_id}`,
          { clicks: x.clicks, subscribers: x.subscribers, errors: x.errors },
        ]),
      ) as Record<string, { clicks: number; subscribers: number; errors: number }>;
    });
  }

  get(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT f.is_component,f.id, f.name, f.description, f.status, f.priority, f.triggers, f.channel_ids, f.draft_graph,
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
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      const n = (await c.query('SELECT count(*)::int AS n FROM flows')).rows[0].n;
      await this.plans.assertWithinLimit(c, 'flows', n);
      const template = input.templateId
        ? localizedFlowTemplates(input.language).find((t) => t.id === input.templateId)
        : undefined;
      if (input.templateId && !template) throw new BadRequestException('Unknown template');
      const r = await c.query(
        `INSERT INTO flows (tenant_id, name, description, draft_graph, triggers, created_by,is_component)
         VALUES ($1, $2, $3, $4, $5, $6,$7) RETURNING ${LIST_COLS}`,
        [
          tenantId,
          input.name,
          input.description ?? null,
          JSON.stringify(template?.graph ?? defaultGraph(input.language)),
          JSON.stringify([{ type: 'first_message' }]),
          userId,
          input.isComponent,
        ],
      );
      return r.rows[0];
    });
  }

  update(tenantId: string, id: string, input: z.infer<typeof updateFlowSchema>) {
    return this.db.withTenant(tenantId, async (c) => {
      const current = (await c.query('SELECT updated_at FROM flows WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!current) throw new NotFoundException('Flow not found');
      if (
        input.expectedUpdatedAt &&
        new Date(input.expectedUpdatedAt).getTime() !== new Date(current.updated_at).getTime()
      )
        throw new ConflictException('Flow changed in another editor. Reload before saving.');
      if (input.channelIds?.length) {
        const ok = await c.query(
          'SELECT count(*)::int AS n FROM channels WHERE id = ANY($1::uuid[])',
          [input.channelIds],
        );
        if (ok.rows[0].n !== input.channelIds.length)
          throw new BadRequestException('Unknown channel id');
      }
      const r = await c.query(
        `UPDATE flows SET
           name = COALESCE($2, name),
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           priority = COALESCE($5, priority),
           triggers = COALESCE($6::jsonb, triggers),
           channel_ids = COALESCE($7::uuid[], channel_ids),
           draft_graph = COALESCE($8::jsonb, draft_graph),
           folder_name = CASE WHEN $9::boolean THEN $10::text ELSE folder_name END,
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
          input.folderName !== undefined,
          input.folderName ?? null,
        ],
      );
      if (!r.rows[0]) throw new NotFoundException('Flow not found');
      return r.rows[0];
    });
  }

  validate(graph: FlowGraph) {
    return validateGraph(graph);
  }

  async exportFlow(tenantId: string, id: string) {
    const flow = await this.get(tenantId, id);
    return flowTransferSchema.parse({ format: 'boat-two-flow', version: 1, name: flow.name, description: flow.description, graph: flow.draft_graph, triggers: flow.triggers });
  }

  async importFlow(tenantId: string, userId: string, input: z.infer<typeof flowTransferSchema>) {
    const graph = input.graph as FlowGraph;
    const { errors } = validateGraph(graph);
    if (errors.length) throw new BadRequestException({ code:'FLOW_INVALID', errors });
    return this.db.withTenant(tenantId, async () => {
      const flow = await this.create(tenantId, userId, { language:'ar', isComponent:false, name:input.name, description:input.description ?? undefined });
      await this.update(tenantId, flow.id, { graph:input.graph, triggers:input.triggers });
      return this.get(tenantId, flow.id);
    });
  }

  publish(tenantId: string, userId: string, id: string, expected?: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const f = (
        await c.query(
          'SELECT updated_at,draft_graph, triggers, channel_ids FROM flows WHERE id = $1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!f) throw new NotFoundException('Flow not found');
      if (expected && new Date(expected).getTime() !== new Date(f.updated_at).getTime())
        throw new ConflictException('Draft changed before publishing');

      const expanded = await this.expand(tenantId, f.draft_graph, id);
      const { errors, warnings } = validateGraph(expanded);
      if (!(f.triggers ?? []).length)
        errors.push({ message: 'Add at least one trigger before publishing' });
      if (errors.length) throw new BadRequestException({ code: 'FLOW_INVALID', errors, warnings });

      const version = (
        await c.query(
          'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM flow_versions WHERE flow_id = $1',
          [id],
        )
      ).rows[0].v;
      const v = (
        await c.query(
          `INSERT INTO flow_versions (tenant_id, flow_id, version, graph, triggers, channel_ids, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, version`,
          [
            tenantId,
            id,
            version,
            JSON.stringify(expanded),
            JSON.stringify(f.triggers),
            f.channel_ids,
            userId,
          ],
        )
      ).rows[0];
      await c.query(
        "UPDATE flows SET status = 'published', published_version_id = $2, updated_at = now() WHERE id = $1",
        [id, v.id],
      );
      return { published: true, version: v.version, warnings };
    });
  }

  unpublish(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        "UPDATE flows SET status = 'draft', published_version_id = NULL, updated_at = now() WHERE id = $1",
        [id],
      );
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
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
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

  private expand(tenantId: string, graph: FlowGraph, id: string) {
    return expandSubflows(
      graph,
      (ref) =>
        this.db.withTenant(tenantId, async (c) => {
          const row = (
            await c.query(
              "SELECT v.graph FROM flows f JOIN flow_versions v ON v.id=f.published_version_id WHERE f.id=$1 AND f.is_component AND f.status='published'",
              [ref],
            )
          ).rows[0];
          if (!row)
            throw new BadRequestException(
              'Referenced component must be published in this workspace',
            );
          return row.graph;
        }),
      [id],
    );
  }

  templates(language: 'ar' | 'en' = 'ar') {
    return localizedFlowTemplates(language).map(({ id, name, description, graph }) => ({
      id,
      name,
      description,
      nodeCount: graph.nodes.length,
    }));
  }

  versions(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      if (!(await c.query('SELECT 1 FROM flows WHERE id=$1', [id])).rowCount)
        throw new NotFoundException('Flow not found');
      return (
        await c.query(
          'SELECT id, version, created_at FROM flow_versions WHERE flow_id=$1 ORDER BY version DESC LIMIT 100',
          [id],
        )
      ).rows;
    });
  }

  restore(tenantId: string, id: string, versionId: string, expected?: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const current = (await c.query('SELECT updated_at FROM flows WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!current) throw new NotFoundException('Flow not found');
      if (expected && new Date(expected).getTime() !== new Date(current.updated_at).getTime())
        throw new ConflictException('Draft changed before restoration');
      const v = (
        await c.query(
          'SELECT graph, triggers, channel_ids FROM flow_versions WHERE flow_id=$1 AND id=$2',
          [id, versionId],
        )
      ).rows[0];
      if (!v) throw new NotFoundException('Version not found');
      return (
        await c.query(
          `UPDATE flows SET draft_graph=$2, triggers=$3, channel_ids=$4, updated_at=now() WHERE id=$1 RETURNING updated_at`,
          [id, JSON.stringify(v.graph), JSON.stringify(v.triggers), v.channel_ids],
        )
      ).rows[0];
    });
  }

  /** محاكاة بدون إرسال فعلي: العميل يعيد state في كل دور لمحادثة تجريبية متعددة الخطوات */
  async test(tenantId: string, id: string, input: z.infer<typeof testFlowSchema>) {
    const flow = await this.get(tenantId, id);
    const graph = await this.expand(tenantId, flow.draft_graph as FlowGraph, id);
    const state = (input.state as FlowState | undefined) ?? newState();
    const transcript: { role: 'bot' | 'system'; content: OutContent | string }[] = [];
    const attrs: Record<string, unknown> = { ...(input.contactAttributes ?? {}) };

    const engine = new FlowEngine(graph, {
      executeButtonAction: async (action, occurrence) => {
        if (action.type === 'set_field') attrs[action.key] = action.value;
        transcript.push({ role: 'system', content: `MOCK action ${occurrence}: ${JSON.stringify(action)} — no external delivery or database change` });
      },
      ai: async (req) => {
        const r = await this.ai.playground(tenantId, req.text);
        transcript.push({
          role: 'system',
          content: `AI${r.sources.length ? ` (sources: ${r.sources.map((x) => x.title).join(', ')})` : ''}${r.reason ? ` [${r.reason}]` : ''}`,
        });
        return { text: r.text, handoff: r.handoff, failed: r.failed };
      },
      send: async (content) => void transcript.push({ role: 'bot', content }),
      http: async (spec) => {
        // قراءة Google Sheet العام GET فقط ومن مضيف Google فقط، فنسمح بها في وضع التجربة ليرى المستخدم النتيجة الحقيقية
        let sheetRead = false;
        try {
          sheetRead = spec.method === 'GET' && isAllowedSheetHost(new URL(spec.url).hostname);
        } catch {
          /* رابط غير صالح: يتبع مسار التخطي */
        }
        if (!input.allowHttp && !sheetRead) {
          transcript.push({
            role: 'system',
            content: `HTTP ${spec.method} ${spec.url} (skipped in test mode)`,
          });
          return { status: 200, ok: true, body: {} };
        }
        return safeHttpRequest(spec);
      },
      setContactAttribute: async (k, v) => void (attrs[k] = v),
      updateTags: async ({ add, remove }) =>
        void transcript.push({
          role: 'system',
          content: `Tags +[${add.join(', ')}] -[${remove.join(', ')}]`,
        }),
      addNote: async (body) => void transcript.push({ role: 'system', content: `Internal note: ${body}` }),
      handoff: async () =>
        void transcript.push({ role: 'system', content: 'Handed off to a human agent' }),
      closeConversation: async () =>
        void transcript.push({ role: 'system', content: 'Conversation closed' }),
      now: () => input.simulateAt ? new Date(input.simulateAt) : new Date(),
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
