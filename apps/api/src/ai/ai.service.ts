import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { PlansService } from '../plans/plans.service';
import { KnowledgeService, RetrievedChunk } from './knowledge/knowledge.service';
import { buildSystemPrompt, HistoryRow, messageToText, toChatMessages } from './prompt';
import { AnthropicProvider } from './providers/anthropic';
import { LlmProvider, LlmTool } from './providers/types';
import { periodStart } from './retrieval';

export interface AiSettings {
  enabled: boolean;
  auto_reply: boolean;
  business_name: string | null;
  instructions: string | null;
  tone: 'friendly' | 'professional' | 'concise';
  language: 'auto' | 'ar' | 'en';
  handoff_enabled: boolean;
  fallback_message: string;
  handoff_message: string;
  max_history: number;
  temperature: number;
}

export const DEFAULT_SETTINGS: AiSettings = {
  enabled: false,
  auto_reply: false,
  business_name: null,
  instructions: null,
  tone: 'friendly',
  language: 'auto',
  handoff_enabled: true,
  fallback_message: 'عذراً، لا أستطيع الرد الآن. سيتواصل معك أحد موظفينا قريباً.',
  handoff_message: 'سأحوّلك الآن إلى أحد موظفينا.',
  max_history: 10,
  temperature: 0.3,
};

export interface AnswerResult {
  text: string;
  handoff: boolean;
  failed: boolean;
  sources: { title: string }[];
  reason?: string;
}

