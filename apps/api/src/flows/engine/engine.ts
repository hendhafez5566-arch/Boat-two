/* eslint-disable @typescript-eslint/no-explicit-any */
import { evaluateRule, Operands } from './conditions';
import { isOpenNow } from './hours';
import { getPath, interpolate, interpolateValue, normalizeDigits, normalizeText, Resolver } from './text';
import {
  EngineDeps,
  EngineResult,
  FlowContext,
  FlowGraph,
  FlowNode,
  FlowState,
  HttpRequestSpec,
  MAX_HTTP_PER_RUN,
  MAX_STEPS_PER_RUN,
  MAX_TOTAL_STEPS,
  OutContent,
  optionsOf,
} from './types';

type Outcome =
  | { kind: 'goto'; handle: string }
  | { kind: 'wait' }
  | { kind: 'end'; status: 'completed' | 'handed_off' };

const UNIT_SECONDS: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const MAX_DELAY_SECONDS = 7 * 86400;

class RunError extends Error {}

export class FlowEngine {
  private readonly nodes: Map<string, FlowNode>;
  private httpCalls = 0;

  constructor(
    private readonly graph: FlowGraph,
    private readonly deps: EngineDeps,
  ) {
    this.nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  }

  /** بدء flow جديد من عقدة البداية */
  start(ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    return this.run(ctx, state, this.graph.startNodeId);
  }

  /** رد من العميل أثناء انتظار الـ flow لإجابة أو اختيار */
  async resume(ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    const w = state.waiting;
    if (!w || w.kind === 'delay') return this.finish('error', state, 'Flow is not waiting for a reply');
    const node = this.nodes.get(w.nodeId);
    if (!node) return this.finish('error', state, `Node ${w.nodeId} not found`);

    try {
      if (w.kind === 'choice') return await this.resumeChoice(node, ctx, state);
      if (w.kind === 'answer') return await this.resumeAnswer(node, ctx, state);
      return await this.resumeAi(node, ctx, state);
    } catch (e) {
      return this.finish('error', state, (e as Error).message);
    }
  }

  /** انتهاء مهلة عقدة delay */
  resumeDelay(ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    const w = state.waiting;
    if (!w || w.kind !== 'delay') return Promise.resolve(this.finish('error', state, 'Flow is not in a delay'));
    const node = this.nodes.get(w.nodeId);
    state.waiting = null;
    return this.run(ctx, state, node?.edges.next ?? null);
  }

  // ---------------------------------------------------------------- loop

  private finish(status: EngineResult['status'], state: FlowState, error?: string): EngineResult {
    const r: EngineResult = { status, state };
    if (error) r.error = error;
    if (status === 'waiting' && state.waiting) {
      r.waitKind = state.waiting.kind;
      if (state.waiting.until) r.waitUntil = new Date(state.waiting.until);
    }
    return r;
  }

  private async run(ctx: FlowContext, state: FlowState, from: string | null): Promise<EngineResult> {
    let nodeId = from;
    let steps = 0;
    this.httpCalls = 0;
    try {
      while (nodeId) {
        if (++steps > MAX_STEPS_PER_RUN || ++state.totalSteps > MAX_TOTAL_STEPS) {
          throw new RunError('Flow exceeded the maximum number of steps (possible loop)');
        }
        const node = this.nodes.get(nodeId);
        if (!node) throw new RunError(`Node ${nodeId} not found`);
        const out = await this.exec(node, ctx, state);
        if (out.kind === 'wait') return this.finish('waiting', state);
        if (out.kind === 'end') return this.finish(out.status, state);
        nodeId = node.edges[out.handle] ?? null;
      }
      state.waiting = null;
      return this.finish('completed', state);
    } catch (e) {
      return this.finish('error', state, (e as Error).message);
    }
  }

  // ---------------------------------------------------------------- helpers

