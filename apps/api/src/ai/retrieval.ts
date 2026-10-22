import { normalizeText } from '../flows/engine/text';

/** استعلام OR آمن لـ to_tsquery('simple'): كلمات (حروف وأرقام فقط) بعد توحيد النص */
export function buildOrTsQuery(question: string, maxTerms = 12): string | null {
  const tokens = normalizeText(question).match(/[\p{L}\p{N}]+/gu) ?? [];
  const uniq = [...new Set(tokens.filter((t) => t.length >= 2))].slice(0, maxTerms);
  return uniq.length ? uniq.join(' | ') : null;
}

/** دمج قوائم نتائج مرتبة بطريقة Reciprocal Rank Fusion */
export function rrfFuse<T extends { id: string }>(lists: T[][], limit: number, k = 60): (T & { rrf: number })[] {
  const scores = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const cur = scores.get(item.id);
      const add = 1 / (k + rank + 1);
      if (cur) cur.score += add;
      else scores.set(item.id, { item, score: add });
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ ...x.item, rrf: x.score }));
}

export function toVectorLiteral(v: number[]): string {
  if (!v.length || v.some((x) => !Number.isFinite(x))) throw new Error('Invalid embedding vector');
  return `[${v.join(',')}]`;
}

/** بداية الشهر (UTC) لحساب استهلاك الرصيد الشهري */
export function periodStart(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
