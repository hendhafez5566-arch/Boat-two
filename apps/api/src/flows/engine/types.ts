/* eslint-disable @typescript-eslint/no-explicit-any */
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

export interface FlowNode {
  id: string;
  type: NodeType;
  position?: { x: number; y: number };
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
  ai(req: AiRequest): Promise<AiResult>;
  send(content: OutContent): Promise<void>;
  http(req: HttpRequestSpec): Promise<HttpResult>;
  setContactAttribute(key: string, value: unknown): Promise<void>;
  handoff(opts: { assignTo?: string }): Promise<void>;
  closeConversation(): Promise<void>;
  now(): Date;
  random(): number;
}

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
export function optionsOf(data: Record<string, any>): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const b of data.buttons ?? []) out.push({ id: b.id, title: b.title });
  for (const s of data.list?.sections ?? [])
    for (const r of s.rows ?? []) out.push({ id: r.id, title: r.title });
  return out;
}

export function handlesFor(node: Pick<FlowNode, 'type' | 'data'>): string[] {
  const d = node.data ?? {};
  switch (node.type) {
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
