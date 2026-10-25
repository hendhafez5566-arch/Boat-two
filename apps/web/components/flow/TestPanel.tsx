'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLocale } from '../product/locale';
import { useState } from 'react';
import MediaPreview from './MediaPreview';
import ListPreview from './ListPreview';
import { api } from '../../lib/api';

type Entry = { who: 'you' | 'bot' | 'system'; content: any };

export default function TestPanel({
  flowId,
  beforeRun,
  onProgress,
}: {
  flowId: string;
  beforeRun: () => Promise<void>;
  /** Reports the step the bot is waiting at (null when finished) so the canvas can highlight it. */
  onProgress?: (waitingNodeId: string | null, reset?: boolean) => void;
}) {
  const { t, language } = useLocale();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const [state, setState] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [waitKind, setWaitKind] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [allowHttp, setAllowHttp] = useState(false);
  const [simulateAt, setSimulateAt] = useState('');
  const [contactAttributes, setContactAttributes] = useState<Record<string,unknown>>({});
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [showVars, setShowVars] = useState(false);

  async function run(body: Record<string, unknown>, youSaid?: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await beforeRun();
      const r = await api<any>(`/flows/${flowId}/test`, {
        method: 'POST',
        body: JSON.stringify({ ...body, contactAttributes: body.state ? contactAttributes : {}, allowHttp, ...(simulateAt ? { simulateAt: new Date(simulateAt).toISOString() } : {}) }),
      });
      setLog((l) => [
        ...l,
        ...(youSaid ? [{ who: 'you' as const, content: { text: youSaid } }] : []),
        ...r.transcript.map((t: any) => ({ who: t.role, content: t.content })),
      ]);
      setState(r.state);
      setContactAttributes(r.contactAttributes ?? {});
      onProgress?.(r.state?.waiting?.nodeId ?? null);
      setStatus(r.status);
      setStatusError(r.error ?? '');
      setWaitKind(r.waitKind);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const restart = () => {
    onProgress?.(null, true);
    setLog([]);
    setState(null);
    setStatus('');
    setStatusError('');
    setWaitKind(null);
    run({ text: 'hi' });
  };
  const send = (t: string, replyId?: string) => {
    if (!state) return;
    setText('');
    run({ state, text: t, replyId }, t);
  };
  const lastBot = [...log].reverse().find((e) => e.who === 'bot');
  const chips: { id: string; title: string }[] = [];
  if (lastBot && (waitKind === 'choice' || waitKind === 'answer')) {
    for (const b of lastBot.content.buttons ?? []) chips.push(b);

  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="flex h-full flex-col p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={restart} disabled={busy} className="btn btn-primary">
          {state ? t('إعادة', 'Restart') : t('ابدأ التجربة', 'Start preview')}
        </button>
        <details className="text-xs"><summary>{t('أدوات متقدمة', 'Advanced tools')}</summary>
        <label className="field">{t('وقت وهمي لاختبار ساعات العمل (محلي)', 'Simulated time for business hours (local)')}<input type="datetime-local" value={simulateAt} disabled={busy} onChange={e=>setSimulateAt(e.target.value)} /></label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={allowHttp}
            onChange={(e) => setAllowHttp(e.target.checked)}
          />{' '}
          {t('تنفيذ طلبات API فعليًا', 'Allow real HTTP requests')}
        </label>
        </details>
      </div>
      <p className="mb-2 text-xs text-gray-500">{t('اختبار المنطق — شكل الرسائل تقريبي وقد يختلف حسب القناة. لا تُرسل رسائل للعملاء.', 'Logic test — message appearance is approximate and varies by channel. No customer messages are sent.')}</p>
      {error && <p className="mb-2 text-red-600">{error}</p>}
      <div className="flex-1 space-y-2 overflow-y-auto rounded bg-gray-50 p-2">
        {log.map((e, i) =>
          e.who === 'system' ? (
            <div key={i} className="text-center text-xs text-gray-500">
              {String(e.content)}
            </div>
          ) : (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-1.5 ${e.who === 'you' ? 'ml-auto bg-blue-600 text-white' : 'bg-white border'}`}
            >
              {e.content.media && <MediaPreview media={e.content.media} />}
              {e.content.header?.type === 'text' && <strong>{e.content.header.text}</strong>}
              {e.content.header?.type === 'image' && <MediaPreview media={{kind:'image',url:e.content.header.url}} />}
              {e.content.location && (
                <div className="text-xs">
                  📍 {e.content.location.name ?? ''} ({e.content.location.lat}, {e.content.location.lng})
                </div>
              )}
              {e.content.template && (
                <div className="text-xs">
                  🧩 {e.content.template.name} ({e.content.template.language})
                </div>
              )}
              <div className="whitespace-pre-wrap">{e.content.text}</div>
              {e.content.footer && <small className="block opacity-70">{e.content.footer}</small>}
              {e.content.cta && (
                <div className="mt-1 text-xs opacity-60">
                  [🔗 {e.content.cta.text}] {e.content.cta.url}
                </div>
              )}
              {e.content.buttons && <div className="mt-1 text-xs">{e.content.buttons.map((b: {id:string;title:string}) => <span className="rounded border px-2" key={b.id}>{b.title}</span>)}</div>}
              {e.content.list && <ListPreview list={e.content.list} disabled={busy || e !== lastBot || !['choice','answer'].includes(waitKind ?? '')} onSelect={send} />}
            </div>
          ),
        )}
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => send(c.title, c.id)}
              className="rounded-full border border-blue-600 px-3 py-0.5 text-blue-600"
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 text-xs text-gray-500">
        {t('الحالة', 'Status')}: {({ handed_off: t('تم التحويل إلى موظف', 'Handed off to staff'), waiting: t('بانتظار رد أو متابعة', 'Waiting for a reply or continuation'), ended: t('انتهت التجربة', 'Test ended'), done: t('اكتملت التجربة', 'Test complete'), completed: t('اكتملت التجربة', 'Test complete'), error: t('تعذّر إكمال التجربة', 'Test failed'), running: t('جارٍ التنفيذ', 'Running') } as Record<string, string>)[status] ?? (status ? t('حالة غير معروفة؛ راجع التفاصيل المتقدمة', 'Unknown status; see advanced details') : '—')}
      </div>
      {waitKind === 'delay' && (
        <button
          onClick={() => run({ state, advanceDelay: true })}
          className="mt-1 rounded border px-2 py-1 text-xs"
        >
          {t('تخطّي الانتظار الزمني', 'Advance delay')}
        </button>
      )}
      {status.startsWith('waiting') && waitKind !== 'delay' && (
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send(text.trim());
          }}
        >
          <input
            className="flex-1 rounded border p-1.5"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t('رد العميل', 'Customer reply')}
            placeholder={t('اكتب ردّ العميل…', 'Type a customer reply…')}
          />
          <button className="rounded bg-blue-600 px-3 text-white">{t('إرسال', 'Send')}</button>
        </form>
      )}
      {state && (
        <>
          <button
            onClick={() => setShowVars(!showVars)}
            className="mt-2 text-start text-xs underline"
          >
            {t('المتغيّرات', 'Variables')}
          </button>
          {showVars && (
            <pre dir="ltr" className="mt-1 max-h-32 overflow-auto rounded bg-gray-100 p-2 text-xs">
              {JSON.stringify({ status, error: statusError || undefined, variables: state.vars }, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
