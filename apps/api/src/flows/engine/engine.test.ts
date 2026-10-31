/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBlockedIp } from '../http-safe';
import { evaluateCondition, evaluateRule } from './conditions';
import { FlowEngine, parseAnswer } from './engine';
import { isOpenNow } from './hours';
import { interpolate, interpolateValue, normalizeText } from './text';
import { FlowCandidate, matchFlow } from './triggers';
import { EngineDeps, FlowContext, FlowGraph, FlowNode, newState, OutContent } from './types';
import { validateGraph } from './validate';

const node = (
  id: string,
  type: any,
  data: any = {},
  edges: Record<string, string> = {},
): FlowNode => ({
  id,
  type,
  data,
  edges,
});

function harness(
  graph: FlowGraph,
  opts: {
    catalogContent?: EngineDeps['catalogContent'];
    dynamicCatalog?: EngineDeps['dynamicCatalog'];
    dynamicItem?: EngineDeps['dynamicItem'];
    http?: EngineDeps['http'];
    random?: () => number;
    now?: Date;
    ai?: EngineDeps['ai'];
  } = {},
) {
  const sent: OutContent[] = [];
  const attrs: Record<string, unknown> = {};
  const calls = { handoff: 0, close: 0 };
  const aiCalls: { instructions?: string; text: string }[] = [];
  const deps: EngineDeps = {
    catalogContent: opts.catalogContent,
    dynamicCatalog: opts.dynamicCatalog,
    dynamicItem: opts.dynamicItem,
    ai: async (req) => {
      aiCalls.push(req);
      return opts.ai ? opts.ai(req) : { text: `AI:${req.text}`, handoff: false };
    },
    send: async (c) => void sent.push(c),
    http: opts.http ?? (async () => ({ status: 200, ok: true, body: {} })),
    setContactAttribute: async (k, v) => void (attrs[k] = v),
    updateTags: async () => {},
    addNote: async () => {},
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
  const r = (p: string) => (({ name: 'Ali "Q"', n: 5, 'a.b': 1 }) as any)[p];
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
  const c = (source: any, key: string, operator: any, value?: string) =>
    evaluateCondition({ source, key, operator, value }, o);
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

test('conditions: label matches whole tag, any/all, empty set', () => {
  const mk = (tags: string[]): any => ({
    vars: {},
    contact: { attributes: {}, tags },
    channelType: 'whatsapp',
    lastText: '',
    resolve: () => undefined,
  });
  const lab = (operator: any, value?: string) => ({ source: 'label' as const, operator, value });
  const o = mk(['Received-AI Summary', 'vip']);
  assert.equal(evaluateCondition(lab('contains', 'received-ai summary'), o), true);
  assert.equal(evaluateCondition(lab('contains', 'vi'), o), false); // وسم كامل وليس جزء نص
  assert.equal(evaluateCondition(lab('not_contains', 'trial'), o), true);
  assert.equal(evaluateCondition(lab('is_set'), o), true);
  assert.equal(evaluateCondition(lab('is_not_set'), mk([])), true);
  assert.equal(evaluateCondition(lab('contains', ''), o), false);
  assert.equal(evaluateCondition(lab('greater_than', '1'), o), false);
  const rule = {
    id: 'r',
    match: 'all' as const,
    conditions: [lab('contains', 'vip'), lab('contains', 'trial')],
  };
  assert.equal(evaluateRule(rule, o), false);
  assert.equal(evaluateRule({ ...rule, match: 'any' }, o), true);
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
      node(
        'q',
        'question',
        { text: 'Age?', answerType: 'number', saveAs: 'age' },
        { ok: 'c', fail: 'bye' },
      ),
      node(
        'c',
        'condition',
        {
          rules: [
            {
              id: 'adult',
              conditions: [
                { source: 'variable', key: 'age', operator: 'greater_than', value: '17' },
              ],
            },
          ],
        },
        { 'rule:adult': 'yes', else: 'no' },
      ),
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
  assert.deepEqual(
    h.sent.map((s) => s.text),
    ['Hi Ali', 'Age?'],
  );

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
      node(
        'q',
        'question',
        { text: 'Email?', answerType: 'email', saveAs: 'e', retries: 1, errorText: 'bad email' },
        { fail: 'x' },
      ),
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
      node(
        'm',
        'message',
        {
          text: 'Pick',
          buttons: [
            { id: 'a', title: 'Sales' },
            { id: 'b', title: 'Support' },
          ],
          saveReplyAs: 'dept',
        },
        { 'option:a': 'sales', 'option:b': 'support' },
      ),
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
  h = harness(g);
  s = newState();
  await h.engine.start(h.ctx, s);
  h.say('  sales ');
  await h.engine.resume(h.ctx, s);
  assert.equal(h.sent.at(-1)?.text, 'S');

  // no match: re-prompt twice then complete
  h = harness(g);
  s = newState();
  await h.engine.start(h.ctx, s);
  h.say('???');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'waiting');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'waiting');
  r = await h.engine.resume(h.ctx, s);
  assert.equal(r.status, 'completed');
  assert.equal(h.sent.filter((x) => x.text === 'Pick').length, 3);

  // fallback edge
  const g2: FlowGraph = {
    startNodeId: 'm',
    nodes: [
      { ...g.nodes[0], edges: { ...g.nodes[0].edges, fallback: 'fb' } },
      ...g.nodes.slice(1),
      node('fb', 'message', { text: 'FB' }),
    ],
  };
  h = harness(g2);
  s = newState();
  await h.engine.start(h.ctx, s);
  h.say('free text');
  await h.engine.resume(h.ctx, s);
  assert.equal(h.sent.at(-1)?.text, 'FB');
});

