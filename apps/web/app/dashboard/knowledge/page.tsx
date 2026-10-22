'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { api, getSession } from '../../../lib/api';

const inp = 'w-full rounded border p-2 text-sm';
const STATUS: Record<string, string> = { pending: 'في الانتظار', processing: 'جارٍ المعالجة', ready: 'جاهز', failed: 'فشل' };

export default function Knowledge() {
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'text' | 'faq' | 'url' | 'file'>('text');
  const [faq, setFaq] = useState([{ question: '', answer: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api<any[]>('/ai/knowledge').then(setItems).catch((e) => setError(e.message));

  useEffect(() => {
    if (!getSession()) { window.location.href = '/login'; return; }
    load();
  }, []);
  useEffect(() => {
    if (!items.some((i) => i.status === 'pending' || i.status === 'processing')) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [items]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError('');
    setBusy(true);
    try {
      if (tab === 'file') {
        await api('/ai/knowledge/upload', { method: 'POST', body: f });
      } else {
        const body =
          tab === 'text' ? { type: 'text', title: f.get('title'), content: f.get('content') }
          : tab === 'url' ? { type: 'url', url: f.get('url'), title: f.get('title') || undefined }
          : { type: 'faq', title: f.get('title'), items: faq.filter((x) => x.question.trim() && x.answer.trim()) };
        await api('/ai/knowledge', { method: 'POST', body: JSON.stringify(body) });
      }
      form.reset();
      setFaq([{ question: '', answer: '' }]);
      load();
    } catch (err: any) { setError(err.message); }
    setBusy(false);
  }

  const act = async (path: string, method = 'POST') => { await api(path, { method }).catch((e) => setError(e.message)); load(); };

  return (
    <main dir="rtl" className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">قاعدة المعرفة</h1>
      <p className="mb-4 text-sm text-gray-600">أضف المعلومات التي يجيب منها المساعد: أسئلة شائعة، سياسات، أسعار، صفحات من موقعك، أو ملفات.</p>
      {error && <p className="mb-3 text-red-600">{error}</p>}

      <div className="mb-2 flex gap-1 text-sm">
        {([['text', 'نص'], ['faq', 'أسئلة وأجوبة'], ['url', 'رابط موقع'], ['file', 'ملف']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded px-3 py-1 ${tab === k ? 'bg-black text-white' : 'border'}`}>{l}</button>
        ))}
      </div>
      <form onSubmit={submit} className="mb-8 space-y-2 rounded border p-3">
        {tab !== 'url' && tab !== 'file' && <input name="title" required className={inp} placeholder="العنوان" />}
        {tab === 'text' && <textarea name="content" required rows={6} className={inp} placeholder="الصق النص هنا…" />}
        {tab === 'faq' && (
          <>
            {faq.map((x, i) => (
              <div key={i} className="space-y-1 rounded bg-gray-50 p-2">
                <input className={inp} placeholder="السؤال" value={x.question} onChange={(e) => setFaq(faq.map((y, j) => (j === i ? { ...y, question: e.target.value } : y)))} />
                <textarea className={inp} rows={2} placeholder="الجواب" value={x.answer} onChange={(e) => setFaq(faq.map((y, j) => (j === i ? { ...y, answer: e.target.value } : y)))} />
              </div>
            ))}
            <button type="button" onClick={() => setFaq([...faq, { question: '', answer: '' }])} className="rounded border px-2 py-1 text-xs">+ سؤال</button>
          </>
        )}
        {tab === 'url' && (
          <>
            <input name="url" type="url" required dir="ltr" className={inp} placeholder="https://example.com/faq" />
            <input name="title" className={inp} placeholder="عنوان (اختياري)" />
          </>
        )}
        {tab === 'file' && (
          <>
            <input name="file" type="file" required accept=".txt,.md,.csv,.pdf,.docx" className={inp} />
            <p className="text-xs text-gray-400">TXT / MD / CSV / PDF / DOCX حتى 5MB. ملفات PDF الممسوحة ضوئياً (صور) غير مدعومة.</p>
          </>
        )}
        <button disabled={busy} className="rounded bg-black px-4 py-2 text-white">{busy ? '…' : 'إضافة'}</button>
      </form>

      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="rounded border p-3 text-sm">
            <div className="flex items-center justify-between">
              <strong>{i.title}</strong>
              <span className={`rounded px-2 py-0.5 text-xs ${i.status === 'ready' ? 'bg-green-100 text-green-800' : i.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>{STATUS[i.status]}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">{i.type} · {i.chunk_count} مقطع · {i.char_count} حرف</div>
            {i.error && <div className="mt-1 text-xs text-red-600">{i.error}</div>}
            <div className="mt-2 flex gap-3 text-xs">
              <button onClick={() => act(`/ai/knowledge/${i.id}/reindex`)} className="underline">إعادة المعالجة</button>
              <button onClick={() => confirm('حذف المصدر؟') && act(`/ai/knowledge/${i.id}`, 'DELETE')} className="text-red-600 underline">حذف</button>
            </div>
          </li>
        ))}
        {!items.length && <li className="text-gray-500">لا توجد مصادر بعد.</li>}
      </ul>
    </main>
  );
}
