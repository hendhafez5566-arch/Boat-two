/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Edge, Node } from 'reactflow';

export type NodeType =
  | 'subflow'
  | 'message'
  | 'question'
  | 'condition'
  | 'set_variable'
  | 'set_attribute'
  | 'delay'
  | 'http_request'
  | 'business_hours'
  | 'split'
  | 'ai_reply'
  | 'handoff'
  | 'end';

export interface GNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, any>;
  edges: Record<string, string>;
}
export interface Graph {
  startNodeId: string;
  nodes: GNode[];
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
    color: '#0f766e',
    defaults: () => ({ flowId: '' }),
  },
  message: { label: 'رسالة', icon: '💬', color: '#2563eb', defaults: () => ({ text: '' }) },
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
  end: { label: 'نهاية', icon: '🏁', color: '#475569', defaults: () => ({}) },
};

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

export function summary(type: NodeType, d: Record<string, any>): string {
  switch (type) {
    case 'subflow':
      return 'تشغيل مكوّن منشور';
    case 'message':
      return d.text || (d.media?.url ? `[${d.media.kind}]` : '(فارغة)');
    case 'question':
      return `${d.text || '(بدون نص)'} → {{${d.saveAs || '?'}}}`;
    case 'condition':
      return `${(d.rules ?? []).length} شرط`;
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
      return `${d.amount} ${({ seconds: 'ثانية', minutes: 'دقيقة', hours: 'ساعة', days: 'يوم' } as any)[d.unit] ?? ''}`;
    case 'http_request':
      return `${d.method} ${d.url}`;
    case 'business_hours':
      return d.timezone;
    case 'split':
      return `${(d.branches ?? []).length} فروع`;
    case 'ai_reply':
      return d.instructions || 'المساعد الذكي يرد من قاعدة المعرفة';
    case 'handoff':
      return d.message || 'تحويل المحادثة لموظف';
    case 'end':
      return d.message || 'إنهاء';
  }
}

export interface RFData {
  type: NodeType;
  data: Record<string, any>;
  isStart: boolean;
  issue?: string;
}

export function toFlow(graph: Graph): { nodes: Node<RFData>[]; edges: Edge[] } {
  const nodes: Node<RFData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'flowNode',
    position: n.position ?? { x: 0, y: 0 },
    data: { type: n.type, data: n.data ?? {}, isStart: n.id === graph.startNodeId },
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
      return { id: n.id, type: n.data.type, position: n.position, data: n.data.data, edges: out };
    }),
  };
}

export type Trigger =
  | { type: 'event'; event: string }
  | { type: 'keyword'; keywords: string[]; match: 'contains' | 'exact' | 'starts_with' }
  | { type: 'reply_id'; ids: string[] }
  | { type: 'first_message' }
  | { type: 'any_message' };