test('delay waits and resumes', async () => {
  const g: FlowGraph = {
    startNodeId: 'd',
    nodes: [
      node('d', 'delay', { amount: 2, unit: 'minutes' }, { next: 'm' }),
      node('m', 'message', { text: 'later' }),
    ],
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
  const g: FlowGraph = {
    startNodeId: 'a',
    nodes: [
      node(
        'a',
        'set_variable',
        { assignments: [{ name: 'i', operation: 'increment' }] },
        { next: 'a' },
      ),
    ],
  };
  const h = harness(g);
  const r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'error');
  assert.match(r.error ?? '', /maximum number of steps/);
});

test('set_variable / set_attribute / split / business_hours / handoff / end', async () => {
  const g: FlowGraph = {
    startNodeId: 'sv',
    nodes: [
      node(
        'sv',
        'set_variable',
        {
          assignments: [
            { name: 'n', operation: 'set', value: '5' },
            { name: 'n', operation: 'increment', value: '2' },
            { name: 'who', operation: 'set', value: '{{contact.name}}' },
          ],
        },
        { next: 'sa' },
      ),
      node('sa', 'set_attribute', { key: 'tier', value: 'gold-{{n}}' }, { next: 'sp' }),
      node(
        'sp',
        'split',
        {
          branches: [
            { id: 'x', weight: 1 },
            { id: 'y', weight: 3 },
          ],
        },
        { 'branch:x': 'endx', 'branch:y': 'bh' },
      ),
      node('endx', 'end', { message: 'X' }),
      node(
        'bh',
        'business_hours',
        { timezone: 'UTC', schedule: { tue: [['09:00', '17:00']] } },
        { open: 'ho', closed: 'endc' },
      ),
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
      node(
        'h',
        'http_request',
        {
          method: 'POST',
          url: 'https://api.test/items?q={{q}}',
          body: '{"name":"{{who}}"}',
          saveAs: [{ path: 'data.price', variable: 'price' }],
        },
        { success: 'ok', error: 'err' },
      ),
      node('ok', 'message', { text: 'price {{price}}' }),
      node('err', 'message', { text: 'failed' }),
    ],
  };
  let seen: any;
  let h = harness(g, {
    http: async (spec) => ((seen = spec), { status: 200, ok: true, body: { data: { price: 42 } } }),
  });
  const s = newState();
  s.vars.q = 'a b&c';
  s.vars.who = 'Ali "Q"';
  await h.engine.start(h.ctx, s);
  assert.equal(seen.url, 'https://api.test/items?q=a%20b%26c');
  assert.equal(seen.body, '{"name":"Ali \\"Q\\""}');
  assert.equal(h.sent[0].text, 'price 42');

  h = harness(g, {
    http: async () => {
      throw new Error('boom');
    },
  });
  await h.engine.start(h.ctx, newState());
  assert.equal(h.sent[0].text, 'failed');

  h = harness(g, { http: async () => ({ status: 500, ok: false, body: {} }) });
  await h.engine.start(h.ctx, newState());
  assert.equal(h.sent[0].text, 'failed');
});

test('send failure becomes an error result (e.g. WhatsApp window)', async () => {
  const g: FlowGraph = { startNodeId: 'm', nodes: [node('m', 'message', { text: 'x' })] };
  const h = harness(g);
  (h.engine as any).deps.send = async () => {
    throw new Error('WINDOW_EXPIRED');
  };
  const r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'error');
  assert.equal(r.error, 'WINDOW_EXPIRED');
});

// ------------------------------------------------------------- triggers

test('matchFlow: specificity, priority, channel filter, once-per-conversation', () => {
  const mk = (
    id: string,
    triggers: any,
    priority = 0,
    channelIds: string[] = [],
  ): FlowCandidate => ({ flowId: id, versionId: 'v' + id, priority, triggers, channelIds });
  const cands = [
    mk('fallback', [{ type: 'any_message' }]),
    mk('welcome', [{ type: 'first_message' }]),
    mk('price', [{ type: 'keyword', keywords: ['سعر', 'price'], match: 'contains' }]),
    mk('menu', [{ type: 'reply_id', ids: ['menu'] }]),
    mk('wa-only', [{ type: 'keyword', keywords: ['hello'] }], 5, ['wa1']),
  ];
  const base = {
    text: '',
    channelId: 'web1',
    isFirstMessage: false,
    alreadyRunFlowIds: new Set<string>(),
  };
  assert.equal(matchFlow(cands, { ...base, text: 'كم السعر؟' })?.flowId, 'price');
  assert.equal(matchFlow(cands, { ...base, text: 'عايز اعرف' })?.flowId, 'fallback');
  assert.equal(matchFlow(cands, { ...base, text: 'x', replyId: 'menu' })?.flowId, 'menu');
  // أول رسالة: welcome أولى من fallback، لكن الكلمة المفتاحية أولى من welcome
  assert.equal(matchFlow(cands, { ...base, text: 'hi', isFirstMessage: true })?.flowId, 'welcome');
  assert.equal(
    matchFlow(cands, { ...base, text: 'PRICE?', isFirstMessage: true })?.flowId,
    'price',
  );
  // فلتر القناة
  assert.equal(matchFlow(cands, { ...base, text: 'hello' })?.flowId, 'fallback');
  assert.equal(matchFlow(cands, { ...base, text: 'hello', channelId: 'wa1' })?.flowId, 'wa-only');
  // once per conversation للـ any_message/first_message فقط
  const ran = new Set(['fallback', 'welcome']);
  assert.equal(
    matchFlow(cands, { ...base, text: 'hi', isFirstMessage: true, alreadyRunFlowIds: ran }),
    null,
  );
  assert.equal(
    matchFlow(cands, { ...base, text: 'price', alreadyRunFlowIds: new Set(['price']) })?.flowId,
    'price',
  );
  // الأولوية داخل نفس الرتبة
  const two = [
    mk('a', [{ type: 'keyword', keywords: ['x'] }], 1),
    mk('b', [{ type: 'keyword', keywords: ['x'] }], 9),
  ];
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
    nodes: [
      node('m', 'message', { text: 'hi', buttons: [{ id: 'a', title: 'A' }] }, { 'option:a': 'e' }),
      node('e', 'end'),
    ],
  };
  assert.deepEqual(validateGraph(good).errors, []);

  const bad: FlowGraph = {
    startNodeId: 'zzz',
    nodes: [
      node(
        'm',
        'message',
        {
          buttons: [
            { id: 'a', title: 'A' },
            { id: 'a', title: 'B' },
          ],
        },
        { next: 'ghost', 'option:q': 'm' },
      ),
      node('q', 'question', { text: 'x', saveAs: '1bad' }),
      node('o', 'delay', { amount: 0 }),
      node('t', 'business_hours', { timezone: 'Mars/Base' }),
      node('s', 'split', { branches: [{ id: 'x', weight: 1 }] }),
    ],
  };
  const msgs = validateGraph(bad)
    .errors.map((e) => e.message)
    .join('|');
  for (const m of [
    'Start node does not exist',
    'Unknown output',
    'missing node',
    'Buttons/list require message text',
    'Option ids must be unique',
    'saveAs',
    'Delay amount',
    'Invalid timezone',
    'at least 2 branches',
  ]) {
    assert.ok(msgs.includes(m), `expected error containing "${m}" in: ${msgs}`);
  }
  assert.ok(
    validateGraph({ startNodeId: 'm', nodes: [...good.nodes, node('lonely', 'end')] }).warnings
      .length === 1,
  );
});

