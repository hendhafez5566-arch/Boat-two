/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBlockedIp } from '../http-safe';
import { evaluateCondition } from './conditions';
import { FlowEngine, parseAnswer } from './engine';
import { isOpenNow } from './hours';
import { interpolate, interpolateValue, normalizeText } from './text';
import { FlowCandidate, matchFlow } from './triggers';
import { EngineDeps, FlowContext, FlowGraph, FlowNode, newState, OutContent } from './types';
import { validateGraph } from './validate';

const node = (id: string, type: any, data: any = {}, edges: Record<string, string> = {}): FlowNode => ({
  id,
  type,
  data,
  edges,
});

function harness(graph: FlowGraph, opts: { http?: EngineDeps['http']; random?: () => number; now?: Date; ai?: EngineDeps['ai'] } = {}) {
  const sent: OutContent[] = [];
  const attrs: Record<string, unknown> = {};
  const calls = { handoff: 0, close: 0 };
  const aiCalls: { instructions?: string; text: string }[] = [];
  const deps: EngineDeps = {
    ai: async (req) => {
      aiCalls.push(req);
      return opts.ai ? opts.ai(req) : { text: `AI:${req.text}`, handoff: false };
    },
    send: async (c) => void sent.push(c),
    http: opts.http ?? (async () => ({ status: 200, ok: true, body: {} })),
    setContactAttribute: async (k, v) => void (attrs[k] = v),
    handoff: async () => void calls.handoff++,
    closeConversation: async () => void calls.close++,
    now: () => opts.now ?? new Date('2026-10-20T10:00:00Z'),
    random: opts.random ?? (() => 0.5),
  };
  const engine = new FlowEngine(graph, deps);
  const ctx: FlowContext = {
    contact: { name: 'Ali', phone: '2010', attributes: {} },
    channel: { type: 'web' },
    lastMessage: { text: 'hi' },
  };
  const say = (text: string, replyId?: string) => {
    ctx.lastMessage = { text, replyId };
  };
  return { engine, ctx, sent, attrs, calls, say, aiCalls };
}

// ------------------------------------------------------------- text

test('normalizeText unifies Arabic variants and digits', () => {
  assert.equal(normalizeText('  أهلاً   ٣  '), 'اهلا 3');
  assert.equal(normalizeText('إلى'), normalizeText('الي'));
  assert.equal(normalizeText('مَرْحَباً'), 'مرحبا');
});

test('interpolate: variables, escaping, whole-value type', () => {
  const r = (p: string) => ({ name: 'Ali "Q"', n: 5, 'a.b': 1 } as any)[p];
  assert.equal(interpolate('Hi {{name}}!', r), 'Hi Ali "Q"!');
  assert.equal(interpolate('{"n":"{{name}}"}', r, 'json'), '{"n":"Ali \\"Q\\""}');
  assert.equal(interpolate('q={{name}}', r, 'url'), 'q=Ali%20%22Q%22');
  assert.equal(interpolate('{{missing}}x', r), 'x');
  assert.equal(interpolateValue('{{n}}', r), 5);
});

// ------------------------------------------------------------- conditions / hours / answers

test('conditions: Arabic digits, contains, numeric compare, regex', () => {
  const o: any = {
    vars: { age: '٣٠', city: 'القاهرة' },
    contact: { attributes: { vip: 'yes' } },
    channelType: 'web',
    lastText: 'عايز اطلب',
    resolve: () => undefined,
  };
  const c = (source: any, key: string, operator: any, value?: string) => evaluateCondition({ source, key, operator, value }, o);
  assert.equal(c('variable', 'age', 'greater_than', '18'), true);
  assert.equal(c('variable', 'age', 'equals', '30'), true);
  assert.equal(c('variable', 'city', 'contains', 'قاهره'), false); // ة ≠ ه (لم نوحّدها عمداً)
  assert.equal(c('variable', 'city', 'contains', 'القاهرة'), true);
  assert.equal(c('last_message', '', 'contains', 'اطلب'), true);
  assert.equal(c('contact_attribute', 'vip', 'equals', 'YES'), true);
  assert.equal(c('variable', 'nope', 'is_not_set'), true);
  assert.equal(c('variable', 'city', 'matches_regex', '^الق'), true);
  assert.equal(c('variable', 'city', 'matches_regex', '('), false);
});

