/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Edge, Node } from 'reactflow';

export type NodeType =
  | 'subflow'
  | 'message'
  | 'interactive'
  | 'location'
  | 'cta_url'
  | 'template'
  | 'sequence'
  | 'user_input'
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'question'
  | 'condition'
  | 'set_variable'
  | 'set_attribute'
  | 'delay'
  | 'http_request'
  | 'sheet_fetch'
  | 'business_hours'
  | 'split'
  | 'random_number'
  | 'ai_reply'
  | 'handoff'
  | 'tag'
  | 'note'
  | 'end';

export interface GNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  note?: string;
  /** Editor-only: position of each button card relative to its message (buttonId → offset). */
  layout?: Record<string, { x: number; y: number }>;
  data: Record<string, any>;
  edges: Record<string, string>;
}
export interface Graph {
  policy?: BotPolicy;
  startNodeId: string;
  nodes: GNode[];
}

export interface BotPolicy {
  sessionHours?: number;
  noMatchText?: string;
  businessHours?: { enabled: boolean; timezone: string; schedule: Partial<Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun',[string,string][]>>; offHoursText?: string };
}

export const uid = (n = 6) =>
  Math.random()
    .toString(36)
    .slice(2, 2 + n);

export const NODE_META: Record<
  NodeType,
  { label: string; icon: string; color: string; defaults: () => Record<string, any> }
> = {
  subflow: {
    label: 'مكوّن قابل لإعادة الاستخدام',
    icon: '↗',
    color: '#3d5afe',
    defaults: () => ({ flowId: '' }),
  },
  message: { label: 'رسالة', icon: '💬', color: '#2563eb', defaults: () => ({ text: '' }) },
  interactive: {
    label: 'رسالة تفاعلية',
    icon: '🧩',
    color: '#ef6a5b',
    defaults: () => ({ text: '', buttons: [{ id: uid(), title: 'خيار 1' }] }),
  },
  location: {
    label: 'موقع',
    icon: '📍',
    color: '#0ea5e9',
    defaults: () => ({ lat: '', lng: '', name: '', address: '' }),
  },
  cta_url: {
    label: 'زر رابط',
    icon: '🔗',
    color: '#4f46e5',
    defaults: () => ({ text: '', buttonText: 'افتح الرابط', url: 'https://', imageUrl: '' }),
  },
  image: { label: 'صورة', icon: '🖼️', color: '#7c3aed', defaults: () => ({ url: 'https://', caption: '' }) },
  audio: { label: 'صوت', icon: '🎙️', color: '#f59e0b', defaults: () => ({ url: 'https://' }) },
  video: { label: 'فيديو', icon: '▶️', color: '#e11d48', defaults: () => ({ url: 'https://', caption: '' }) },
  file: { label: 'ملف', icon: '📎', color: '#16a34a', defaults: () => ({ url: 'https://', caption: '', filename: '' }) },
  user_input: {
    label: 'تدفق إدخال المستخدم',
    icon: '☰',
    color: '#16a34a',
    defaults: () => ({
      name: '',
      questions: [
        {
          id: uid(),
          text: '',
          kind: 'choice',
          options: [
            { id: uid(), title: '' },
            { id: uid(), title: '' },
          ],
          saveAs: 'field_1',
        },
      ],
      doneText: '',
    }),
  },
  sequence: {
    label: 'إضافة لتسلسل',
    icon: '⏱',
    color: '#9333ea',
    defaults: () => ({ sequenceId: '' }),
  },
  template: {
    label: 'قالب واتساب',
    icon: '🧩',
    color: '#16a34a',
    defaults: () => ({ name: '', language: 'ar', bodyParams: [] }),
  },
  question: {
    label: 'سؤال',
    icon: '❓',
    color: '#7c3aed',
    defaults: () => ({ text: '', answerType: 'text', saveAs: 'answer', retries: 2 }),
  },
  condition: {
    label: 'شرط',
    icon: '🔀',
    color: '#d97706',
    defaults: () => ({
      rules: [
        {
          id: uid(),
          match: 'all',
          conditions: [{ source: 'variable', key: '', operator: 'equals', value: '' }],
        },
      ],
    }),
  },
  set_variable: {
    label: 'متغيّر',
    icon: '🧮',
    color: '#0d9488',
    defaults: () => ({ assignments: [{ name: '', operation: 'set', value: '' }] }),
  },
  set_attribute: {
    label: 'بيانات العميل',
    icon: '👤',
    color: '#0891b2',
    defaults: () => ({ key: '', value: '' }),
  },
  delay: {
    label: 'انتظار',
    icon: '⏱️',
    color: '#64748b',
    defaults: () => ({ amount: 5, unit: 'minutes' }),
  },
  http_request: {
    label: 'طلب API',
    icon: '🌐',
    color: '#dc2626',
    defaults: () => ({ method: 'GET', url: 'https://', headers: [], saveAs: [] }),
  },
  sheet_fetch: {
    label: 'جلب بيانات من Google Sheet',
    icon: '📊',
    color: '#16a34a',
    defaults: () => ({ url: 'https://', lookupColumn: '', lookupValue: '', saveAs: [{ column: '', variable: '' }] }),
  },
  business_hours: {
    label: 'ساعات العمل',
    icon: '🕘',
    color: '#ca8a04',
    defaults: () => ({
      timezone: 'Africa/Cairo',
      schedule: {
        sun: [['09:00', '17:00']],
        mon: [['09:00', '17:00']],
        tue: [['09:00', '17:00']],
        wed: [['09:00', '17:00']],
        thu: [['09:00', '17:00']],
      },
    }),
  },
  split: {
    label: 'تقسيم عشوائي',
    icon: '🎲',
    color: '#9333ea',
    defaults: () => ({
      branches: [
        { id: uid(), weight: 50 },
        { id: uid(), weight: 50 },
      ],
    }),
  },
  random_number: {
    label: 'مولّد رقم عشوائي',
    icon: '#',
    color: '#e11d48',
    defaults: () => ({ min: 1, max: 100, saveAs: 'random_number' }),
  },
  ai_reply: {
    label: 'ذكاء اصطناعي',
    icon: '🤖',
    color: '#4f46e5',
    defaults: () => ({ answerFirst: true, maxTurns: 20, exitKeywords: [] }),
  },
  handoff: {
    label: 'تحويل لموظف',
    icon: '🧑‍💼',
    color: '#16a34a',
    defaults: () => ({ message: '' }),
  },
  tag: {
    label: 'تعيين وسم',
    icon: '🏷️',
    color: '#0ea5e9',
    defaults: () => ({ add: [], remove: [] }),
  },
  note: {
    label: 'ملاحظة داخلية',
    icon: '📝',
    color: '#a16207',
    defaults: () => ({ body: '' }),
  },
  end: { label: 'نهاية', icon: '🏁', color: '#475569', defaults: () => ({}) },
};

/** مجموعات لوحة البلوكات (Flow blocks) */
export const NODE_GROUPS: { id: string; ar: string; en: string; types: NodeType[] }[] = [
  { id: 'messages', ar: 'الرسائل', en: 'MESSAGES', types: ['message', 'image', 'audio', 'video', 'file', 'location', 'ai_reply'] },
  { id: 'interactive', ar: 'التفاعلي', en: 'INTERACTIVE', types: ['interactive', 'cta_url', 'template'] },
  { id: 'data', ar: 'جمع البيانات', en: 'DATA COLLECTION', types: ['user_input', 'question', 'set_variable', 'set_attribute', 'note'] },
  {
    id: 'control',
    ar: 'التحكم في المسار',
    en: 'FLOW CONTROL',
    types: ['condition', 'sequence', 'tag', 'random_number', 'split', 'delay', 'business_hours', 'handoff', 'subflow', 'end'],
  },
  { id: 'integrations', ar: 'التكاملات', en: 'INTEGRATIONS', types: ['http_request', 'sheet_fetch'] },
];

export function optionsOf(data: Record<string, any>): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const b of data.buttons ?? []) out.push({ id: b.id, title: b.title });
  for (const s of data.list?.sections ?? [])
    for (const r of s.rows ?? []) out.push({ id: r.id, title: r.title });
  return out;
}

