'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { api } from '../../lib/api';

type Entry = { who: 'you' | 'bot' | 'system'; content: any };

export default function TestPanel({ flowId, beforeRun }: { flowId: string; beforeRun: () => Promise<void> }) {
  const [log, setLog] = useState<Entry[]>([]);
  const [state, setState] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [waitKind, setWaitKind] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [allowHttp, setAllowHttp] = useState(false);
  const [error, setError] = useState('');
  const [showVars, setShowVars] = useState(false);

  async function run(body: Record<string, unknown>, youSaid?: string) {
    setError('');
    try {
      await beforeRun();
      const r = await api<any>(`/flows/${flowId}/test`, { method: 'POST', body: JSON.stringify({ ...body, allowHttp }) });
      setLog((l) => [
        ...l,
        ...(youSaid ? [{ who: 'you' as const, content: { text: youSaid } }] : []),
        ...r.transcript.map((t: any) => ({ who: t.role, content: t.content })),
      ]);
      setState(r.state);
      setStatus(r.status + (r.error ? `: ${r.error}` : ''));
      setWaitKind(r.waitKind);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const restart = () => { setLog([]); setState(null); setStatus(''); setWaitKind(null); run({ text: 'hi' }); };
  const send = (t: string, replyId?: string) => { if (!state) return; setText(''); run({ state, text: t, replyId }, t); };
  const lastBot = [...log].reverse().find((e) => e.who === 'bot');
  const chips: { id: string; title: string }[] = [];
  if (lastBot && waitKind === 'choice') {
    for (const b of lastBot.content.buttons ?? []) chips.push(b);
    for (const s of lastBot.content.list?.sections ?? []) for (const r of s.rows) chips.push(r);
  }

  return (
    <div dir="rtl" className="flex h-full flex-col p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={restart} className="rounded bg-black px-3 py-1 text-white">{state ? 'إعادة' : 'ابدأ التجربة'}</button>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={allowHttp} onChange={(e) => setAllowHttp(e.target.checked)} /> تنفيذ طلبات API فعلياً</label>
      </div>
      {error && <p className="mb-2 text-red-600">{error}</p>}
      <div className="flex-1 space-y-2 overflow-y-auto rounded bg-gray-50 p-2">
        {log.map((e, i) =>
          e.who === 'system' ? (
            <div key={i} className="text-center text-xs text-gray-500">{String(e.content)}</div>
          ) : (
            <div key={i} className={`max-w-[85%] rounded-lg px-3 py-1.5 ${e.who === 'you' ? 'ml-auto bg-blue-600 text-white' : 'bg-white border'}`}>
              {e.content.media && <div className="text-xs opacity-70">[{e.content.media.kind}] {e.content.media.url}</div>}
              <div className="whitespace-pre-wrap">{e.content.text}</div>
              {(e.content.buttons || e.content.list) && <div className="mt-1 text-xs opacity-60">{[...(e.content.buttons ?? []), ...(e.content.list?.sections ?? []).flatMap((s: any) => s.rows)].map((o: any) => `[${o.title}]`).join(' ')}</div>}
            </div>
          ),
        )}
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((c) => (
            <button key={c.id} onClick={() => send(c.title, c.id)} className="rounded-full border border-blue-600 px-3 py-0.5 text-blue-600">{c.title}</button>
          ))}
        </div>
      )}
      <div className="mt-2 text-xs text-gray-500">الحالة: {status || '—'}</div>
      {waitKind === 'delay' && <button onClick={() => run({ state, advanceDelay: true })} className="mt-1 rounded border px-2 py-1 text-xs">تخطّي الانتظار الزمني</button>}
      {status.startsWith('waiting') && waitKind !== 'delay' && (
        <form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }}>
          <input className="flex-1 rounded border p-1.5" value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب ردّ العميل…" />
          <button className="rounded bg-blue-600 px-3 text-white">إرسال</button>
        </form>
      )}
      {state && (
        <>
          <button onClick={() => setShowVars(!showVars)} className="mt-2 text-start text-xs underline">المتغيّرات</button>
          {showVars && <pre dir="ltr" className="mt-1 max-h-32 overflow-auto rounded bg-gray-100 p-2 text-xs">{JSON.stringify(state.vars, null, 2)}</pre>}
        </>
      )}
    </div>
  );
}