test('parseAnswer validates number/email/phone', () => {
  assert.deepEqual(parseAnswer('٢٥', 'number'), { ok: true, value: 25 });
  assert.equal(parseAnswer('abc', 'number').ok, false);
  assert.equal(parseAnswer('A@b.com', 'email').ok, true);
  assert.equal(parseAnswer('a@b', 'email').ok, false);
  assert.deepEqual(parseAnswer('+20 100-123-4567', 'phone'), { ok: true, value: '+201001234567' });
  assert.equal(parseAnswer('123', 'phone').ok, false);
  assert.equal(parseAnswer('   ', 'text').ok, false);
});

test('business hours incl. overnight and timezone', () => {
  const sched = { tue: [['09:00', '17:00']], fri: [['22:00', '02:00']] } as any;
  // 2026-10-20 is a Tuesday; Cairo is UTC+2 in October (DST ended Oct 30 → +3 until then)
  assert.equal(isOpenNow(new Date('2026-10-20T10:00:00Z'), 'UTC', sched), true);
  assert.equal(isOpenNow(new Date('2026-10-20T18:00:00Z'), 'UTC', sched), false);
  assert.equal(isOpenNow(new Date('2026-10-20T10:00:00Z'), 'Asia/Tokyo', sched), false); // 19:00 Tue in Tokyo
  assert.equal(isOpenNow(new Date('2026-10-23T23:00:00Z'), 'UTC', sched), true); // Fri 23:00
  assert.equal(isOpenNow(new Date('2026-10-24T01:00:00Z'), 'UTC', sched), true); // Sat 01:00 (overnight)
  assert.equal(isOpenNow(new Date('2026-10-24T03:00:00Z'), 'UTC', sched), false);
});

// ------------------------------------------------------------- engine

test('message → question → condition → end with variables', async () => {
  const g: FlowGraph = {
    startNodeId: 'm',
    nodes: [
      node('m', 'message', { text: 'Hi {{contact.name}}' }, { next: 'q' }),
      node('q', 'question', { text: 'Age?', answerType: 'number', saveAs: 'age' }, { ok: 'c', fail: 'bye' }),
      node('c', 'condition', { rules: [{ id: 'adult', conditions: [{ source: 'variable', key: 'age', operator: 'greater_than', value: '17' }] }] },
        { 'rule:adult': 'yes', else: 'no' }),
      node('yes', 'message', { text: 'Adult {{age}}' }, {}),
      node('no', 'message', { text: 'Minor' }, {}),
      node('bye', 'end', { message: 'bye' }),
    ],
  };
  const h = harness(g);
  const state = newState();
  let r = await h.engine.start(h.ctx, state);
  assert.equal(r.status, 'waiting');
  assert.equal(r.waitKind, 'answer');
  assert.deepEqual(h.sent.map((s) => s.text), ['Hi Ali', 'Age?']);

  h.say('abc');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'waiting'); // retry 1: يعيد السؤال
  assert.equal(h.sent[2].text, 'Age?');

  h.say('٢٥');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'completed');
  assert.equal(state.vars.age, 25);
  assert.equal(h.sent[3].text, 'Adult 25');
});

test('question: retries exhausted follows fail edge', async () => {
  const g: FlowGraph = {
    startNodeId: 'q',
    nodes: [
      node('q', 'question', { text: 'Email?', answerType: 'email', saveAs: 'e', retries: 1, errorText: 'bad email' }, { fail: 'x' }),
      node('x', 'message', { text: 'giving up' }),
    ],
  };
  const h = harness(g);
  const s = newState();
  await h.engine.start(h.ctx, s);
  h.say('nope');
  let r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'waiting');
  assert.equal(h.sent[1].text, 'bad email');
  h.say('still no');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'completed');
  assert.equal(h.sent[2].text, 'giving up');
});

