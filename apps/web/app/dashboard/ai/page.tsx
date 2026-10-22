'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { api, getSession } from '../../../lib/api';

const inp = 'w-full rounded border p-2 text-sm';

export default function AiPage() {
  const [s, setS] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getSession()) { window.location.href = '/login'; return; }
    api('/ai/settings').then(setS).catch((e) => setMsg(e.message));
    api('/ai/usage').then(setUsage).catch(() => {});
    api('/ai/status').then(setStatus).catch(() => {});
  }, []);

  const set = (patch: any) => setS((x: any) => ({ ...x, ...patch }));

  async function save() {
    setMsg('');
    try {
      const body = Object.fromEntries(Object.entries(s).filter(([key]) => !['tenant_id','updated_at'].includes(key)));
      setS(await api('/ai/settings', { method: 'PUT', body: JSON.stringify(body) }));
      setMsg('تم الحفظ');
    } catch (e: any) { setMsg(e.message); }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAnswer(null);
    try {
      setAnswer(await api('/ai/test', { method: 'POST', body: JSON.stringify({ question: q }) }));
      api('/ai/usage').then(setUsage).catch(() => {});
    } catch (err: any) { setAnswer({ text: err.message, failed: true }); }
    setBusy(false);
  }

  if (!s) return <main className="p-6">{msg || 'جارٍ التحميل...'}</main>;

  return (
    <main dir="rtl" className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">الذكاء الاصطناعي</h1>
      {status && (!status.llmConfigured || !status.embeddingsConfigured) && (
        <p className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          الخدمة غير مكتملة على السيرفر: {!status.llmConfigured && 'مفتاح ANTHROPIC_API_KEY غير مضبوط. '}{!status.embeddingsConfigured && 'مفتاح الـ embeddings غير مضبوط.'}
        </p>
      )}
      {usage && (
        <p className="mb-4 text-sm">
          استهلاك هذا الشهر: <strong>{usage.replies}</strong> / {usage.limit === -1 ? 'غير محدود' : usage.limit} رد (الباقة: {usage.plan})
        </p>
      )}

      <section className="mb-6 space-y-3 rounded border p-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> تفعيل الذكاء الاصطناعي</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.auto_reply} onChange={(e) => set({ auto_reply: e.target.checked })} /> رد تلقائي لأي رسالة لا يلتقطها سيناريو</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.handoff_enabled} onChange={(e) => set({ handoff_enabled: e.target.checked })} /> السماح للمساعد بتحويل المحادثة لموظف</label>
        <input className={inp} placeholder="اسم النشاط" value={s.business_name ?? ''} onChange={(e) => set({ business_name: e.target.value || null })} />
        <textarea className={inp} rows={4} placeholder="تعليمات خاصة بنشاطك (اختياري): أسلوب الرد، ما لا يجب قوله، عروض…" value={s.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value || null })} />
        <div className="flex gap-2">
          <select className={inp} value={s.tone} onChange={(e) => set({ tone: e.target.value })}>
            <option value="friendly">ودود</option><option value="professional">رسمي</option><option value="concise">مختصر</option>
          </select>
          <select className={inp} value={s.language} onChange={(e) => set({ language: e.target.value })}>
            <option value="auto">لغة العميل تلقائياً</option><option value="ar">العربية دائماً</option><option value="en">الإنجليزية دائماً</option>
          </select>
        </div>
        <textarea className={inp} rows={2} value={s.fallback_message} onChange={(e) => set({ fallback_message: e.target.value })} />
        <p className="-mt-2 text-xs text-gray-400">رسالة الاعتذار عند تعذّر الرد (نفاد الرصيد أو عطل مؤقت).</p>
        <textarea className={inp} rows={2} value={s.handoff_message} onChange={(e) => set({ handoff_message: e.target.value })} />
        <p className="-mt-2 text-xs text-gray-400">رسالة التحويل لموظف.</p>
        <div className="flex items-center gap-3">
          <button onClick={save} className="rounded bg-black px-4 py-2 text-white">حفظ</button>
          <span className="text-sm text-gray-600">{msg}</span>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-2 font-semibold">جرّب المساعد</h2>
        <form onSubmit={ask} className="flex gap-2">
          <input className={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب سؤال عميل…" required />
          <button disabled={busy} className="rounded bg-blue-600 px-4 text-white">{busy ? '…' : 'اسأل'}</button>
        </form>
        {answer && (
          <div className="mt-3 rounded bg-gray-50 p-3 text-sm">
            <div className="whitespace-pre-wrap">{answer.text}</div>
            {answer.handoff && <div className="mt-2 text-xs text-orange-600">⚠️ المساعد طلب التحويل لموظف</div>}
            {answer.failed && <div className="mt-2 text-xs text-red-600">تعذّر الرد{answer.reason ? ` (${answer.reason})` : ''}</div>}
            {answer.sources?.length > 0 && <div className="mt-2 text-xs text-gray-500">المصادر: {answer.sources.map((x: any) => x.title).join('، ')}</div>}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">كل تجربة تُحسب من رصيد الردود.</p>
      </section>
    </main>
  );
}