  private resolver(ctx: FlowContext, state: FlowState): Resolver {
    return (path: string) => {
      if (path.startsWith('contact.')) {
        const rest = path.slice(8);
        if (rest.startsWith('attr.')) return getPath(ctx.contact.attributes, rest.slice(5));
        if (rest.startsWith('attributes.')) return getPath(ctx.contact.attributes, rest.slice(11));
        return (['name', 'phone', 'email'] as const).includes(rest as never)
          ? (ctx.contact as any)[rest]
          : undefined;
      }
      if (path === 'channel.type') return ctx.channel.type;
      if (path === 'last_message.text') return ctx.lastMessage.text;
      return getPath(state.vars, path);
    };
  }

  private operands(ctx: FlowContext, state: FlowState): Operands {
    return {
      vars: state.vars,
      contact: ctx.contact,
      channelType: ctx.channel.type,
      lastText: ctx.lastMessage.text,
      resolve: this.resolver(ctx, state),
    };
  }

  private buildContent(d: Record<string, any>, ctx: FlowContext, state: FlowState): OutContent {
    const r = this.resolver(ctx, state);
    const c: OutContent = {};
    if (d.text) c.text = interpolate(String(d.text), r);
    if (d.media?.url) {
      c.media = {
        kind: d.media.kind,
        url: interpolate(String(d.media.url), r),
        ...(d.media.caption ? { caption: interpolate(String(d.media.caption), r) } : {}),
        ...(d.media.filename ? { filename: d.media.filename } : {}),
      };
    }
    if (d.buttons?.length) c.buttons = d.buttons;
    if (d.list?.sections?.length) c.list = d.list;
    return c;
  }

  private replyText(ctx: FlowContext): string {
    return ctx.lastMessage.text ?? '';
  }

  // ---------------------------------------------------------------- resume

  private async resumeChoice(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    const d = node.data;
    const opts = optionsOf(d);
    const { replyId } = ctx.lastMessage;
    const text = this.replyText(ctx);
    const chosen =
      opts.find((o) => replyId !== undefined && o.id === replyId) ??
      opts.find((o) => normalizeText(o.title) === normalizeText(text));

    if (chosen) {
      if (d.saveReplyAs) {
        state.vars[d.saveReplyAs] = chosen.title;
        state.vars[`${d.saveReplyAs}_id`] = chosen.id;
      }
      state.waiting = null;
      return this.run(ctx, state, node.edges[`option:${chosen.id}`] ?? null);
    }

    if (node.edges.fallback) {
      if (d.saveReplyAs) state.vars[d.saveReplyAs] = text;
      state.waiting = null;
      return this.run(ctx, state, node.edges.fallback);
    }

    const retries = (state.waiting?.retries ?? 0) + 1;
    if (retries > (d.maxRetries ?? 2)) {
      state.waiting = null;
      return this.finish('completed', state);
    }
    state.waiting = { nodeId: node.id, kind: 'choice', retries };
    await this.deps.send(this.buildContent(d, ctx, state));
    return this.finish('waiting', state);
  }

  private async resumeAnswer(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    const d = node.data;
    const parsed = parseAnswer(this.replyText(ctx), d.answerType ?? 'text', d.pattern);

    if (parsed.ok) {
      state.vars[d.saveAs] = parsed.value;
      state.waiting = null;
      return this.run(ctx, state, node.edges.ok ?? null);
    }

    const retries = (state.waiting?.retries ?? 0) + 1;
    if (retries > (d.retries ?? 2)) {
      state.waiting = null;
      if (node.edges.fail) return this.run(ctx, state, node.edges.fail);
      return this.finish('completed', state);
    }
    state.waiting = { nodeId: node.id, kind: 'answer', retries };
    const r = this.resolver(ctx, state);
    await this.deps.send({ text: interpolate(String(d.errorText || d.text), r) });
    return this.finish('waiting', state);
  }

  private async resumeAi(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    const d = node.data;
    const text = this.replyText(ctx);
    const t = normalizeText(text);
    const exit = (d.exitKeywords ?? []).some((k: string) => {
      const kw = normalizeText(String(k));
      return kw && t.includes(kw);
    });
    if (exit) {
      state.waiting = null;
      return this.run(ctx, state, node.edges.done ?? null);
    }
    const turns = (state.waiting?.retries ?? 0) + 1;
    const out = await this.aiTurn(node, ctx, state, text, turns);
    if (out.kind === 'wait') return this.finish('waiting', state);
    if (out.kind === 'end') return this.finish(out.status, state);
    return this.run(ctx, state, node.edges[out.handle] ?? null);
  }