test('isBlockedIp blocks internal ranges (SSRF)', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a00:1',
  ]) {
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
      node(
        'menu',
        'message',
        {
          text: 'أهلاً {{contact.name}}، اختر:',
          buttons: [
            { id: 'order', title: 'طلب جديد' },
            { id: 'agent', title: 'موظف' },
          ],
        },
        { 'option:order': 'qty', 'option:agent': 'hand' },
      ),
      node(
        'qty',
        'question',
        {
          text: 'كم الكمية؟',
          answerType: 'number',
          saveAs: 'qty',
          errorText: 'أدخل رقماً من فضلك',
        },
        { ok: 'big', fail: 'hand' },
      ),
      node(
        'big',
        'condition',
        {
          rules: [
            {
              id: 'many',
              conditions: [
                { source: 'variable', key: 'qty', operator: 'greater_than', value: '10' },
              ],
            },
          ],
        },
        { 'rule:many': 'hand', else: 'api' },
      ),
      node(
        'api',
        'http_request',
        {
          method: 'POST',
          url: 'https://shop.test/orders',
          body: '{"qty":{{qty}}}',
          saveAs: [{ path: 'id', variable: 'orderId' }],
        },
        { success: 'done', error: 'hand' },
      ),
      node('done', 'end', { message: 'تم تسجيل طلبك رقم {{orderId}} ✅', closeConversation: true }),
      node('hand', 'handoff', { message: 'سيتواصل معك أحد الموظفين' }),
    ],
  };
  assert.deepEqual(validateGraph(g).errors, []);

  let body = '';
  const h = harness(g, {
    http: async (s) => ((body = s.body ?? ''), { status: 201, ok: true, body: { id: 'A-77' } }),
  });
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
      node(
        'ai',
        'ai_reply',
        { instructions: 'Be brief for {{contact.name}}', exitKeywords: ['شكرا', 'bye'] },
        { done: 'end' },
      ),
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
    nodes: [
      node('m', 'message', { text: 'اسألني أي حاجة' }, { next: 'ai' }),
      node('ai', 'ai_reply', { greeting: 'أنا المساعد الذكي' }),
    ],
  };
  const h = harness(g);
  const s = newState();
  const r = await h.engine.start(h.ctx, s);
  assert.equal(r.waitKind, 'ai');
  assert.equal(h.aiCalls.length, 0);
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['اسألني أي حاجة', 'أنا المساعد الذكي'],
  );
});