test('buttons route by reply id, by typed title, fallback, and re-prompt limit', async () => {
  const g: FlowGraph = {
    startNodeId: 'm',
    nodes: [
      node('m', 'message', { text: 'Pick', buttons: [{ id: 'a', title: 'Sales' }, { id: 'b', title: 'Support' }], saveReplyAs: 'dept' },
        { 'option:a': 'sales', 'option:b': 'support' }),
      node('sales', 'message', { text: 'S' }),
      node('support', 'message', { text: 'T' }),
    ],
  };
  // by id
  let h = harness(g);
  let s = newState();
  let r = await h.engine.start(h.ctx, s);
  assert.equal(r.waitKind, 'choice');
  h.say('whatever', 'b');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(h.sent.at(-1)?.text, 'T');
  assert.equal(s.vars.dept, 'Support');
  assert.equal(s.vars.dept_id, 'b');

  // typed title
  h = harness(g); s = newState();
  await h.engine.start(h.ctx, s);
  h.say('  sales ');
  await h.engine.resume(h.ctx, s);
  assert.equal(h.sent.at(-1)?.text, 'S');

  // no match: re-prompt twice then complete
  h = harness(g); s = newState();
  await h.engine.start(h.ctx, s);
  h.say('???');
  r = await h.engine.resume(h.ctx, s); assert.equal(r.status, 'waiting');
  r = await h.engine.resume(h.ctx, s); assert.equal(r.status, 'waiting');
  r = await h.engine.resume(h.ctx, s); assert.equal(r.status, 'completed');
  assert.equal(h.sent.filter((x) => x.text === 'Pick').length, 3);

  // fallback edge
  const g2: FlowGraph = { startNodeId: 'm', nodes: [{ ...g.nodes[0], edges: { ...g.nodes[0].edges, fallback: 'fb' } }, ...g.nodes.slice(1), node('fb', 'message', { text: 'FB' })] };
  h = harness(g2); s = newState();
  await h.engine.start(h.ctx, s);
  h.say('free text');
  await h.engine.resume(h.ctx, s);
  assert.equal(h.sent.at(-1)?.text, 'FB');
});

test('delay waits and resumes', async () => {
  const g: FlowGraph = {
    startNodeId: 'd',
    nodes: [node('d', 'delay', { amount: 2, unit: 'minutes' }, { next: 'm' }), node('m', 'message', { text: 'later' })],
  };
  const h = harness(g);
  const s = newState();
  let r = await h.engine.start(h.ctx, s);
  assert.equal(r.status, 'waiting');
  assert.equal(r.waitKind, 'delay');
  assert.equal(r.waitUntil?.toISOString(), '2026-10-20T10:02:00.000Z');
  r = await h.engine.resumeDelay(h.ctx, s);
  assert.equal(r.status, 'completed');
  assert.equal(h.sent[0].text, 'later');
});

test('loops are stopped', async () => {
  const g: FlowGraph = { startNodeId: 'a', nodes: [node('a', 'set_variable', { assignments: [{ name: 'i', operation: 'increment' }] }, { next: 'a' })] };
  const h = harness(g);
  const r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'error');
  assert.match(r.error ?? '', /maximum number of steps/);
});

test('set_variable / set_attribute / split / business_hours / handoff / end', async () => {
  const g: FlowGraph = {
    startNodeId: 'sv',
    nodes: [
      node('sv', 'set_variable', { assignments: [{ name: 'n', operation: 'set', value: '5' }, { name: 'n', operation: 'increment', value: '2' }, { name: 'who', operation: 'set', value: '{{contact.name}}' }] }, { next: 'sa' }),
      node('sa', 'set_attribute', { key: 'tier', value: 'gold-{{n}}' }, { next: 'sp' }),
      node('sp', 'split', { branches: [{ id: 'x', weight: 1 }, { id: 'y', weight: 3 }] }, { 'branch:x': 'endx', 'branch:y': 'bh' }),
      node('endx', 'end', { message: 'X' }),
      node('bh', 'business_hours', { timezone: 'UTC', schedule: { tue: [['09:00', '17:00']] } }, { open: 'ho', closed: 'endc' }),
      node('endc', 'end', { message: 'closed' }),
      node('ho', 'handoff', { message: 'agent coming {{who}}' }),
    ],
  };
  const h = harness(g, { random: () => 0.9 });
  const s = newState();
  const r = await h.engine.start(h.ctx, s);
  assert.equal(r.status, 'handed_off');
  assert.equal(s.vars.n, 7);
  assert.equal(h.attrs.tier, 'gold-7');
  assert.equal(h.sent.at(-1)?.text, 'agent coming Ali');
  assert.equal(h.calls.handoff, 1);

  const h2 = harness(g, { random: () => 0.1 });
  const r2 = await h2.engine.start(h2.ctx, newState());
  assert.equal(r2.status, 'completed');
  assert.equal(h2.sent.at(-1)?.text, 'X');
});