export function handlesFor(
  type: NodeType,
  data: Record<string, any>,
): { id: string; label: string }[] {
  switch (type) {
    case 'interactive':
    case 'message': {
      const o = optionsOf(data);
      return o.length
        ? [
            ...o.map((x) => ({ id: `option:${x.id}`, label: x.title || '…' })),
            { id: 'fallback', label: 'رد آخر' },
          ]
        : [{ id: 'next', label: 'التالي' }];
    }
    case 'question':
      return [
        { id: 'ok', label: 'إجابة صحيحة' },
        { id: 'fail', label: 'فشل' },
      ];
    case 'condition':
      return [
        ...(data.rules ?? []).map((r: any, i: number) => ({
          id: `rule:${r.id}`,
          label: `شرط ${i + 1}`,
        })),
        { id: 'else', label: 'غير ذلك' },
      ];
    case 'http_request':
      return [
        { id: 'success', label: 'نجاح' },
        { id: 'error', label: 'خطأ' },
      ];
    case 'sheet_fetch':
      return [
        { id: 'found', label: 'تم العثور' },
        { id: 'not_found', label: 'غير موجود' },
        { id: 'error', label: 'خطأ' },
      ];
    case 'business_hours':
      return [
        { id: 'open', label: 'مفتوح' },
        { id: 'closed', label: 'مغلق' },
      ];
    case 'ai_reply':
      return [
        { id: 'done', label: 'انتهت المحادثة' },
        { id: 'handoff', label: 'تحويل لموظف' },
        { id: 'error', label: 'فشل' },
      ];
    case 'split':
      return (data.branches ?? []).map((b: any) => ({
        id: `branch:${b.id}`,
        label: `${b.weight}%`,
      }));
    case 'handoff':
    case 'end':
      return [];
    default:
      return [{ id: 'next', label: 'التالي' }];
  }
}

