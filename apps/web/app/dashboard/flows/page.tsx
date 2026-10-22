'use client';
import { useEffect, useState } from 'react';
import { api, getSession } from '../../../lib/api';

type Flow = {
  id: string;
  name: string;
  status: 'draft' | 'published';
  published_version: number | null;
  triggers: { type: string; keywords?: string[] }[];
  updated_at: string;
};

const trig = (t: Flow['triggers'][number]) =>
  t.type === 'keyword' ? `كلمات: ${(t.keywords ?? []).slice(0, 3).join('، ')}` : ({ first_message: 'أول رسالة', any_message: 'أي رسالة', reply_id: 'زر محدد' } as Record<string, string>)[t.type] ?? t.type;

export default function Flows() {
  const [items, setItems] = useState<Flow[]>([]);
  const [error, setError] = useState('');

  const load = () => api<Flow[]>('/flows').then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    if (!getSession()) { window.location.href = '/login'; return; }
    load();
  }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const flow = await api<Flow>('/flows', { method: 'POST', body: JSON.stringify({ name: f.get('name') }) });
      window.location.href = `/dashboard/flows/${flow.id}`;
    } catch (err) { setError((err as Error).message); }
  }
  const act = async (path: string, method = 'POST') => { await api(path, { method }).catch((e) => setError(e.message)); load(); };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">السيناريوهات (Flows)</h1>
      {error && <p className="mb-3 text-red-600">{error}</p>}
      <form onSubmit={create} className="mb-6 flex gap-2">
        <input name="name" required placeholder="اسم سيناريو جديد" className="flex-1 rounded border p-2" />
        <button className="rounded bg-black px-4 text-white">إنشاء</button>
      </form>
      <ul className="flex flex-col gap-3">
        {items.map((f) => (
          <li key={f.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <a href={`/dashboard/flows/${f.id}`} className="font-semibold underline">{f.name}</a>
              <span className={`rounded px-2 py-0.5 text-xs ${f.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                {f.status === 'published' ? `منشور v${f.published_version}` : 'مسودة'}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-500">المشغّلات: {f.triggers.map(trig).join(' | ') || 'لا يوجد'}</div>
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => act(`/flows/${f.id}/duplicate`)} className="underline">نسخ</button>
              {f.status === 'published' && <button onClick={() => act(`/flows/${f.id}/unpublish`)} className="underline">إيقاف</button>}
              <button onClick={() => confirm('حذف السيناريو؟') && act(`/flows/${f.id}`, 'DELETE')} className="text-red-600 underline">حذف</button>
            </div>
          </li>
        ))}
        {!items.length && <li className="text-gray-500">لا توجد سيناريوهات بعد.</li>}
      </ul>
    </main>
  );
}