test('http_request: success maps response, failure takes error edge, url/body escaping', async () => {
  const g: FlowGraph = {
    startNodeId: 'h',
    nodes: [
      node('h', 'http_request', { method: 'POST', url: 'https://api.test/items?q={{q}}', body: '{"name":"{{who}}"}', saveAs: [{ path: 'data.price', variable: 'price' }] }, { success: 'ok', error: 'err' }),
      node('ok', 'message', { text: 'price {{price}}' }),
      node('err', 'message', { text: 'failed' }),
    ],
  };
  let seen: any;
  let h = harness(g, { http: async (spec) => ((seen = spec), { status: 200, ok: true, body: { data: { price: 42 } } }) });
  const s = newState();
  s.vars.q = 'a b&c';
  s.vars.who = 'Ali "Q"';
  await h.engine.start(h.ctx, s);
  assert.equal(seen.url, 'https://api.test/items?q=a%20b%26c');
  assert.equal(seen.body, '{"name":"Ali \\"Q\\""}');
  assert.equal(h.sent[0].text, 'price 42');

  h = harness(g, { http: async () => { throw new Error('boom'); } });
  await h.engine.start(h.ctx, newState());
  assert.equal(h.sent[0].text, 'failed');

  h = harness(g, { http: async () => ({ status: 500, ok: false, body: {} }) });
  await h.engine.start(h.ctx, newState());
  assert.equal(h.sent[0].text, 'failed');
});

test('send failure becomes an error result (e.g. WhatsApp window)', async () => {
  const g: FlowGraph = { startNodeId: 'm', nodes: [node('m', 'message', { text: 'x' })] };
  const h = harness(g);
  (h.engine as any).deps.send = async () => { throw new Error('WINDOW_EXPIRED'); };
  const r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'error');
  assert.equal(r.error, 'WINDOW_EXPIRED');
});

// ------------------------------------------------------------- triggers

test('matchFlow: specificity, priority, channel filter, once-per-conversation', () => {
  const mk = (id: string, triggers: any, priority = 0, channelIds: string[] = []): FlowCandidate => ({ flowId: id, versionId: 'v' + id, priority, triggers, channelIds });
  const cands = [
    mk('fallback', [{ type: 'any_message' }]),
    mk('welcome', [{ type: 'first_message' }]),
    mk('price', [{ type: 'keyword', keywords: ['سعر', 'price'], match: 'contains' }]),
    mk('menu', [{ type: 'reply_id', ids: ['menu'] }]),
    mk('wa-only', [{ type: 'keyword', keywords: ['hello'] }], 5, ['wa1']),
  ];
  const base = { text: '', channelId: 'web1', isFirstMessage: false, alreadyRunFlowIds: new Set<string>() };
  assert.equal(matchFlow(cands, { ...base, text: 'كم السعر؟' })?.flowId, 'price');
  assert.equal(matchFlow(cands, { ...base, text: 'عايز اعرف' })?.flowId, 'fallback');
  assert.equal(matchFlow(cands, { ...base, text: 'x', replyId: 'menu' })?.flowId, 'menu');
  // أول رسالة: welcome أولى من fallback، لكن الكلمة المفتاحية أولى من welcome
  assert.equal(matchFlow(cands, { ...base, text: 'hi', isFirstMessage: true })?.flowId, 'welcome');
  assert.equal(matchFlow(cands, { ...base, text: 'PRICE?', isFirstMessage: true })?.flowId, 'price');
  // فلتر القناة
  assert.equal(matchFlow(cands, { ...base, text: 'hello' })?.flowId, 'fallback');
  assert.equal(matchFlow(cands, { ...base, text: 'hello', channelId: 'wa1' })?.flowId, 'wa-only');
  // once per conversation للـ any_message/first_message فقط
  const ran = new Set(['fallback', 'welcome']);
  assert.equal(matchFlow(cands, { ...base, text: 'hi', isFirstMessage: true, alreadyRunFlowIds: ran }), null);
  assert.equal(matchFlow(cands, { ...base, text: 'price', alreadyRunFlowIds: new Set(['price']) })?.flowId, 'price');
  // الأولوية داخل نفس الرتبة
  const two = [mk('a', [{ type: 'keyword', keywords: ['x'] }], 1), mk('b', [{ type: 'keyword', keywords: ['x'] }], 9)];
  assert.equal(matchFlow(two, { ...base, text: 'x' })?.flowId, 'b');
  // exact / starts_with
  const ex = [mk('e', [{ type: 'keyword', keywords: ['menu'], match: 'exact' }])];
  assert.equal(matchFlow(ex, { ...base, text: 'the menu' }), null);
  assert.equal(matchFlow(ex, { ...base, text: ' Menu ' })?.flowId, 'e');
});

// ------------------------------------------------------------- validation & security