test('ai_reply: max turns, handoff edge, default handoff, failure edge', async () => {
  const mk = (data: any, edges: any): FlowGraph => ({
    startNodeId: 'ai',
    nodes: [
      node('ai', 'ai_reply', data, edges),
      node('done', 'message', { text: 'DONE' }),
      node('hand', 'message', { text: 'HAND' }),
      node('err', 'message', { text: 'ERR' }),
    ],
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
  h = harness(mk({}, { error: 'err' }), {
    ai: async () => ({ text: 'عذراً، حدث خطأ', handoff: false, failed: true }),
  });
  h.say('x');
  r = await h.engine.start(h.ctx, newState());
  assert.deepEqual(
    h.sent.map((x) => x.text),
    ['عذراً، حدث خطأ', 'ERR'],
  );

  // AI dependency throwing → error result (not a crash)
  h = harness(mk({}, {}), {
    ai: async () => {
      throw new Error('upstream down');
    },
  });
  h.say('x');
  r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'error');
});

test('validateGraph: ai_reply warns without handoff/error edges', () => {
  const g: FlowGraph = { startNodeId: 'ai', nodes: [node('ai', 'ai_reply', {})] };
  const v = validateGraph(g);
  assert.deepEqual(v.errors, []);
  assert.equal(v.warnings.length, 1);
  assert.equal(
    validateGraph({ startNodeId: 'ai', nodes: [node('ai', 'ai_reply', { maxTurns: 99 })] }).errors
      .length,
    1,
  );
});

// ------------------------------------------------------------- location / cta_url / template

test('location, cta_url and template nodes send rich content and continue', async () => {
  const g: FlowGraph = {
    startNodeId: 'a',
    nodes: [
      node('a', 'location', { lat: '30.0444', lng: '31.2357', name: 'Cairo' }, { next: 'b' }),
      node(
        'b',
        'cta_url',
        { text: 'Hi {{contact.name}}', buttonText: 'Open', url: 'https://x.test/{{contact.name}}' },
        { next: 'c' },
      ),
      node(
        'c',
        'template',
        { name: 'promo_1', language: 'ar', bodyParams: ['{{contact.name}}'] },
        {},
      ),
    ],
  };
  const h = harness(g);
  const res = await h.engine.start(h.ctx, newState());
  assert.equal(res.status, 'completed');
  assert.deepEqual(h.sent[0].location, { lat: 30.0444, lng: 31.2357, name: 'Cairo' });
  assert.equal(h.sent[1].text, 'Hi Ali');
  assert.deepEqual(h.sent[1].cta, { text: 'Open', url: 'https://x.test/Ali' });
  assert.deepEqual(h.sent[2].template?.bodyParams, ['Ali']);
});

test('validate: new nodes require their key fields', () => {
  const g: FlowGraph = {
    startNodeId: 'a',
    nodes: [
      node('a', 'location', {}, { next: 'b' }),
      node('b', 'cta_url', { text: 'x', buttonText: 'Go', url: 'ftp://bad' }, { next: 'c' }),
      node('c', 'template', { name: 'Bad Name' }, {}),
    ],
  };
  const { errors } = validateGraph(g);
  assert.equal(errors.length, 3);
});

test('sequence node enrolls the contact and continues; failures do not stop the flow', async () => {
  const g: FlowGraph = {
    startNodeId: 'a',
    nodes: [
      node('a', 'sequence', { sequenceId: '11111111-1111-1111-1111-111111111111' }, { next: 'b' }),
      node('b', 'message', { text: 'done' }, {}),
    ],
  };
  const h = harness(g);
  const enrolled: string[] = [];
  (h.engine as any).deps.enrollSequence = async (id: string) => {
    enrolled.push(id);
    throw new Error('no consent');
  };
  const res = await h.engine.start(h.ctx, newState());
  assert.equal(res.status, 'completed');
  assert.deepEqual(enrolled, ['11111111-1111-1111-1111-111111111111']);
  assert.equal(h.sent[0].text, 'done');
});

// ------------------------------------------------------------- user input flow (chain of questions)

test('user_input: asks questions in order, saves custom fields, then thank-you and next node', async () => {
  const g: FlowGraph = {
    startNodeId: 'ui',
    nodes: [
      node(
        'ui',
        'user_input',
        {
          name: 'Order Place',
          questions: [
            {
              id: 'q1',
              text: 'What would you like to do?',
              kind: 'choice',
              saveAs: 'ai_agent',
              options: [
                { id: 'o1', title: 'Order Food' },
                { id: 'o2', title: "Today's Offers" },
              ],
            },
            {
              id: 'q2',
              text: 'Mood?',
              kind: 'choice',
              saveAs: 'billing_agent',
              options: [
                { id: 'b', title: 'Burgers' },
                { id: 'p', title: 'Pizza' },
                { id: 'c', title: 'Chicken' },
                { id: 's', title: 'Snacks' },
              ],
            },
            {
              id: 'q3',
              text: 'How many?',
              kind: 'number',
              saveAs: 'qty',
              errorText: 'numbers only',
            },
          ],
          doneText: 'Thanks {{contact.name}}! {{ai_agent}} / {{billing_agent}} x{{qty}}',
        },
        { next: 'after' },
      ),
      node('after', 'message', { text: 'done' }, {}),
    ],
  };
  const h = harness(g);
  const state = newState();
  let r = await h.engine.start(h.ctx, state);
  assert.equal(r.status, 'waiting');
  assert.equal(h.sent[0].text, 'What would you like to do?');
  assert.equal(h.sent[0].buttons?.length, 2);

  h.say('x', 'zzz'); // اختيار غير صالح: يعيد السؤال بدون حفظ
  r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'waiting');
  assert.equal(h.sent[1].text, 'What would you like to do?');
  assert.equal(h.attrs.ai_agent, undefined);

  h.say('Order Food', 'o1');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(h.attrs.ai_agent, 'Order Food');
  assert.equal(h.sent[2].list?.sections[0].rows.length, 4); // أكتر من 3 اختيارات → قائمة

  h.say('Pizza', 'p');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(h.attrs.billing_agent, 'Pizza');
  assert.equal(state.waiting?.step, 2);

  h.say('abc');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'waiting');
  assert.equal(h.sent[h.sent.length - 2].text, 'numbers only');

  h.say('٣');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'completed');
  assert.equal(h.attrs.qty, 3);
  const texts = h.sent.map((s) => s.text);
  assert.ok(texts.includes('Thanks Ali! Order Food / Pizza x3'));
  assert.equal(texts[texts.length - 1], 'done');
});

test('user_input: retries exhausted stops the flow without saving', async () => {
  const g: FlowGraph = {
    startNodeId: 'ui',
    nodes: [
      node(
        'ui',
        'user_input',
        {
          questions: [{ id: 'q', text: 'Email?', kind: 'email', saveAs: 'mail', retries: 1 }],
          doneText: 'ok',
        },
        { next: 'n' },
      ),
      node('n', 'message', { text: 'never' }, {}),
    ],
  };
  const h = harness(g);
  const state = newState();
  await h.engine.start(h.ctx, state);
  h.say('bad');
  let r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'waiting');
  h.say('still bad');
  r = await h.engine.resume(h.ctx, state);
  assert.equal(r.status, 'completed');
  assert.equal(h.attrs.mail, undefined);
  assert.ok(!h.sent.some((s) => s.text === 'never' || s.text === 'ok'));
});

