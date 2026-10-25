import { normalizeText } from './text';

export type Trigger =
  | { type: 'event'; event: string }
  | { type: 'keyword'; keywords: string[]; match?: 'contains' | 'exact' | 'starts_with' }
  | { type: 'reply_id'; ids: string[] }
  | { type: 'first_message' }
  | { type: 'any_message' };

export interface FlowCandidate {
  policy?:{startFrequency?:'once'|'always'|'daily'};
  flowId: string;
  versionId: string;
  priority: number;
  triggers: Trigger[];
  channelIds: string[];
}

export interface TriggerInput {
  lastRunAt?:Record<string,string>;
  now?:Date;
  eventName?: string;
  text: string;
  replyId?: string;
  channelId: string;
  isFirstMessage: boolean;
  alreadyRunFlowIds: Set<string>;
}

const RANK = { event: 0, reply_id: 0, keyword: 0, first_message: 1, any_message: 2 } as const;

function triggerMatches(t: Trigger, i: TriggerInput): boolean {
  if (i.eventName && t.type !== 'event') return false;
  switch (t.type) {
    case 'event':
      return i.eventName === t.event;
    case 'reply_id':
      return !!i.replyId && t.ids.includes(i.replyId);
    case 'keyword': {
      const text = normalizeText(i.text);
      if (!text) return false;
      const mode = t.match ?? 'contains';
      return t.keywords.some((k) => {
        const kw = normalizeText(k);
        if (!kw) return false;
        if (mode === 'exact') return text === kw;
        if (mode === 'starts_with') return text.startsWith(kw);
        return text.includes(kw);
      });
    }
    case 'first_message':
      return i.isFirstMessage;
    case 'any_message':
      return true;
  }
}

/** الأكثر تحديداً أولاً (كلمة مفتاحية/زر) ثم أول رسالة ثم أي رسالة؛ وداخل كل رتبة الأولوية الأعلى */
export function matchFlow(cands: FlowCandidate[], input: TriggerInput): FlowCandidate | null {
  let best: { c: FlowCandidate; rank: number; idx: number } | null = null;
  cands.forEach((c, idx) => {
    if (c.channelIds.length && !c.channelIds.includes(input.channelId)) return;
    let rank = Infinity;
    for (const t of c.triggers) {
      const once = t.type === 'any_message' || t.type === 'first_message';
      const frequency=c.policy?.startFrequency??'once';
      if(once&&frequency==='once'&&input.alreadyRunFlowIds.has(c.flowId))continue;
      if(once&&frequency==='daily'&&input.lastRunAt?.[c.flowId]&&new Date(input.lastRunAt[c.flowId]).getTime()+86400000>(input.now??new Date()).getTime())continue;
      if (triggerMatches(t,once&&frequency!=='once'?{...input,isFirstMessage:true}:input)) rank = Math.min(rank, RANK[t.type]);
    }
    if (rank === Infinity) return;
    if (!best || rank < best.rank || (rank === best.rank && c.priority > best.c.priority)) {
      best = { c, rank, idx };
    }
  });
  return best ? (best as { c: FlowCandidate }).c : null;
}