  /** دور واحد من المحادثة مع الـ AI: يرسل الرد ثم يقرر: يكمل الانتظار أو يخرج من العقدة */
  private async aiTurn(node: FlowNode, ctx: FlowContext, state: FlowState, text: string, turns: number): Promise<Outcome> {
    const d = node.data;
    const r = this.resolver(ctx, state);
    const res = await this.deps.ai({
      instructions: d.instructions ? interpolate(String(d.instructions), r) : undefined,
      text,
    });
    if (res.text) await this.deps.send({ text: res.text });
    if (d.saveAnswerAs && res.text && /^[A-Za-z_][\w]{0,40}$/.test(d.saveAnswerAs)) state.vars[d.saveAnswerAs] = res.text;
    state.waiting = null;

    if (res.failed) return { kind: 'goto', handle: 'error' };
    if (res.handoff) {
      if (node.edges.handoff) return { kind: 'goto', handle: 'handoff' };
      await this.deps.handoff({});
      return { kind: 'end', status: 'handed_off' };
    }
    const max = Math.min(Math.max(Number(d.maxTurns) || 20, 1), 50);
    if (turns >= max) return { kind: 'goto', handle: 'done' };
    state.waiting = { nodeId: node.id, kind: 'ai', retries: turns };
    return { kind: 'wait' };
  }

  // ---------------------------------------------------------------- node execution

