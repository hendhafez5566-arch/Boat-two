/* eslint-disable @typescript-eslint/no-explicit-any */
import { evaluateRule, Operands } from './conditions';
import { isOpenNow } from './hours';
import { isAllowedSheetHost, lookupRow, parseCsv, parseSheetUrl } from './sheet';
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
  ButtonAction,
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

  private curNode?: string;
  private send(content: OutContent) {
    return this.deps.send(content, { nodeId: this.curNode });
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
    // Action configuration is private: only provider-supported fields leave the engine.
    if (d.buttons?.length) c.buttons = d.buttons.map((b: any) => ({ id: b.id, title: b.title }));
    if (d.list?.sections?.length) c.list = { buttonText: d.list.buttonText, sections: d.list.sections.map((s: any) => ({ ...(s.title ? { title: s.title } : {}), rows: s.rows.map((b: any) => ({ id: b.id, title: b.title, ...(b.description ? { description: b.description } : {}) })) })) };
    return c;
  }

  private sheetGet(url: string) {
    if (++this.httpCalls > MAX_HTTP_PER_RUN) throw new RunError('Too many HTTP requests in one run');
    return this.deps.http({ method: 'GET', url, headers: { Accept: 'text/csv' }, timeoutMs: 10000 });
  }

  private replyText(ctx: FlowContext): string {
    return ctx.lastMessage.text ?? '';
  }

  // ---------------------------------------------------------------- resume

  private async resumeChoice(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    this.curNode = node.id;
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
      const handedOff = await this.executeActions(chosen.actions, `${node.id}:option:${chosen.id}`, ctx, state);
      state.waiting = null;
      if (handedOff) return this.finish('handed_off', state);
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
    await this.send(this.buildContent(d, ctx, state));
    return this.finish('waiting', state);
  }

  private async executeActions(actions: ButtonAction[] | undefined, occurrence: string, ctx: FlowContext, state: FlowState) {
    if (!actions?.length) return false;
    if (!this.deps.executeButtonAction) throw new RunError('Button action executor unavailable');
    if (actions.length > 20) throw new RunError('Too many button actions');
    let handedOff = false;
    for (const [index, raw] of actions.entries()) {
      const resolve = this.resolver(ctx, state);
      const action = raw.type === 'set_field' ? { ...raw, value: interpolate(raw.value, resolve) }
        : raw.type === 'webhook' ? { ...raw, body: interpolate(raw.body, resolve) } : raw;
      await this.deps.executeButtonAction(action, `${occurrence}:${index}`);
      if (action.type === 'set_field') ctx.contact.attributes[action.key] = action.value;
      if (action.type === 'tag') ctx.contact.tags = [...new Set([...(ctx.contact.tags ?? []), ...action.add])].filter(t => !action.remove.includes(t));
      if (action.type === 'assign') handedOff = true;
    }
    return handedOff;
  }

  /** يرسل سؤال user_input رقم step: أزرار (≤3 اختيارات) أو قائمة (حتى 10) أو نص */
  private async askUserInput(node: FlowNode, ctx: FlowContext, state: FlowState, step: number) {
    const q = node.data.questions[step];
    const o: { id: string; title: string }[] = q.kind === 'choice' ? q.options ?? [] : [];
    const content = this.buildContent(
      {
        text: q.text,
        ...(o.length && o.length <= 3 ? { buttons: o } : {}),
        ...(o.length > 3 ? { list: { buttonText: 'اختر', sections: [{ rows: o.map((x) => ({ id: x.id, title: x.title })) }] } } : {}),
      },
      ctx,
      state,
    );
    await this.send(content);
    state.waiting = { nodeId: node.id, kind: 'answer', retries: state.waiting?.retries ?? 0, step };
  }

  private async resumeUserInput(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    this.curNode = node.id;
    const qs: any[] = node.data.questions ?? [];
    const step = state.waiting?.step ?? 0;
    const q = qs[step];
    if (!q) {
      state.waiting = null;
      return this.finish('completed', state);
    }
    const text = this.replyText(ctx);
    let value: string | number | undefined;
    if (q.kind === 'choice') {
      const { replyId } = ctx.lastMessage;
      const o: { id: string; title: string }[] = q.options ?? [];
      const hit =
        o.find((x) => replyId !== undefined && x.id === replyId) ?? o.find((x) => normalizeText(x.title) === normalizeText(text));
      if (hit) {
        value = hit.title;
        state.vars[`${q.saveAs}_id`] = hit.id;
      }
    } else {
      const parsed = parseAnswer(text, q.kind, undefined);
      if (parsed.ok) value = parsed.value;
    }

    if (value === undefined) {
      const retries = (state.waiting?.retries ?? 0) + 1;
      if (retries > (q.retries ?? 2)) {
        state.waiting = null;
        return this.finish('completed', state);
      }
      state.waiting = { nodeId: node.id, kind: 'answer', retries, step };
      if (q.errorText) await this.send({ text: interpolate(String(q.errorText), this.resolver(ctx, state)) });
      return this.askAgain(node, ctx, state, step);
    }

    state.vars[q.saveAs] = value;
    await this.deps.setContactAttribute(q.saveAs, value);
    ctx.contact.attributes[q.saveAs] = value;
    if (step + 1 < qs.length) {
      state.waiting = { nodeId: node.id, kind: 'answer', retries: 0, step: step + 1 };
      await this.askUserInput(node, ctx, state, step + 1);
      return this.finish('waiting', state);
    }
    state.waiting = null;
    const handedOff = await this.executeActions(node.data.completionActions, `${node.id}:complete`, ctx, state);
    const done = interpolate(String(node.data.doneText ?? ''), this.resolver(ctx, state)).trim();
    if (done) await this.send({ text: done });
    if (handedOff) return this.finish('handed_off', state);
    return this.run(ctx, state, node.edges.next ?? null);
  }

  private async askAgain(node: FlowNode, ctx: FlowContext, state: FlowState, step: number): Promise<EngineResult> {
    await this.askUserInput(node, ctx, state, step);
    return this.finish('waiting', state);
  }

  private async resumeAnswer(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    if (node.type === 'user_input') return this.resumeUserInput(node, ctx, state);
    this.curNode = node.id;
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
    await this.send({ text: interpolate(String(d.errorText || d.text), r) });
    return this.finish('waiting', state);
  }

  private async resumeAi(node: FlowNode, ctx: FlowContext, state: FlowState): Promise<EngineResult> {
    this.curNode = node.id;
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
    if (res.text) await this.send({ text: res.text });
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
    this.curNode = node.id;
    const d = node.data;
    const r = this.resolver(ctx, state);

    switch (node.type) {
      case 'interactive':
      case 'message': {
        await this.send(this.buildContent(d, ctx, state));
        if (optionsOf(d).length) {
          state.waiting = { nodeId: node.id, kind: 'choice', retries: 0 };
          return { kind: 'wait' };
        }
        return { kind: 'goto', handle: 'next' };
      }

      case 'location': {
        const lat = Number(normalizeDigits(String(interpolateValue(String(d.lat ?? ''), r) ?? '')));
        const lng = Number(normalizeDigits(String(interpolateValue(String(d.lng ?? ''), r) ?? '')));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
          return { kind: 'goto', handle: 'next' };
        await this.send({
          location: {
            lat,
            lng,
            ...(d.name ? { name: interpolate(String(d.name), r) } : {}),
            ...(d.address ? { address: interpolate(String(d.address), r) } : {}),
          },
        });
        return { kind: 'goto', handle: 'next' };
      }

      case 'cta_url': {
        const content = this.buildContent({ text: d.text, media: d.imageUrl ? { kind: 'image', url: d.imageUrl } : undefined }, ctx, state);
        content.cta = { text: String(d.buttonText), url: interpolate(String(d.url), r) };
        await this.send(content);
        return { kind: 'goto', handle: 'next' };
      }

      case 'template': {
        const hdr = d.header;
        await this.send({
          template: {
            name: String(d.name),
            language: String(d.language || 'ar'),
            bodyParams: (d.bodyParams ?? []).map((x: string) => interpolate(String(x), r)),
            ...(hdr?.type === 'text'
              ? { header: { type: 'text' as const, text: interpolate(String(hdr.text), r) } }
              : hdr?.url
                ? { header: { type: hdr.type, url: interpolate(String(hdr.url), r), ...(hdr.filename ? { filename: hdr.filename } : {}) } }
                : {}),
          },
        });
        return { kind: 'goto', handle: 'next' };
      }

      case 'sequence': {
        if (d.sequenceId && this.deps.enrollSequence) {
          try {
            await this.deps.enrollSequence(String(d.sequenceId));
          } catch {
            /* لا نوقف المحادثة إذا فشل التسجيل (مثلاً بدون موافقة تسويقية) */
          }
        }
        return { kind: 'goto', handle: 'next' };
      }

      case 'image':
      case 'audio':
      case 'video':
      case 'file': {
        const url = interpolate(String(d.url ?? ''), r).trim();
        if (!url) return { kind: 'goto', handle: 'next' };
        await this.send({
          media: {
            kind: node.type,
            url,
            // الصوت لا يدعم تعليقًا في واتساب
            ...(d.caption && node.type !== 'audio' ? { caption: interpolate(String(d.caption), r) } : {}),
            ...(node.type === 'file' && d.filename ? { filename: String(d.filename).slice(0, 200) } : {}),
          },
        });
        return { kind: 'goto', handle: 'next' };
      }

      case 'user_input': {
        const qs: any[] = d.questions ?? [];
        if (!qs.length) return { kind: 'goto', handle: 'next' };
        state.waiting = { nodeId: node.id, kind: 'answer', retries: 0, step: 0 };
        await this.askUserInput(node, ctx, state, 0);
        return { kind: 'wait' };
      }

      case 'question': {
        const content = this.buildContent({ text: d.text, buttons: d.buttons }, ctx, state);
        await this.send(content);
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

      case 'tag': {
        const clean = (list: unknown) =>
          [...new Set((Array.isArray(list) ? list : []).map((x) => interpolate(String(x ?? ''), r).trim()).filter(Boolean))]
            .map((x) => x.slice(0, 40))
            .slice(0, 10);
        const add = clean(d.add);
        const remove = clean(d.remove).filter((x) => !add.includes(x));
        if (add.length || remove.length) {
          await this.deps.updateTags({ add, remove });
          const now = new Set([...(ctx.contact.tags ?? []), ...add]);
          for (const x of remove) now.delete(x);
          ctx.contact.tags = [...now];
        }
        return { kind: 'goto', handle: 'next' };
      }

      case 'note': {
        const body = interpolate(String(d.body ?? ''), r).trim().slice(0, 2000);
        if (body) await this.deps.addNote(body);
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

      case 'sheet_fetch': {
        const ref = parseSheetUrl(String(d.url ?? ''));
        if (!ref) {
          state.vars.sheet = { found: false, error: 'Invalid Google Sheet link' };
          return { kind: 'goto', handle: 'error' };
        }
        try {
          let url = ref.csvUrl;
          let res = await this.sheetGet(url);
          for (let hop = 0; hop < 2 && res.status >= 300 && res.status < 400; hop++) {
            const loc = res.headers?.location;
            const next = new URL(String(Array.isArray(loc) ? loc[0] : loc ?? ''), url);
            if (next.protocol !== 'https:' || !isAllowedSheetHost(next.hostname)) throw new Error('Sheet is not public');
            url = next.toString();
            res = await this.sheetGet(url);
          }
          const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? '');
          if (!res.ok || /^\s*</.test(text)) throw new Error('Sheet is not public or was not found');
          const found = lookupRow(
            parseCsv(text),
            String(d.lookupColumn ?? ''),
            interpolate(String(d.lookupValue ?? ''), r),
          );
          if (!found.row) {
            state.vars.sheet = { found: false, total: found.total };
            return { kind: 'goto', handle: 'not_found' };
          }
          for (const m of d.saveAs ?? []) {
            if (m.variable && /^[A-Za-z_][\w]{0,40}$/.test(m.variable))
              state.vars[m.variable] = found.row[String(m.column ?? '').trim()] ?? '';
          }
          state.vars.sheet = { found: true, index: found.index, total: found.total, row: found.row };
          return { kind: 'goto', handle: 'found' };
        } catch (e) {
          state.vars.sheet = { found: false, error: (e as Error).message };
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

      case 'random_number': {
        const lo = Math.ceil(Number(d.min));
        const hi = Math.floor(Number(d.max));
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw new RunError('Random number range is invalid');
        if (!/^[A-Za-z_][\w]{0,40}$/.test(d.saveAs ?? '')) throw new RunError('Random number variable name is invalid');
        // inclusive on both ends; random() is in [0,1)
        state.vars[d.saveAs] = lo + Math.min(Math.floor(this.deps.random() * (hi - lo + 1)), hi - lo);
        return { kind: 'goto', handle: 'next' };
      }

      case 'ai_reply': {
        if (d.greeting) await this.send({ text: interpolate(String(d.greeting), r) });
        // لو العقدة هي بداية الـ flow، نجيب فوراً على الرسالة التي شغّلته
        const first = node.id === this.graph.startNodeId && state.totalSteps === 1;
        if (d.answerFirst !== false && first && ctx.lastMessage.text) {
          return this.aiTurn(node, ctx, state, ctx.lastMessage.text, 1);
        }
        state.waiting = { nodeId: node.id, kind: 'ai', retries: 0 };
        return { kind: 'wait' };
      }

      case 'handoff': {
        if (d.message) await this.send({ text: interpolate(String(d.message), r) });
        await this.deps.handoff({ assignTo: d.assignTo || undefined, departmentId: d.departmentId || undefined });
        state.waiting = null;
        return { kind: 'end', status: 'handed_off' };
      }

      case 'end': {
        if (d.message) await this.send({ text: interpolate(String(d.message), r) });
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