export function summary(type: NodeType, d: Record<string, any>, language = 'ar'): string {
  const en = language === 'en';
  switch (type) {
    case 'subflow':
      return en ? 'Run published component' : 'تشغيل مكوّن منشور';
    case 'location':
      return d.name || (d.lat && d.lng ? `${d.lat}, ${d.lng}` : en ? '(no coordinates)' : '(بدون إحداثيات)');
    case 'cta_url':
      return `${d.buttonText || ''} → ${d.url || ''}`;
    case 'image':
    case 'audio':
    case 'video':
    case 'file':
      return d.filename || d.caption || (d.url && d.url !== 'https://' ? d.url : en ? '(no URL)' : '(بدون رابط)');
    case 'user_input': {
      const n = (d.questions ?? []).length;
      return n ? `${d.name ? d.name + ' · ' : ''}${n} ${en ? 'questions' : 'أسئلة'}` : en ? '(add questions)' : '(أضف أسئلة)';
    }
    case 'sequence':
      return d.sequenceId ? (en ? 'Add contact to sequence' : 'إضافة العميل لتسلسل') : en ? '(choose a sequence)' : '(اختر تسلسلًا)';
    case 'template':
      return d.name || (en ? '(no template)' : '(بدون قالب)');
    case 'interactive':
    case 'message':
      return d.text || (d.media?.url ? `[${d.media.kind}]` : en ? '(empty)' : '(فارغة)');
    case 'question':
      return `${d.text || (en ? '(no text)' : '(بدون نص)')} → {{${d.saveAs || '?'}}}`;
    case 'condition':
      return `${(d.rules ?? []).length} ${en ? 'conditions' : 'شرط'}`;
    case 'set_variable':
      return (
        (d.assignments ?? [])
          .map((a: any) => a.name)
          .filter(Boolean)
          .join(', ') || '—'
      );
    case 'set_attribute':
      return d.key ? `${d.key} = ${d.value}` : '—';
    case 'delay':
      return `${d.amount} ${(en ? { seconds: 'seconds', minutes: 'minutes', hours: 'hours', days: 'days' } : ({ seconds: 'ثانية', minutes: 'دقيقة', hours: 'ساعة', days: 'يوم' } as any))[d.unit] ?? ''}`;
    case 'http_request':
      return `${d.method} ${d.url}`;
    case 'sheet_fetch':
      return d.url && d.url !== 'https://'
        ? `${d.lookupColumn ? d.lookupColumn + ' = ' + (d.lookupValue || '…') : en ? 'First row' : 'أول صف'}`
        : en ? '(add a sheet link)' : '(أضف رابط الشيت)';
    case 'business_hours':
      return d.timezone;
    case 'split':
      return `${(d.branches ?? []).length} ${en ? 'branches' : 'فروع'}`;
    case 'random_number':
      return `${d.min ?? 1} – ${d.max ?? 100} → {{${d.saveAs || '?'}}}`;
    case 'ai_reply':
      return (
        d.instructions ||
        (en ? 'Assistant replies from knowledge' : 'المساعد الذكي يرد من قاعدة المعرفة')
      );
    case 'tag': {
      const a = (d.add ?? []).map((x: string) => `+${x}`);
      const r = (d.remove ?? []).map((x: string) => `−${x}`);
      return [...a, ...r].join('  ') || '—';
    }
    case 'note':
      return d.body || '—';
    case 'handoff':
      return d.message || (en ? 'Hand off conversation to an agent' : 'تحويل المحادثة لموظف');
    case 'end':
      return d.message || (en ? 'End' : 'إنهاء');
  }
}