  private async exec(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<Outcome> {
    const d = node.data;
    const r = this.resolver(ctx, state);

    switch (node.type) {
      case 'message': {
        await this.deps.send(this.buildContent(d, ctx, state));
        if (optionsOf(d).length) {
          state.waiting = { nodeId: node.id, kind: 'choice', retries: 0 };
          return { kind: 'wait' };
        }
        return { kind: 'goto', handle: 'next' };
      }

      case 'question': {
        const content = this.buildContent({ text: d.text, buttons: d.buttons }, ctx, state);
        await this.deps.send(content);
        state.waiting = { nodeId: node.id, kind: 'answer', retries: 0 };
        return { kind: 'wait' };
      }

      case 'condition': {
        const o = this.operands(ctx, state);
        for (const rule of d.rules ?? []) {
          if (evaluateRule(rule, o)) return { kind: 'goto', handle: `rule:${rule.id}` };
        }
        return { kind: 'goto', handle: 'else' };
      }

      case 'set_variable': {
        for (const a of d.assignments ?? []) {
          if (!/^[A-Za-z_][\w]{0,40}$/.test(a.name ?? '')) continue;
          if (a.operation === 'clear') {
            delete state.vars[a.name];
          } else if (a.operation === 'increment') {
            const by = Number(normalizeDigits(String(interpolateValue(String(a.value ?? '1'), r) ?? '1')));
            state.vars[a.name] = (Number(state.vars[a.name]) || 0) + (Number.isNaN(by) ? 1 : by);
          } else {
            state.vars[a.name] = interpolateValue(String(a.value ?? ''), r);
          }
        }
        return { kind: 'goto', handle: 'next' };
      }

      case 'set_attribute': {
        const value = interpolateValue(String(d.value ?? ''), r);
        await this.deps.setContactAttribute(d.key, value);
        ctx.contact.attributes[d.key] = value;
        return { kind: 'goto', handle: 'next' };
      }

      case 'delay': {
        const secs = Math.min(
          Math.max(Math.round(Number(d.amount) * (UNIT_SECONDS[d.unit] ?? 60)), 1),
          MAX_DELAY_SECONDS,
        );
        const until = new Date(this.deps.now().getTime() + secs * 1000);
        state.waiting = { nodeId: node.id, kind: 'delay', retries: 0, until: until.toISOString() };
        return { kind: 'wait' };
      }

      case 'http_request': {
        if (++this.httpCalls > MAX_HTTP_PER_RUN) throw new RunError('Too many HTTP requests in one run');
        const headers: Record<string, string> = {};
        for (const h of d.headers ?? []) if (h.key) headers[h.key] = interpolate(String(h.value ?? ''), r);
        const method = String(d.method ?? 'GET').toUpperCase();
        const spec: HttpRequestSpec = {
          method,
          url: interpolate(String(d.url), r, 'url'),
          headers,
          body: d.body && method !== 'GET' ? interpolate(String(d.body), r, 'json') : undefined,
          timeoutMs: Math.min(Number(d.timeoutMs) || 8000, 15000),
        };
        try {
          const res = await this.deps.http(spec);
          state.vars.http = { status: res.status, ok: res.ok };
          if (res.ok) {
            for (const m of d.saveAs ?? []) {
              if (m.variable && /^[A-Za-z_][\w]{0,40}$/.test(m.variable)) {
                state.vars[m.variable] = m.path ? getPath(res.body, m.path) : res.body;
              }
            }
          }
          return { kind: 'goto', handle: res.ok ? 'success' : 'error' };
        } catch (e) {
          state.vars.http = { status: 0, ok: false, error: (e as Error).message };
          return { kind: 'goto', handle: 'error' };
        }
      }

      case 'business_hours':
        return {
          kind: 'goto',
          handle: isOpenNow(this.deps.now(), d.timezone, d.schedule ?? {}) ? 'open' : 'closed',
        };

      case 'split': {
        const branches: { id: string; weight: number }[] = d.branches ?? [];
        const total = branches.reduce((s, b) => s + Math.max(Number(b.weight) || 0, 0), 0);
        if (total <= 0) throw new RunError('Split has no positive weights');
        let pick = this.deps.random() * total;
        for (const b of branches) {
          pick -= Math.max(Number(b.weight) || 0, 0);
          if (pick < 0) return { kind: 'goto', handle: `branch:${b.id}` };
        }
        return { kind: 'goto', handle: `branch:${branches[branches.length - 1].id}` };
      }

      case 'ai_reply': {
        if (d.greeting) await this.deps.send({ text: interpolate(String(d.greeting), r) });
        // لو العقدة هي بداية الـ flow، نجيب فوراً على الرسالة التي شغّلته
        const first = node.id === this.graph.startNodeId && state.totalSteps === 1;
        if (d.answerFirst !== false && first && ctx.lastMessage.text) {
          return this.aiTurn(node, ctx, state, ctx.lastMessage.text, 1);
        }
        state.waiting = { nodeId: node.id, kind: 'ai', retries: 0 };
        return { kind: 'wait' };
      }

      case 'handoff': {
        if (d.message) await this.deps.send({ text: interpolate(String(d.message), r) });
        await this.deps.handoff({ assignTo: d.assignTo || undefined });
        state.waiting = null;
        return { kind: 'end', status: 'handed_off' };
      }

      case 'end': {
        if (d.message) await this.deps.send({ text: interpolate(String(d.message), r) });
        if (d.closeConversation) await this.deps.closeConversation();
        state.waiting = null;
        return { kind: 'end', status: 'completed' };
      }

      default:
        throw new RunError(`Unknown node type: ${String((node as FlowNode).type)}`);
    }
  }
}

// ---------------------------------------------------------------- answer parsing

export function parseAnswer(
  raw: string,
  type: 'text' | 'number' | 'email' | 'phone' | 'regex',
  pattern?: string,
): { ok: true; value: string | number } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: false };
  switch (type) {
    case 'number': {
      const n = Number(normalizeDigits(text).replace(/,/g, ''));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? { ok: true, value: text.toLowerCase() } : { ok: false };
    case 'phone': {
      const p = normalizeDigits(text).replace(/[\s\-().]/g, '');
      return /^\+?\d{8,15}$/.test(p) ? { ok: true, value: p } : { ok: false };
    }
    case 'regex': {
      if (!pattern || pattern.length > 200) return { ok: false };
      try {
        return new RegExp(pattern, 'i').test(text.slice(0, 1000)) ? { ok: true, value: text } : { ok: false };
      } catch {
        return { ok: false };
      }
    }
    default:
      return { ok: true, value: text };
  }
}