test('user_input: validation rejects duplicate keys and 1-option choices', () => {
  const g: FlowGraph = {
    startNodeId: 'ui',
    nodes: [
      node(
        'ui',
        'user_input',
        {
          questions: [
            { id: 'a', text: 'A', kind: 'text', saveAs: 'k' },
            { id: 'b', text: 'B', kind: 'choice', saveAs: 'k', options: [{ id: '1', title: 'x' }] },
          ],
        },
        {},
      ),
    ],
  };
  const msgs = validateGraph(g).errors.map((e) => e.message);
  assert.ok(msgs.includes('Custom field keys must be unique'));
  assert.ok(msgs.includes('Multiple choice needs at least 2 options'));
});

test('media blocks: send media with interpolated url, skip caption for audio, reject bad urls', async () => {
  const g: FlowGraph = {
    startNodeId: 'i',
    nodes: [
      node(
        'i',
        'image',
        { url: 'https://x.test/{{contact.name}}.png', caption: 'Hi {{contact.name}}' },
        { next: 'a' },
      ),
      node('a', 'audio', { url: 'https://x.test/a.mp3', caption: 'ignored' }, { next: 'f' }),
      node(
        'f',
        'file',
        { url: 'https://x.test/m.pdf', filename: 'menu.pdf', caption: 'menu' },
        { next: 'v' },
      ),
      node('v', 'video', { url: '' }, { next: 'm' }),
      node('m', 'message', { text: 'end' }, {}),
    ],
  };
  const h = harness(g);
  const r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'completed');
  assert.deepEqual(h.sent[0].media, {
    kind: 'image',
    url: 'https://x.test/Ali.png',
    caption: 'Hi Ali',
  });
  assert.deepEqual(h.sent[1].media, { kind: 'audio', url: 'https://x.test/a.mp3' });
  assert.deepEqual(h.sent[2].media, {
    kind: 'file',
    url: 'https://x.test/m.pdf',
    caption: 'menu',
    filename: 'menu.pdf',
  });
  assert.equal(h.sent.length, 4); // الفيديو بدون رابط يُتخطى
  assert.equal(h.sent[3].text, 'end');
  const bad = validateGraph({
    startNodeId: 'x',
    nodes: [node('x', 'image', { url: 'javascript:alert(1)' }, {})],
  });
  assert.ok(bad.errors.some((e) => e.message.includes('media URL')));
});

test('random_number: inclusive integer range saved as variable, validated', async () => {
  const g: FlowGraph = {
    startNodeId: 'r',
    nodes: [
      node('r', 'random_number', { min: 5, max: 10, saveAs: 'lucky' }, { next: 'm' }),
      node('m', 'message', { text: 'n={{lucky}}' }, {}),
    ],
  };
  const lo = harness(g, { random: () => 0 });
  await lo.engine.start(lo.ctx, newState());
  assert.equal(lo.sent[0].text, 'n=5');
  const hi = harness(g, { random: () => 0.999999 });
  await hi.engine.start(hi.ctx, newState());
  assert.equal(hi.sent[0].text, 'n=10');
  const same = harness(
    { startNodeId: 'r', nodes: [node('r', 'random_number', { min: 7, max: 7, saveAs: 'x' }, {})] },
    { random: () => 0.99 },
  );
  const st = newState();
  await same.engine.start(same.ctx, st);
  assert.equal(st.vars.x, 7);
  const bad = validateGraph({
    startNodeId: 'r',
    nodes: [node('r', 'random_number', { min: 9, max: 2, saveAs: '1x' }, {})],
  });
  assert.ok(bad.errors.some((e) => e.message === 'Min must not exceed max'));
  assert.ok(bad.errors.some((e) => e.message.includes('saveAs')));
});

test('interactive message: routes by chosen button and needs options', async () => {
  const g: FlowGraph = {
    startNodeId: 'i',
    nodes: [
      node(
        'i',
        'interactive',
        {
          text: 'Pick',
          buttons: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
          ],
        },
        { 'option:a': 'x', 'option:b': 'y' },
      ),
      node('x', 'message', { text: 'got A' }, {}),
      node('y', 'message', { text: 'got B' }, {}),
    ],
  };
  const h = harness(g);
  const st = newState();
  assert.equal((await h.engine.start(h.ctx, st)).status, 'waiting');
  assert.deepEqual(h.sent[0].buttons, [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
  ]);
  h.ctx.lastMessage = { text: 'B', replyId: 'b' };
  const r = await h.engine.resume(h.ctx, st);
  assert.equal(r.status, 'completed');
  assert.equal(h.sent[1].text, 'got B');
  const bad = validateGraph({
    startNodeId: 'i',
    nodes: [node('i', 'interactive', { text: 'Hi' }, {})],
  });
  assert.ok(bad.errors.some((e) => e.message.includes('Interactive message needs')));
});

// ------------------------------------------------------------- Google Sheet fetch

import { isAllowedSheetHost, lookupRow, parseCsv, parseSheetUrl } from './sheet';

test('parseSheetUrl: share, gid, published links; rejects other hosts and junk', () => {
  assert.equal(
    parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit?usp=sharing')
      ?.csvUrl,
    'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/gviz/tq?tqx=out%3Acsv',
  );
  assert.match(
    parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit#gid=12345')!.csvUrl,
    /gid=12345/,
  );
  assert.match(
    parseSheetUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vAbCdEfGhIj/pub?output=csv')!
      .csvUrl,
    /\/d\/e\/2PACX-1vAbCdEfGhIj\/pub\?output=csv/,
  );
  assert.equal(parseSheetUrl('https://evil.test/spreadsheets/d/1AbCdEfGhIjKlMn/edit'), null);
  assert.equal(parseSheetUrl('http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit'), null);
  assert.equal(
    parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit?gid=1;rm'),
    null,
  );
  assert.equal(parseSheetUrl('not a url'), null);
  assert.ok(isAllowedSheetHost('doc-0g-abc.googleusercontent.com'));
  assert.ok(!isAllowedSheetHost('googleusercontent.com.evil.test'));
});