test('validateGraph catches broken graphs and accepts good ones', () => {
  const good: FlowGraph = {
    startNodeId: 'm',
    nodes: [node('m', 'message', { text: 'hi', buttons: [{ id: 'a', title: 'A' }] }, { 'option:a': 'e' }), node('e', 'end')],
  };
  assert.deepEqual(validateGraph(good).errors, []);

  const bad: FlowGraph = {
    startNodeId: 'zzz',
    nodes: [
      node('m', 'message', { buttons: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] }, { next: 'ghost', 'option:q': 'm' }),
      node('q', 'question', { text: 'x', saveAs: '1bad' }),
      node('o', 'delay', { amount: 0 }),
      node('t', 'business_hours', { timezone: 'Mars/Base' }),
      node('s', 'split', { branches: [{ id: 'x', weight: 1 }] }),
    ],
  };
  const msgs = validateGraph(bad).errors.map((e) => e.message).join('|');
  for (const m of ['Start node does not exist', 'Unknown output', 'missing node', 'Buttons/list require message text', 'Option ids must be unique', 'saveAs', 'Delay amount', 'Invalid timezone', 'at least 2 branches']) {
    assert.ok(msgs.includes(m), `expected error containing "${m}" in: ${msgs}`);
  }
  assert.ok(validateGraph({ startNodeId: 'm', nodes: [...good.nodes, node('lonely', 'end')] }).warnings.length === 1);
});

test('isBlockedIp blocks internal ranges (SSRF)', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});

// ------------------------------------------------------------- end-to-end scenario

test('shop scenario: menu → order question → API → confirmation, in Arabic', async () => {
  const defaultGraph: FlowGraph = {
    startNodeId: 'start',
    nodes: [
      node('start', 'message', { text: 'مرحباً! كيف يمكنني مساعدتك؟' }, { next: 'end' }),
      node('end', 'end'),
    ],
  };
  assert.deepEqual(validateGraph(defaultGraph).errors, []); // الـ flow الافتراضي الذي ينشئه النظام صالح للنشر

  const g: FlowGraph = {
    startNodeId: 'menu',
    nodes: [
      node('menu', 'message', { text: 'أهلاً {{contact.name}}، اختر:', buttons: [{ id: 'order', title: 'طلب جديد' }, { id: 'agent', title: 'موظف' }] },
        { 'option:order': 'qty', 'option:agent': 'hand' }),
      node('qty', 'question', { text: 'كم الكمية؟', answerType: 'number', saveAs: 'qty', errorText: 'أدخل رقماً من فضلك' }, { ok: 'big', fail: 'hand' }),
      node('big', 'condition', { rules: [{ id: 'many', conditions: [{ source: 'variable', key: 'qty', operator: 'greater_than', value: '10' }] }] }, { 'rule:many': 'hand', else: 'api' }),
      node('api', 'http_request', { method: 'POST', url: 'https://shop.test/orders', body: '{"qty":{{qty}}}', saveAs: [{ path: 'id', variable: 'orderId' }] }, { success: 'done', error: 'hand' }),
      node('done', 'end', { message: 'تم تسجيل طلبك رقم {{orderId}} ✅', closeConversation: true }),
      node('hand', 'handoff', { message: 'سيتواصل معك أحد الموظفين' }),
    ],
  };
  assert.deepEqual(validateGraph(g).errors, []);

  let body = '';
  const h = harness(g, { http: async (s) => ((body = s.body ?? ''), { status: 201, ok: true, body: { id: 'A-77' } }) });
  const s = newState();
  await h.engine.start(h.ctx, s);
  h.say('طلب جديد');
  await h.engine.resume(h.ctx, s); // مطابقة بالعنوان المكتوب
  h.say('مش عارف');
  let r = await h.engine.resume(h.ctx, s);
  assert.equal(h.sent.at(-1)?.text, 'أدخل رقماً من فضلك');
  h.say('٣');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'completed');
  assert.equal(body, '{"qty":3}');
  assert.equal(h.sent.at(-1)?.text, 'تم تسجيل طلبك رقم A-77 ✅');
  assert.equal(h.calls.close, 1);

  // كمية كبيرة → موظف
  const h2 = harness(g);
  const s2 = newState();
  await h2.engine.start(h2.ctx, s2);
  h2.say('x', 'order');
  await h2.engine.resume(h2.ctx, s2);
  h2.say('50');
  r = await h2.engine.resume(h2.ctx, s2);
  assert.equal(r.status, 'handed_off');
  assert.equal(h2.calls.handoff, 1);
});

