export interface AgentLoad {
  userId: string;
  open: number;
}

/** اختيار الموظف الأقل انشغالاً (مع كسر التعادل عشوائياً) بشرط ألا يتجاوز الحد الأقصى */
export function pickLeastLoaded(cands: AgentLoad[], max: number, rnd: () => number = Math.random): string | null {
  const eligible = cands.filter((c) => c.open < max);
  if (!eligible.length) return null;
  const min = Math.min(...eligible.map((c) => c.open));
  const tied = eligible.filter((c) => c.open === min);
  return tied[Math.min(Math.floor(rnd() * tied.length), tied.length - 1)].userId;
}

/** هروب علامات LIKE حتى لا يتحول بحث المستخدم إلى نمط */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, '\\$&');
}