export interface RFData {
  type: NodeType;
  data: Record<string, any>;
  isStart: boolean;
  issue?: string;
  /** Sticky comment saved with the node (ignored by the engine). */
  note?: string;
  /** Button card offsets relative to this step (persisted as GNode.layout). */
  layout?: Record<string, { x: number; y: number }>;
  /** Editor-only: this step's buttons are drawn as separate cards. */
  splitButtons?: boolean;
  /** Editor-only: test-preview progress marker. */
  preview?: 'active' | 'visited';
  /** Editor-only: source handle ids that already have an outgoing edge. */
  linked?: string[];
  /** Editor-only: stable node actions injected by the designer; never persisted. */
  actions?: {
    duplicate: (id: string) => void;
    remove: (id: string) => void;
    setStart: (id: string) => void;
  };
}

export function toFlow(graph: Graph): { nodes: Node<RFData>[]; edges: Edge[] } {
  const nodes: Node<RFData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'flowNode',
    position: n.position ?? { x: 0, y: 0 },
    data: {
      type: n.type,
      data: n.data ?? {},
      isStart: n.id === graph.startNodeId,
      note: n.note,
      layout: n.layout,
    },
  }));
  const edges: Edge[] = [];
  for (const n of graph.nodes) {
    for (const [h, target] of Object.entries(n.edges ?? {})) {
      edges.push({ id: `${n.id}:${h}`, source: n.id, sourceHandle: h, target, type: 'smoothstep' });
    }
  }
  return { nodes, edges };
}

export function fromFlow(nodes: Node<RFData>[], edges: Edge[], startNodeId: string): Graph {
  return {
    startNodeId,
    nodes: nodes.map((n) => {
      const valid = new Set(handlesFor(n.data.type, n.data.data).map((h) => h.id));
      const out: Record<string, string> = {};
      for (const e of edges)
        if (e.source === n.id && e.sourceHandle && valid.has(e.sourceHandle))
          out[e.sourceHandle] = e.target;
      const live = new Set<string>(optionsOf(n.data.data ?? {}).map((o) => o.id));
      const layout = Object.fromEntries(Object.entries(n.data.layout ?? {}).filter(([k]) => live.has(k)));
      return {
        id: n.id,
        type: n.data.type,
        position: n.position,
        ...(n.data.note?.trim() ? { note: n.data.note.trim() } : {}),
        ...(Object.keys(layout).length ? { layout } : {}),
        data: n.data.data,
        edges: out,
      };
    }),
  };
}