// ------------------------------------------------------------- AI node

test('ai_reply as start node answers the first message, then converses until exit keyword', async () => {
  const g: FlowGraph = {
    startNodeId: 'ai',
    nodes: [
      node('ai', 'ai_reply', { instructions: 'Be brief for {{contact.name}}', exitKeywords: ['شكرا', 'bye'] }, { done: 'end' }),
      node('end', 'end', { message: 'تشرفنا' }),
    ],
  };
  const h = harness(g);
  h.say('كام سعر الاشتراك؟');
  const s = newState();
  let r = await h.engine.start(h.ctx, s);
  assert.equal(r.status, 'waiting');
  assert.equal(r.waitKind, 'ai');
  assert.equal(h.sent[0].text, 'AI:كام سعر الاشتراك؟');
  assert.equal(h.aiCalls[0].instructions, 'Be brief for Ali');

  h.say('وفيه خصم؟');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'waiting');
  assert.equal(h.sent[1].text, 'AI:وفيه خصم؟');
  assert.equal(h.aiCalls.length, 2);

  h.say('تمام شُكراً'); // لا تطابق "شكرا" بسبب الضمة؟ التطبيع يزيل التشكيل فتطابق
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'completed');
  assert.equal(h.aiCalls.length, 2); // لم يُستدعَ الـ AI عند كلمة الخروج
  assert.equal(h.sent.at(-1)?.text, 'تشرفنا');
});

test('ai_reply not at start waits for the next message instead of answering the old one', async () => {
  const g: FlowGraph = {
    startNodeId: 'm',
    nodes: [node('m', 'message', { text: 'اسألني أي حاجة' }, { next: 'ai' }), node('ai', 'ai_reply', { greeting: 'أنا المساعد الذكي' })],
  };
  const h = harness(g);
  const s = newState();
  const r = await h.engine.start(h.ctx, s);
  assert.equal(r.waitKind, 'ai');
  assert.equal(h.aiCalls.length, 0);
  assert.deepEqual(h.sent.map((x) => x.text), ['اسألني أي حاجة', 'أنا المساعد الذكي']);
});

test('ai_reply: max turns, handoff edge, default handoff, failure edge', async () => {
  const mk = (data: any, edges: any): FlowGraph => ({
    startNodeId: 'ai',
    nodes: [node('ai', 'ai_reply', data, edges), node('done', 'message', { text: 'DONE' }), node('hand', 'message', { text: 'HAND' }), node('err', 'message', { text: 'ERR' })],
  });

  // max turns → done
  let h = harness(mk({ maxTurns: 2 }, { done: 'done' }));
  const s = newState();
  h.say('q1');
  await h.engine.start(h.ctx, s);
  h.say('q2');
  let r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'completed');
  assert.equal(h.sent.at(-1)?.text, 'DONE');

  // handoff with edge
  h = harness(mk({}, { handoff: 'hand' }), { ai: async () => ({ text: 'سأحولك', handoff: true }) });
  h.say('عايز اكلم حد');
  r = await h.engine.start(h.ctx, newState());
  assert.equal(h.sent.at(-1)?.text, 'HAND');
  assert.equal(h.calls.handoff, 0);

  // handoff without edge → engine hands off itself
  h = harness(mk({}, {}), { ai: async () => ({ text: 'سأحولك', handoff: true }) });
  h.say('x');
  r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'handed_off');
  assert.equal(h.calls.handoff, 1);

  // failure → error edge, apology still sent
  h = harness(mk({}, { error: 'err' }), { ai: async () => ({ text: 'عذراً، حدث خطأ', handoff: false, failed: true }) });
  h.say('x');
  r = await h.engine.start(h.ctx, newState());
  assert.deepEqual(h.sent.map((x) => x.text), ['عذراً، حدث خطأ', 'ERR']);

  // AI dependency throwing → error result (not a crash)
  h = harness(mk({}, {}), { ai: async () => { throw new Error('upstream down'); } });
  h.say('x');
  r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'error');
});

test('validateGraph: ai_reply warns without handoff/error edges', () => {
  const g: FlowGraph = { startNodeId: 'ai', nodes: [node('ai', 'ai_reply', {})] };
  const v = validateGraph(g);
  assert.deepEqual(v.errors, []);
  assert.equal(v.warnings.length, 1);
  assert.equal(validateGraph({ startNodeId: 'ai', nodes: [node('ai', 'ai_reply', { maxTurns: 99 })] }).errors.length, 1);
});
