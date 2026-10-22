export type Listener<T> = (event: T) => void;

/** ناقل أحداث داخل الذاكرة معزول لكل شركة. عند تشغيل أكثر من نسخة نستبدله بـ Redis pub/sub */
export class TenantBus<T> {
  private readonly subs = new Map<string, Set<Listener<T>>>();

  subscribe(tenantId: string, fn: Listener<T>): () => void {
    let set = this.subs.get(tenantId);
    if (!set) this.subs.set(tenantId, (set = new Set()));
    set.add(fn);
    return () => {
      const s = this.subs.get(tenantId);
      if (!s) return;
      s.delete(fn);
      if (!s.size) this.subs.delete(tenantId);
    };
  }

  publish(tenantId: string, event: T) {
    for (const fn of [...(this.subs.get(tenantId) ?? [])]) {
      try {
        fn(event);
      } catch {
        /* مشترك معطوب لا يوقف البقية */
      }
    }
  }

  size(tenantId: string) {
    return this.subs.get(tenantId)?.size ?? 0;
  }
}
