import { CryptoService } from '../messaging/crypto.service';
import { ExternalEffects } from '../events/external-effect';
import { estimateCost } from './cost';
import { z } from 'zod';
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
  input_schema: {
    type: 'object',
    properties: { reason: { type: 'string', description: 'Short reason for the handoff' } },
    required: ['reason'],
  },
};

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private readonly llm: LlmProvider | null = env.ANTHROPIC_API_KEY
    ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL)
    : null;

  constructor(
    private readonly db: DatabaseService,
    private readonly effects: ExternalEffects,
    private readonly plans: PlansService,
    private readonly knowledge: KnowledgeService,
    private readonly crypto: CryptoService,
  ) {}

  get configured() {
    return !!this.llm;
  }

  // ------------------------------------------------------------ settings / usage

  async getSettings(tenantId: string): Promise<AiSettings> {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query('SELECT * FROM ai_settings');
      return r.rows[0]
        ? ({
            ...DEFAULT_SETTINGS,
            ...r.rows[0],
            temperature: Number(r.rows[0].temperature),
          } as AiSettings)
        : DEFAULT_SETTINGS;
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
        [
          tenantId,
          m.enabled,
          m.auto_reply,
          m.business_name,
          m.instructions,
          m.tone,
          m.language,
          m.handoff_enabled,
          m.fallback_message,
          m.handoff_message,
          m.max_history,
          m.temperature,
        ],
      ),
    );
    return this.getSettings(tenantId);
  }

  async usage(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const plan = await this.plans.getTenantPlan(c);
      const r = await c.query(
        'SELECT replies, input_tokens, output_tokens FROM ai_usage WHERE period = $1',
        [periodStart(new Date())],
      );
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
  async replyInConversation(p: {
    tenantId: string;
    conversationId: string;
    text: string;
    extraInstructions?: string;
  }): Promise<AnswerResult> {
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
        await c.query(
          'SELECT ct.id,ct.name FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id WHERE cv.id = $1',
          [p.conversationId],
        )
      ).rows[0]?.name as string | null | undefined;
      const contactId = (
        await c.query('SELECT contact_id FROM conversations WHERE id=$1', [p.conversationId])
      ).rows[0]?.contact_id as string | undefined;
      return { rows, name, contactId };
    });
    const history: HistoryRow[] = ctx.rows.map((r) => ({
      role: r.direction === 'in' ? 'user' : 'assistant',
      text: messageToText(r.content),
    }));
    return this.answer({
      tenantId: p.tenantId,
      settings,
      history,
      question: p.text,
      extraInstructions: p.extraInstructions,
      contactName: ctx.name,
      contactId: ctx.contactId,
    });
  }

  /** رد تجريبي بدون محادثة (لوحة التجربة في الإعدادات) */
  async playground(tenantId: string, question: string) {
    const settings = await this.getSettings(tenantId);
    return this.answer({
      tenantId,
      settings: { ...settings, enabled: true },
      history: [{ role: 'user', text: question }],
      question,
    });
  }

  private fail(settings: AiSettings, reason: string, handoff = false): AnswerResult {
    return { text: settings.fallback_message, handoff, failed: true, sources: [], reason };
  }

  async answer(p: Parameters<AiService['answerLocked']>[0]): Promise<AnswerResult> {
    return this.db.withTenant(p.tenantId, async (c) => {
      await c.query('SELECT id FROM tenants FOR NO KEY UPDATE');
      return this.answerLocked(p);
    });
  }

  private async answerLocked(p: {
    tenantId: string;
    settings: AiSettings;
    history: HistoryRow[];
    question: string;
    extraInstructions?: string;
    contactName?: string | null;
    contactId?: string;
  }): Promise<AnswerResult> {
    const tenantId = p.tenantId;
    const settings = { ...p.settings };
    if (!settings.enabled) return this.fail(settings, 'ai_disabled');
    const agent = await this.db.withTenant(
      tenantId,
      async (c) =>
        (
          await c.query(
            'SELECT a.*,p.model,p.credentials_enc,p.input_microusd_per_million,p.output_microusd_per_million,p.enabled AS provider_enabled FROM ai_agents a LEFT JOIN ai_providers p ON p.id=a.provider_id WHERE a.is_default AND a.enabled LIMIT 1',
          )
        ).rows[0],
    );
    if (agent?.provider_id && !agent.provider_enabled)
      return this.fail(settings, 'agent_provider_disabled');
    const provider: LlmProvider | null = agent?.provider_enabled
      ? new AnthropicProvider(
          this.crypto.decrypt<{ apiKey: string }>(agent.credentials_enc).apiKey,
          agent.model,
        )
      : this.llm;
    if (!provider) return this.fail(settings, 'ai_not_configured');
    if (env.AI_PROVIDER_CALLS_ENABLED !== 'true')
      return this.fail(settings, 'external_services_disabled');
    if (agent?.instructions)
      settings.instructions = [settings.instructions, agent.instructions]
        .filter(Boolean)
        .join('\n');

    const usage = await this.usage(tenantId);
    if (usage.limit !== -1 && usage.replies >= usage.limit)
      return this.fail(settings, 'credits_exhausted', settings.handoff_enabled);

    const messages = toChatMessages(p.history, settings.max_history);
    if (!messages.length) return this.fail(settings, 'empty_history');

    let docs: RetrievedChunk[] = [];
    try {
      docs = await this.knowledge.search(tenantId, p.question, 6, agent?.source_ids);
    } catch (e) {
      this.log.warn(`Retrieval failed, answering without documents: ${(e as Error).message}`);
    }

    try {
      const res = await this.effects.execute(
        tenantId,
        { agent: agent?.id ?? null, question: p.question, history: p.history },
        () =>
          provider.chat({
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
            tools: [
              ...(settings.handoff_enabled &&
              (!agent || agent.allowed_tools.includes('handoff_to_human'))
                ? [HANDOFF_TOOL]
                : []),
              ...(p.contactId && agent?.allowed_tools.includes('create_followup')
                ? [
                    {
                      name: 'create_followup',
                      description:
                        'Create a follow-up task for a human agent. Never promise it is completed.',
                      input_schema: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          dueHours: { type: 'integer', minimum: 1, maximum: 720 },
                        },
                        required: ['title', 'dueHours'],
                      },
                    },
                  ]
                : []),
              ...(p.contactId && agent?.allowed_tools.includes('tag_contact')
                ? [
                    {
                      name: 'tag_contact',
                      description: 'Add a CRM classification tag to the current contact.',
                      input_schema: {
                        type: 'object',
                        properties: { tag: { type: 'string' } },
                        required: ['tag'],
                      },
                    },
                  ]
                : []),
            ],
          }),
      );
      await this.recordUsage(tenantId, res.inputTokens, res.outputTokens);
      await this.db.withTenant(tenantId, (c) =>
        c.query(
          "INSERT INTO ai_runs(tenant_id,agent_id,input_tokens,output_tokens,model,status,cost_microusd) VALUES($1,$2,$3,$4,$5,'completed',$6)",
          [
            tenantId,
            agent?.id ?? null,
            res.inputTokens,
            res.outputTokens,
            agent?.model ?? env.AI_MODEL,
            estimateCost(
              res.inputTokens,
              res.outputTokens,
              agent?.input_microusd_per_million ?? null,
              agent?.output_microusd_per_million ?? null,
            ),
          ],
        ),
      );

      let actions = 0;
      if (p.contactId && agent)
        for (const tool of res.toolCalls.slice(0, 3)) {
          if (!agent.allowed_tools.includes(tool.name)) continue;
          if (tool.name === 'create_followup') {
            const parsed = z
              .object({
                title: z.string().min(1).max(200),
                dueHours: z.number().int().min(1).max(720),
              })
              .safeParse(tool.input);
            if (parsed.success) {
              await this.db.withTenant(tenantId, (c) =>
                c.query(
                  'INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at) SELECT $1,id,$3,now()+make_interval(hours=>$4) FROM contacts WHERE id=$2',
                  [tenantId, p.contactId, parsed.data.title, parsed.data.dueHours],
                ),
              );
              actions++;
            }
          }
          if (tool.name === 'tag_contact') {
            const parsed = z
              .object({ tag: z.string().trim().min(1).max(50) })
              .safeParse(tool.input);
            if (parsed.success) {
              await this.db.withTenant(tenantId, (c) =>
                c.query(
                  'UPDATE contacts SET tags=array_append(tags,$2),updated_at=now() WHERE id=$1 AND NOT $2=ANY(tags)',
                  [p.contactId, parsed.data.tag],
                ),
              );
              actions++;
            }
          }
        }
      const handoff =
        settings.handoff_enabled &&
        (!agent || agent.allowed_tools.includes('handoff_to_human')) &&
        res.toolCalls.some((t) => t.name === 'handoff_to_human');
      const text =
        res.text ||
        (handoff
          ? settings.handoff_message
          : actions
            ? settings.language === 'en'
              ? 'Your request has been recorded for follow-up.'
              : 'تم تسجيل طلبك للمتابعة.'
            : '');
      if (!text) return this.fail(settings, 'empty_reply');
      return {
        text: text.slice(0, 3500),
        handoff,
        failed: false,
        sources: [...new Set(docs.map((d) => d.title))].map((title) => ({ title })),
      };
    } catch (e) {
      this.log.error(`LLM call failed: ${(e as Error).message}`);
      return this.fail(settings, 'provider_error');
    }
  }
}
