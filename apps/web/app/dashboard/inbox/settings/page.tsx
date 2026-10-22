'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { api, getSession } from '../../../../lib/api';

const inp = 'w-full rounded border p-2 text-sm';

export default function InboxSettings() {
  const [s, setS] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<any>(null);

  const load = () => api<any[]>('/canned-replies').then(setReplies).catch((e) => setMsg(e.message));
  useEffect(() => {
    if (!getSession()) { window.location.href = '/login'; return; }
    api('/inbox/settings').then(setS).catch((e) => setMsg(e.message));
    load();
  }, []);

  async function saveSettings() {
    try { setS(await api('/inbox/settings', { method: 'PUT', body: JSON.stringify(s) })); setMsg('تم الحفظ'); } catch (e: any) { setMsg(e.message); }
  }
  async function saveReply(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = JSON.stringify({ shortcut: edit.shortcut, title: edit.title, content: edit.content });
      if (edit.id) await api(`/canned-replies/${edit.id}`, { method: 'PATCH', body });
      else await api('/canned-replies', { method: 'POST', body });
      setEdit(null); setMsg(''); load();
    } catch (err: any) { setMsg(err.message); }
  }

  if (!s) return <main className="p-6">{msg || 'جارٍ التحميل...'}</main>;

  return (
    <main dir="rtl" className="mx-auto max-w-2xl p-6">
      <a href="/dashboard/inbox" className="text-sm underline">← صندوق الوارد</a>
      <h1 className="mb-4 mt-2 text-2xl font-bold">إعدادات صندوق الوارد</h1>
      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}

      <section className="mb-8 space-y-3 rounded border p-4">
        <h2 className="font-semibold">التوزيع التلقائي</h2>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.auto_assign} onChange={(e) => setS({ ...s, auto_assign: e.target.checked })} /> عند تحويل البوت لمحادثة، عيّنها تلقائياً لأقل موظف متاح انشغالاً</label>
        <label className="block text-sm">أقصى عدد محادثات مفتوحة لكل موظف
          <input type="number" min={1} max={500} className={inp} value={s.max_open_per_agent} onChange={(e) => setS({ ...s, max_open_per_agent: Number(e.target.value) || 1 })} />
        </label>
        <p className="text-xs text-gray-500">الموظف الذي يضع نفسه "غير متاح" من أعلى صندوق الوارد لا يدخل في التوزيع.</p>
        <button onClick={saveSettings} className="rounded bg-black px-4 py-2 text-white">حفظ</button>
      </section>

      <section className="rounded border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">الردود الجاهزة</h2>
          <button onClick={() => setEdit({ shortcut: '', title: '', content: '' })} className="rounded border px-3 py-1 text-sm">+ رد جديد</button>
        </div>
        <p className="mb-3 text-xs text-gray-500">اكتب <code>/</code> ثم الاختصار في صندوق الرد لإدراجه. يمكنك استخدام {'{{name}}'} لاسم العميل.</p>
        {edit && (
          <form onSubmit={saveReply} className="mb-4 space-y-2 rounded bg-gray-50 p-3">
            <input className={inp} dir="ltr" placeholder="الاختصار (مثل hours)" value={edit.shortcut} onChange={(e) => setEdit({ ...edit, shortcut: e.target.value })} required />
            <input className={inp} placeholder="العنوان" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            <textarea className={inp} rows={4} placeholder="نص الرد" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} required />
            <div className="flex gap-2"><button className="rounded bg-black px-4 py-1.5 text-white">حفظ</button><button type="button" onClick={() => setEdit(null)} className="rounded border px-4 py-1.5">إلغاء</button></div>
          </form>
        )}
        <ul className="space-y-2">
          {replies.map((r) => (
            <li key={r.id} className="rounded border p-2 text-sm">
              <div className="flex justify-between"><strong>/{r.shortcut} — {r.title}</strong>
                <span className="flex gap-3 text-xs"><button onClick={() => setEdit(r)} className="underline">تعديل</button><button onClick={() => confirm('حذف الرد؟') && api(`/canned-replies/${r.id}`, { method: 'DELETE' }).then(load)} className="text-red-600 underline">حذف</button></span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-gray-600">{r.content}</div>
            </li>
          ))}
          {!replies.length && <li className="text-gray-400">لا توجد ردود جاهزة بعد.</li>}
        </ul>
      </section>
    </main>
  );
}