test('parseCsv + lookupRow: quotes, newlines in cells, phone digits, missing column', () => {
  const rows = parseCsv(
    '\uFEFFname,phone,note\r\n"Ali, K",+20 100-123-456,"line1\nline2"\r\nSara,0111222333,"say ""hi"""\r\n\r\n',
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['Ali, K', '+20 100-123-456', 'line1\nline2']);
  assert.equal(lookupRow(rows, 'phone', '20100123456').row?.name, 'Ali, K');
  assert.equal(lookupRow(rows, 'PHONE', '0111222333').row?.note, 'say "hi"');
  assert.equal(lookupRow(rows, 'phone', '999').row, null);
  assert.equal(lookupRow(rows, 'nope', 'x').row, null);
  assert.equal(lookupRow(rows, '', '').row?.name, 'Ali, K');
  assert.equal(lookupRow(rows, 'name', 'sara').index, 2);
});

test('sheet_fetch: found maps columns, not_found / error / blocked host take their edges', async () => {
  const csv = 'name,phone,plan\nAli,2010,gold\nSara,2011,basic\n';
  const seen: string[] = [];
  const mk = (http: any, d: any = {}) =>
    harness(
      {
        startNodeId: 's',
        nodes: [
          node(
            's',
            'sheet_fetch',
            {
              url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit',
              lookupColumn: 'phone',
              lookupValue: '{{phone}}',
              saveAs: [{ column: 'plan', variable: 'plan' }],
              ...d,
            },
            { found: 'f', not_found: 'n', error: 'e' },
          ),
          node('f', 'message', { text: 'plan={{plan}}' }, {}),
          node('n', 'message', { text: 'none' }, {}),
          node('e', 'message', { text: 'err' }, {}),
        ],
      },
      { http },
    );
  const ok = async (spec: any) => (seen.push(spec.url), { status: 200, ok: true, body: csv });
  const a = mk(ok);
  const st = newState();
  st.vars.phone = '2011';
  await a.engine.start(a.ctx, st);
  assert.equal(a.sent[0].text, 'plan=basic');
  assert.match(seen[0], /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1AbCdEfGhIjKlMn\/gviz\/tq/);

  const b = mk(ok);
  const st2 = newState();
  st2.vars.phone = '404';
  await b.engine.start(b.ctx, st2);
  assert.equal(b.sent[0].text, 'none');

  const c = mk(async () => ({
    status: 200,
    ok: true,
    body: '<!DOCTYPE html><html>sign in</html>',
  }));
  await c.engine.start(c.ctx, newState());
  assert.equal(c.sent[0].text, 'err');

  const hops: string[] = [];
  const d = mk(async (spec: any) => {
    hops.push(spec.url);
    return hops.length === 1
      ? {
          status: 307,
          ok: false,
          body: '',
          headers: { location: 'https://doc-0g-abc.googleusercontent.com/export/x' },
        }
      : { status: 200, ok: true, body: csv };
  });
  const st3 = newState();
  st3.vars.phone = '2010';
  await d.engine.start(d.ctx, st3);
  assert.equal(d.sent[0].text, 'plan=gold');
  assert.equal(hops.length, 2);

  const e = mk(async () => ({
    status: 302,
    ok: false,
    body: '',
    headers: { location: 'https://evil.test/x' },
  }));
  await e.engine.start(e.ctx, newState());
  assert.equal(e.sent[0].text, 'err');

  const f = mk(ok, { url: 'https://evil.test/x' });
  await f.engine.start(f.ctx, newState());
  assert.equal(f.sent[0].text, 'err');
});

test('sheet_fetch validation: needs a Google link; button layout is ignored by the engine', () => {
  const bad = validateGraph({
    startNodeId: 's',
    nodes: [node('s', 'sheet_fetch', { url: 'https://example.com/x' }, {})],
  });
  assert.ok(bad.errors.some((e) => e.message.includes('public Google Sheet')));
  const good = validateGraph({
    startNodeId: 's',
    nodes: [
      node(
        's',
        'sheet_fetch',
        {
          url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit',
          saveAs: [{ column: 'a', variable: 'a' }],
        },
        {},
      ),
    ],
  });
  assert.equal(good.errors.length, 0);
});

import { clickableOptions } from './types';
test('clickableOptions: buttons, list rows, and only the current user_input choice question', () => {
  const m = node('m', 'interactive', {
    buttons: [{ id: 'a', title: 'A' }],
    list: { buttonText: 'x', sections: [{ rows: [{ id: 'r1', title: 'R' }] }] },
  });
  assert.deepEqual(
    clickableOptions(m, { nodeId: 'm', kind: 'choice', retries: 0 }).map((o) => o.id),
    ['a', 'r1'],
  );
  const u = node('u', 'user_input', {
    questions: [
      { id: 'q1', kind: 'text' },
      { id: 'q2', kind: 'choice', options: [{ id: 'o1', title: 'One' }] },
    ],
  });
  assert.deepEqual(
    clickableOptions(u, { nodeId: 'u', kind: 'answer', retries: 0, step: 1 }).map((o) => o.id),
    ['o1'],
  );
  assert.deepEqual(clickableOptions(u, { nodeId: 'u', kind: 'answer', retries: 0, step: 0 }), []);
  assert.deepEqual(clickableOptions(m, { nodeId: 'm', kind: 'delay', retries: 0 }), []);
  assert.deepEqual(clickableOptions(undefined, null), []);
});