export type Trigger =
  | { type: 'event'; event: string }
  | { type: 'keyword'; keywords: string[]; match: 'contains' | 'exact' | 'starts_with' }
  | { type: 'reply_id'; ids: string[] }
  | { type: 'first_message' }
  | { type: 'any_message' };

// ---------------------------------------------------------------- button cards

/** Steps whose buttons and list rows are drawn as separate, individually connectable cards. */
export function hasButtonCards(type: NodeType, data: Record<string, any>): boolean {
  return (type === 'interactive' || type === 'message') && optionsOf(data).length > 0;
}

export const BUTTON_NODE_TYPE = 'flowButton';
export const buttonNodeId = (parentId: string, buttonId: string) => `btn:${parentId}:${buttonId}`;
export const CARD_WIDTH = 290;
export const BUTTON_CARD_WIDTH = 220;
const GAP = 70;

/** Where a button card sits relative to its message until the user drags it elsewhere. */
export function defaultButtonOffset(index: number, rtl: boolean): { x: number; y: number } {
  return { x: rtl ? -(BUTTON_CARD_WIDTH + GAP) : CARD_WIDTH + GAP, y: 24 + index * 168 };
}

export interface ButtonNodeData {
  parentId: string;
  buttonId: string;
  title: string;
  linked: boolean;
  rtl: boolean;
}

/**
 * Derives the button cards and the edges that make them look like independent steps.
 * Nothing here is persisted as a node: the saved graph keeps `option:<buttonId>` edges on the message,
 * so the engine and the validator are unaffected.
 */
export function deriveButtonCards(
  nodes: Node<RFData>[],
  edges: Edge[],
  rtl: boolean,
  dims: Record<string, { width: number; height: number }> = {},
): {
  cardNodes: Node<ButtonNodeData>[];
  edges: Edge[];
  index: Record<string, { parentId: string; buttonId: string }>;
} {
  const cardNodes: Node<ButtonNodeData>[] = [];
  const links: Edge[] = [];
  const index: Record<string, { parentId: string; buttonId: string }> = {};
  const sourced = new Set(edges.map((e) => `${e.source}\u0000${e.sourceHandle}`));
  for (const n of nodes) {
    if (!hasButtonCards(n.data.type, n.data.data)) continue;
    let nextY = 24;
    optionsOf(n.data.data).forEach((b, i) => {
      const id = buttonNodeId(n.id, b.id);
      const rel = n.data.layout?.[b.id] ?? { ...defaultButtonOffset(i, rtl), y: nextY };
      nextY = rel.y + Math.max(140, dims[id]?.height || 0) + 28;
      index[id] = { parentId: n.id, buttonId: b.id };
      cardNodes.push({
        id,
        type: BUTTON_NODE_TYPE,
        position: { x: n.position.x + rel.x, y: n.position.y + rel.y },
        deletable: false,
        ...(dims[id] ?? {}),
        data: {
          parentId: n.id,
          buttonId: b.id,
          title: b.title,
          linked: sourced.has(`${n.id}\u0000option:${b.id}`),
          rtl,
        },
      } as Node<ButtonNodeData>);
      links.push({
        id: `blink:${n.id}:${b.id}`,
        source: n.id,
        sourceHandle: 'btns',
        target: id,
        targetHandle: 'in',
        type: 'buttonLink',
        selectable: false,
        deletable: false,
        focusable: false,
        updatable: false,
      } as Edge);
    });
  }
  const rerouted = edges.map((e) => {
    const hit = e.sourceHandle?.startsWith('option:')
      ? index[buttonNodeId(e.source, e.sourceHandle.slice('option:'.length))]
      : undefined;
    return hit ? { ...e, source: buttonNodeId(e.source, hit.buttonId), sourceHandle: 'out' } : e;
  });
  return { cardNodes, edges: [...links, ...rerouted], index };
}
