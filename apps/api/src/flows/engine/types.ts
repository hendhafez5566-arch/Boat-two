/* eslint-disable @typescript-eslint/no-explicit-any */
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

export interface FlowNode {
  id: string;
  type: NodeType;
  position?: { x: number; y: number };
  note?: string;
  /** محرر فقط: مواقع كروت الأزرار على الـ canvas */
  layout?: Record<string, { x: number; y: number }>;
  data: Record<string, any>;
  /** handle → id العقدة التالية. غياب الحافة يعني نهاية الـ flow */
  edges: Record<string, string>;
}

export interface FlowGraph {
  startNodeId: string;
  nodes: FlowNode[];
}

export interface OutContent {
  text?: string;
  media?: {
    kind: 'image' | 'video' | 'audio' | 'file';
    url?: string;
    caption?: string;
    filename?: string;
  };
  buttons?: { id: string; title: string }[];
  cta?: { text: string; url: string };
  location?: { lat: number; lng: number; name?: string; address?: string };
  template?: {
    name: string;
    language: string;
    bodyParams: string[];
    header?: { type: 'text'; text: string } | { type: 'image' | 'video' | 'document'; url: string; filename?: string };
    buttonParams?: { index: number; type: 'quick_reply' | 'url'; value: string }[];
  };
  list?: {
    buttonText: string;
    sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  };
}

export interface FlowContact {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  attributes: Record<string, unknown>;
  tags?: string[];
}

export interface FlowContext {
  contact: FlowContact;
  channel: { id?: string; type: string };
  lastMessage: { text: string; replyId?: string };
}

export interface FlowState {
  vars: Record<string, unknown>;
  waiting: null | {
    nodeId: string;
    kind: 'choice' | 'answer' | 'delay' | 'ai';
    retries: number;
    until?: string;
    /** رقم السؤال الحالي داخل بلوك user_input */
    step?: number;
  };
  totalSteps: number;
}

export interface HttpRequestSpec {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}
export interface HttpResult {
  status: number;
  ok: boolean;
  body: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface AiRequest {
  instructions?: string;
  text: string;
}
export interface AiResult {
  text: string;
  /** الذكاء الاصطناعي طلب تحويل المحادثة لموظف */
  handoff: boolean;
  /** فشل متوقع (مثل نفاد الرصيد): text يحمل رسالة الاعتذار */
  failed?: boolean;
}

export interface EngineDeps {
  /** Durable production execution; the simulator supplies an explicitly mocked executor. */
  executeButtonAction?(action: ButtonAction, occurrence: string): Promise<void>;
  ai(req: AiRequest): Promise<AiResult>;
  send(content: OutContent, meta?: { nodeId?: string }): Promise<void>;
  http(req: HttpRequestSpec): Promise<HttpResult>;
  setContactAttribute(key: string, value: unknown): Promise<void>;
  updateTags(change: { add: string[]; remove: string[] }): Promise<void>;
  addNote(body: string): Promise<void>;
  handoff(opts: { assignTo?: string; departmentId?: string }): Promise<void>;
  closeConversation(): Promise<void>;
  /** يضيف جهة الاتصال الحالية إلى Sequence؛ غير موجودة في وضع التجربة */
  enrollSequence?(sequenceId: string): Promise<{ enrolled: boolean }>;
  now(): Date;
  random(): number;
}

export type ButtonAction =
  | { type: 'set_field'; key: string; value: string }
  | { type: 'tag'; add: string[]; remove: string[] }
  | { type: 'list'; listId: string; operation: 'add' | 'remove' }
  | { type: 'sequence'; sequenceId: string; operation: 'subscribe' | 'unsubscribe' }
  | { type: 'assign'; userId?: string; departmentId?: string }
  | { type: 'webhook'; url: string; body: string };

export type EngineStatus = 'waiting' | 'completed' | 'handed_off' | 'error';

export interface EngineResult {
  status: EngineStatus;
  state: FlowState;
  error?: string;
  waitKind?: 'choice' | 'answer' | 'delay' | 'ai';
  waitUntil?: Date;
}

export const MAX_STEPS_PER_RUN = 100;
export const MAX_TOTAL_STEPS = 2000;
export const MAX_HTTP_PER_RUN = 10;

export function newState(): FlowState {
  return { vars: {}, waiting: null, totalSteps: 0 };
}

/** المخارج (handles) الصالحة لكل عقدة، وهي نفسها المستخدمة في المحرر المرئي */
export function optionsOf(data: Record<string, any>): { id: string; title: string; actions?: ButtonAction[] }[] {
  const out: { id: string; title: string; actions?: ButtonAction[] }[] = [];
  for (const b of data.buttons ?? []) out.push({ id: b.id, title: b.title, ...(b.actions ? { actions: b.actions } : {}) });
  for (const s of data.list?.sections ?? [])
    for (const r of s.rows ?? []) out.push({ id: r.id, title: r.title, ...(r.actions ? { actions: r.actions } : {}) });
  return out;
}

/** الخيارات التي يمكن للعميل الضغط عليها الآن في الخطوة المنتظِرة (أزرار/قوائم، أو اختيارات سؤال user_input الحالي) */
export function clickableOptions(
  node: Pick<FlowNode, 'type' | 'data'> | undefined,
  waiting: FlowState['waiting'],
): { id: string; title: string }[] {
  if (!node || !waiting) return [];
  if (waiting.kind === 'choice') return optionsOf(node.data ?? {});
  if (waiting.kind === 'answer' && node.type === 'user_input') {
    const q = (node.data?.questions ?? [])[waiting.step ?? 0];
    return [...(q?.kind === 'choice' ? (q.options ?? []) : []), ...(q?.allowSkip ? [{ id: `__boat_skip:${q.id}`, title: q.skipText || '/skip' }] : [])];
  }
  if (waiting.kind === 'answer' && node.type === 'question' && node.data.allowSkip)
    return [{ id: `__boat_skip:${waiting.nodeId}`, title: node.data.skipText || '/skip' }];
  return [];
}

export function handlesFor(node: Pick<FlowNode, 'type' | 'data'>): string[] {
  const d = node.data ?? {};
  switch (node.type) {
    case 'interactive':
    case 'message': {
      const opts = optionsOf(d);
      return opts.length ? [...opts.map((o) => `option:${o.id}`), 'fallback'] : ['next'];
    }
    case 'question':
      return ['ok', 'fail'];
    case 'condition':
      return [...(d.rules ?? []).map((r: { id: string }) => `rule:${r.id}`), 'else'];
    case 'http_request':
      return ['success', 'error'];
    case 'sheet_fetch':
      return ['found', 'not_found', 'error'];
    case 'business_hours':
      return ['open', 'closed'];
    case 'ai_reply':
      return ['done', 'handoff', 'error'];
    case 'split':
      return (d.branches ?? []).map((b: { id: string }) => `branch:${b.id}`);
    case 'handoff':
    case 'end':
      return [];
    default:
      return ['next'];
  }
}