const HANDOFF_TOOL: LlmTool = {
  name: 'handoff_to_human',
  description:
    'Transfer the conversation to a human agent. Use when the documents do not contain the answer, the customer asks for a human, or the customer is upset or wants to complain.',
  input_schema: { type: 'object', properties: { reason: { type: 'string', description: 'Short reason for the handoff' } }, required: ['reason'] },
};

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private readonly llm: LlmProvider | null = env.ANTHROPIC_API_KEY ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL) : null;

  constructor(
    private readonly db: DatabaseService,
    private readonly plans: PlansService,
    private readonly knowledge: KnowledgeService,
  ) {}

  get configured() {
    return !!this.llm;
  }

  // ------------------------------------------------------------ settings / usage

  async getSettings(tenantId: string): Promise<AiSettings> {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query('SELECT * FROM ai_settings');
      return r.rows[0] ? ({ ...DEFAULT_SETTINGS, ...r.rows[0], temperature: Number(r.rows[0].temperature) } as AiSettings) : DEFAULT_SETTINGS;
    });
  }

  async saveSettings(tenantId: string, s: Partial<AiSettings>) {
    const m = { ...(await this.getSettings(tenantId)), ...s };
    await this.db.withTenant(tenantId, (c) =>
      c.query(
        `INSERT INTO ai_settings (tenant_id, enabled, auto_reply, business_name, instructions, tone, language, handoff_enabled,
                                  fallback_message, handoff_message, max_history, temperature, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT (tenant_id) DO UPDATE SET enabled=$2, auto_reply=$3, business_name=$4, instructions=$5, tone=$6,
           language=$7, handoff_enabled=$8, fallback_message=$9, handoff_message=$10, max_history=$11, temperature=$12, updated_at=now()`,
        [tenantId, m.enabled, m.auto_reply, m.business_name, m.instructions, m.tone, m.language, m.handoff_enabled, m.fallback_message, m.handoff_message, m.max_history, m.temperature],
      ),
    );
    return this.getSettings(tenantId);
  }

  async usage(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const plan = await this.plans.getTenantPlan(c);
      const r = await c.query('SELECT replies, input_tokens, output_tokens FROM ai_usage WHERE period = $1', [periodStart(new Date())]);
      const limit = plan.limits.ai_credits ?? 0;
      return {
        period: periodStart(new Date()),
        replies: r.rows[0]?.replies ?? 0,
        inputTokens: Number(r.rows[0]?.input_tokens ?? 0),
        outputTokens: Number(r.rows[0]?.output_tokens ?? 0),
        limit,
        remaining: limit === -1 ? null : Math.max(limit - (r.rows[0]?.replies ?? 0), 0),
        plan: plan.plan_code,
      };
    });
  }

  private async recordUsage(tenantId: string, input: number, output: number) {
    await this.db.withTenant(tenantId, (c) =>
      c.query(
        `INSERT INTO ai_usage (tenant_id, period, replies, input_tokens, output_tokens) VALUES ($1, $2, 1, $3, $4)
         ON CONFLICT (tenant_id, period) DO UPDATE SET replies = ai_usage.replies + 1,
           input_tokens = ai_usage.input_tokens + $3, output_tokens = ai_usage.output_tokens + $4`,
        [tenantId, periodStart(new Date()), input, output],
      ),
    );
  }

  // ------------------------------------------------------------ answering

  /** رد في محادثة حقيقية: يقرأ آخر رسائلها كسياق */
  async replyInConversation(p: { tenantId: string; conversationId: string; text: string; extraInstructions?: string }): Promise<AnswerResult> {
    const settings = await this.getSettings(p.tenantId);
    const ctx = await this.db.withTenant(p.tenantId, async (c) => {
      const rows = (
        await c.query(
          `SELECT direction, sender_type, content FROM messages
           WHERE conversation_id = $1 AND sender_type <> 'system' AND is_internal = false ORDER BY seq DESC LIMIT $2`,
          [p.conversationId, settings.max_history * 2],
        )
      ).rows.reverse();
      const name = (
        await c.query('SELECT ct.name FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id WHERE cv.id = $1', [p.conversationId])
      ).rows[0]?.name as string | null | undefined;
      return { rows, name };
    });
    const history: HistoryRow[] = ctx.rows.map((r) => ({
      role: r.direction === 'in' ? 'user' : 'assistant',
      text: messageToText(r.content),
    }));
    return this.answer({ tenantId: p.tenantId, settings, history, question: p.text, extraInstructions: p.extraInstructions, contactName: ctx.name });
  }

  /** رد تجريبي بدون محادثة (لوحة التجربة في الإعدادات) */
  async playground(tenantId: string, question: string) {
    const settings = await this.getSettings(tenantId);
    return this.answer({ tenantId, settings: { ...settings, enabled: true }, history: [{ role: 'user', text: question }], question });
  }

  private fail(settings: AiSettings, reason: string, handoff = false): AnswerResult {
    return { text: settings.fallback_message, handoff, failed: true, sources: [], reason };
  }

  async answer(p: {
    tenantId: string;
    settings: AiSettings;
    history: HistoryRow[];
    question: string;
    extraInstructions?: string;
    contactName?: string | null;
  }): Promise<AnswerResult> {
    const { tenantId, settings } = p;
    if (!settings.enabled) return this.fail(settings, 'ai_disabled');
    if (!this.llm) return this.fail(settings, 'ai_not_configured');

    const usage = await this.usage(tenantId);
    if (usage.limit !== -1 && usage.replies >= usage.limit) return this.fail(settings, 'credits_exhausted', settings.handoff_enabled);

    const messages = toChatMessages(p.history, settings.max_history);
    if (!messages.length) return this.fail(settings, 'empty_history');

    let docs: RetrievedChunk[] = [];
    try {
      docs = await this.knowledge.search(tenantId, p.question, 6);
    } catch (e) {
      this.log.warn(`Retrieval failed, answering without documents: ${(e as Error).message}`);
    }

    try {
      const res = await this.llm.chat({
        system: buildSystemPrompt({
          businessName: settings.business_name,
          instructions: settings.instructions,
          extraInstructions: p.extraInstructions,
          language: settings.language,
          tone: settings.tone,
          handoffEnabled: settings.handoff_enabled,
          docs: docs.map((d) => ({ title: d.title, content: d.content })),
          contactName: p.contactName,
        }),
        messages,
        maxTokens: 600,
        temperature: settings.temperature,
        tools: settings.handoff_enabled ? [HANDOFF_TOOL] : undefined,
      });
      await this.recordUsage(tenantId, res.inputTokens, res.outputTokens);

      const handoff = settings.handoff_enabled && res.toolCalls.some((t) => t.name === 'handoff_to_human');
      const text = res.text || (handoff ? settings.handoff_message : '');
      if (!text) return this.fail(settings, 'empty_reply');
      return { text: text.slice(0, 3500), handoff, failed: false, sources: [...new Set(docs.map((d) => d.title))].map((title) => ({ title })) };
    } catch (e) {
      this.log.error(`LLM call failed: ${(e as Error).message}`);
      return this.fail(settings, 'provider_error');
    }
  }
}