test('WhatsApp form waits through unrelated/stale replies, isolates sessions and resumes after reopening', async () => {
  const graph: FlowGraph = {
    startNodeId: 'form',
    nodes: [
      node(
        'form',
        'whatsapp_flow',
        { text: 'Book', flowId: '123', cta: 'Open', screen: 'START', saveAs: 'booking' },
        { ok: 'done' },
      ),
      node('done', 'message', { text: 'Received' }),
    ],
  };
  const a = harness(graph),
    b = harness(graph);
  a.ctx.channel.type = b.ctx.channel.type = 'whatsapp';
  const first = await a.engine.start(a.ctx, newState());
  const other = await b.engine.start(b.ctx, newState());
  assert.equal(first.status, 'waiting');
  assert.ok(first.state.waiting?.formToken);
  assert.notEqual(first.state.waiting?.formToken, other.state.waiting?.formToken);
  const saved = JSON.parse(JSON.stringify(first.state));
  a.say('hello');
  assert.equal((await a.engine.resume(a.ctx, saved)).status, 'waiting');
  assert.equal(a.sent.length, 1);
  a.ctx.lastMessage = { text: '', formReply: { flow_token: other.state.waiting?.formToken } };
  assert.equal((await a.engine.resume(a.ctx, saved)).status, 'waiting');
  a.ctx.lastMessage = {
    text: '',
    formReply: { flow_token: saved.waiting.formToken, date: '2026-11-01' },
  };
  const reopened = harness(graph);
  const result = await reopened.engine.resume(a.ctx, saved);
  assert.equal(result.status, 'completed');
  assert.equal((result.state.vars.booking as Record<string, unknown>).date, '2026-11-01');
  assert.equal(reopened.sent[0].text, 'Received');
});
test('commerce nodes reject missing product/service/form configuration before publication', () => {
  for (const type of ['product', 'catalog', 'appointment', 'whatsapp_flow'])
    assert.ok(
      validateGraph({ startNodeId: 'x', nodes: [node('x', type, {})] }).errors.length,
      type,
    );
  const productId = '00000000-0000-4000-8000-000000000001';
  assert.equal(
    validateGraph({ startNodeId: 'x', nodes: [node('x', 'product', { productId, native: false })] })
      .errors.length,
    0,
  );
  assert.ok(
    validateGraph({
      startNodeId: 'x',
      nodes: [
        node('x', 'catalog', {
          productIds: [productId, productId],
          text: 'Catalog',
          native: false,
        }),
      ],
    }).errors.some((e) => /unique/.test(e.message)),
  );
});

test('selectable catalog persists canonical product ID and branches using the saved choice after reopening', async () => {
  const productId = '00000000-0000-4000-8000-000000000001';
  const graph: FlowGraph = {
    startNodeId: 'catalog',
    nodes: [
      node(
        'catalog',
        'catalog',
        { productIds: [productId], text: 'Choose', selectable: true, saveAs: 'product' },
        { next: 'condition' },
      ),
      node(
        'condition',
        'condition',
        {
          rules: [
            {
              id: 'selected',
              conditions: [
                { source: 'variable', key: 'product', operator: 'equals', value: productId },
              ],
            },
          ],
        },
        { 'rule:selected': 'chosen', else: 'wrong' },
      ),
      node('chosen', 'message', { text: 'Selected {{product_name}}' }),
      node('wrong', 'message', { text: 'Wrong' }),
    ],
  };
  const catalogContent: EngineDeps['catalogContent'] = async (ids, native, text, selectable) => {
    assert.deepEqual(ids, [productId]);
    assert.equal(native, false);
    assert.equal(selectable, true);
    return {
      text,
      list: {
        buttonText: 'Products',
        sections: [{ rows: [{ id: 'product:' + productId, title: 'Umrah' }] }],
      },
    };
  };
  const h = harness(graph, { catalogContent });
  const first = await h.engine.start(h.ctx, newState());
  assert.equal(first.status, 'waiting');
  assert.deepEqual(clickableOptions(graph.nodes[0], first.state.waiting), [
    { id: 'product:' + productId, title: 'Umrah' },
  ]);
  const state = JSON.parse(JSON.stringify(first.state));
  h.say('invalid', 'product:other');
  assert.equal((await h.engine.resume(h.ctx, state)).status, 'waiting');
  assert.equal(state.vars.product, undefined);
  const reopened = harness(graph, { catalogContent });
  reopened.say('Umrah', 'product:' + productId);
  const done = await reopened.engine.resume(reopened.ctx, state);
  assert.equal(done.status, 'completed');
  assert.equal(done.state.vars.product, productId);
  assert.equal(reopened.sent[0].text, 'Selected Umrah');
});

test('question reply formats reject malformed URLs, calendar dates and times', () => {
  for (const [kind, good, bad] of [
    ['url', 'https://example.com/path?q=a', 'javascript:alert(1)'],
    ['date', '٢٠٢٨-٠٢-٢٩', '2026-02-29'],
    ['time', '23:59:59', '24:00'],
    ['datetime', '2026-12-25T14:30+02:00', '2026-02-30T14:30'],
  ] as const) {
    assert.equal(parseAnswer(good, kind).ok, true, kind);
    assert.equal(parseAnswer(bad, kind).ok, false, kind);
    assert.equal(parseAnswer('', kind).ok, false, kind);
  }
  assert.equal(parseAnswer('2026-01-01T12:60', 'datetime').ok, false);
  assert.equal(parseAnswer('2026-01-01T12:30+99:00', 'datetime').ok, false);
});

for (const kind of ['file', 'image', 'video'] as const) {
  test(`${kind} questions require matching inbound attachments and preserve provider references`, async () => {
    assert.equal(
      parseAnswer('https://example.com/file', kind).ok,
      false,
      'typed URLs cannot impersonate attachments',
    );
    assert.equal(
      parseAnswer('', kind, undefined, { kind: 'audio', url: 'https://example.com/audio' }).ok,
      false,
    );
    assert.equal(
      parseAnswer('', kind, undefined, { kind }).ok,
      false,
      'missing media references cannot finish a question',
    );
    const graph: FlowGraph = {
      startNodeId: 'q',
      nodes: [
        node(
          'q',
          'question',
          { text: 'Attach media', answerType: kind, saveAs: 'attachment', retries: 2 },
          { ok: 'end' },
        ),
        node('end', 'end'),
      ],
    };
    const h = harness(graph);
    const waiting = await h.engine.start(h.ctx, newState());
    h.ctx.lastMessage = { text: 'wrong input' };
    const rejected = await h.engine.resume(h.ctx, waiting.state);
    assert.equal(rejected.status, 'waiting');
    assert.equal(rejected.state.vars.attachment, undefined);
    h.ctx.lastMessage = { text: '', media: { kind, providerMediaId: 'provider-attachment-id' } };
    const accepted = await h.engine.resume(h.ctx, rejected.state);
    assert.equal(accepted.state.vars.attachment, 'provider-attachment-id');
  });
  test(`user input ${kind} questions save verified media and advance to the following question`, async () => {
    const graph: FlowGraph = {
      startNodeId: 'form',
      nodes: [
        node('form', 'user_input', {
          questions: [
            { id: 'one', kind, text: 'Attach', saveAs: 'attachment' },
            { id: 'two', kind: 'date', text: 'Date', saveAs: 'travelDate' },
          ],
        }),
      ],
    };
    const h = harness(graph);
    const first = await h.engine.start(h.ctx, newState());
    h.ctx.lastMessage = { text: '', media: { kind, url: 'https://example.com/upload' } };
    const next = await h.engine.resume(h.ctx, first.state);
    assert.equal(h.attrs.attachment, 'https://example.com/upload');
    assert.equal(next.state.waiting?.step, 1);
    h.say('2026-12-25');
    const done = await h.engine.resume(h.ctx, next.state);
    assert.equal(done.state.vars.travelDate, '2026-12-25');
    assert.equal(h.attrs.travelDate, '2026-12-25');
  });
}

test('dynamic catalog pages, current detail checks, CRM inquiry and existing handoff survive restored state', async () => {
  const source = '11111111-1111-4111-8111-111111111111',
    id = '22222222-2222-4222-8222-222222222222';
  const graph: FlowGraph = {
    startNodeId: 'catalog',
    nodes: [
      node(
        'catalog',
        'catalog',
        { sourceId: source, text: 'Choose', category: 'عمرة', fields: ['ثلاثي'] },
        { next: 'staff' },
      ),
      node('staff', 'handoff', {}),
    ],
  };
  assert.equal(validateGraph(graph).errors.length, 0);
  let hidden = false;
  const pages: number[] = [];
  const dynamicCatalog: EngineDeps['dynamicCatalog'] = async (req) => {
    pages.push(req.page ?? 0);
    assert.equal(req.sourceId, source);
    return {
      text: 'Choose',
      list: {
        buttonText: 'Browse',
        sections: [
          {
            rows: [
              { id: 'dynamic:' + id, title: 'Old name' },
              { id: req.page ? 'dynamic:prev' : 'dynamic:next', title: 'Page' },
            ],
          },
        ],
      },
    };
  };
  const dynamicItem: EngineDeps['dynamicItem'] = async (s, p, fields) => {
    assert.equal(s, source);
    assert.equal(p, id);
    assert.deepEqual(fields, ['ثلاثي']);
    if (hidden) throw new Error('unavailable');
    return {
      selection: { id, name: 'Current name', category: 'عمرة', source },
      content: { text: 'Current price: 13500' },
    };
  };
  const h = harness(graph, { dynamicCatalog, dynamicItem });
  let first = await h.engine.start(h.ctx, newState());
  assert.equal(first.status, 'waiting');
  h.say('Next', 'dynamic:next');
  first = await h.engine.resume(h.ctx, JSON.parse(JSON.stringify(first.state)));
  assert.deepEqual(pages, [0, 1]);
  hidden = true;
  h.say('Old name', 'dynamic:' + id);
  first = await h.engine.resume(h.ctx, JSON.parse(JSON.stringify(first.state)));
  assert.equal(first.status, 'waiting');
  assert.equal(h.attrs.catalogSelection, undefined);
  assert.equal(h.calls.handoff, 0);
  hidden = false;
  const reopened = harness(graph, { dynamicCatalog, dynamicItem });
  reopened.say('Old name', 'dynamic:' + id);
  const done = await reopened.engine.resume(reopened.ctx, JSON.parse(JSON.stringify(first.state)));
  assert.equal(done.state.vars.selectedProductId, id);
  assert.deepEqual(reopened.attrs.catalogSelection, {
    id,
    name: 'Current name',
    category: 'عمرة',
    source,
  });
  assert.equal(reopened.calls.handoff, 1);
  assert.match(reopened.sent[0].text!, /13500/);
});
test('dynamic catalog empty results follow existing next edge without waiting', async () => {
  const graph: FlowGraph = {
    startNodeId: 'c',
    nodes: [
      node(
        'c',
        'catalog',
        {
          sourceId: '11111111-1111-4111-8111-111111111111',
          text: 'Choose',
          emptyText: 'No current items',
        },
        { next: 'end' },
      ),
      node('end', 'end'),
    ],
  };
  const h = harness(graph, { dynamicCatalog: async () => ({ text: 'Empty' }) });
  const r = await h.engine.start(h.ctx, newState());
  assert.equal(r.status, 'completed');
  assert.equal(h.sent[0].text, 'No current items');
});
