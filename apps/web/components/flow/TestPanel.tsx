'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useLocale } from '../product/locale';
import { useEffect, useRef, useState } from 'react';
import MediaPreview from './MediaPreview';
import { ConfigDisclosure, ConfigSummary } from './ConfigDisclosure';
import ListPreview from './ListPreview';
import { api } from '../../lib/api';

type Entry = { who: 'you' | 'bot' | 'system'; content: any };

export default function TestPanel({
  flowId,
  beforeRun,
  onProgress,
  onTestSuccess,
}: {
  flowId: string;
  beforeRun: () => Promise<void>;
  /** Called only after the server simulator returns a non-error result. */
  onTestSuccess?: () => void;
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
  const [mediaKind, setMediaKind] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [allowHttp, setAllowHttp] = useState(false);
  const [simulateAt, setSimulateAt] = useState('');
  const [contactAttributes, setContactAttributes] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [showVars, setShowVars] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chat = chatRef.current;
    if (chat) chat.scrollTop = chat.scrollHeight;
  }, [log, busy]);

  async function run(body: Record<string, unknown>, youSaid?: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await beforeRun();
      const r = await api<any>(`/flows/${flowId}/test`, {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          contactAttributes: body.state ? contactAttributes : {},
          allowHttp,
          ...(simulateAt ? { simulateAt: new Date(simulateAt).toISOString() } : {}),
        }),
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
      if (r.status !== 'error' && !r.error) onTestSuccess?.();
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

  const clearChat = () => {
    if (busy) return;
    onProgress?.(null, true);
    setLog([]);
    setState(null);
    setStatus('');
    setStatusError('');
    setWaitKind(null);
    setError('');
    setText('');
  };
  const friendly = (msg: string) =>
    /unauthor|401|session|token/i.test(msg)
      ? t(
          'انتهت الجلسة. سجّل الدخول من جديد ثم أعد التجربة.',
          'Your session expired. Sign in again and retry.',
        )
      : /network|fetch|failed to fetch/i.test(msg)
        ? t(
            'تعذّر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.',
            'Could not reach the server. Check your connection and retry.',
          )
        : /invalid|validation|required/i.test(msg)
          ? t(
              'في البوت خطأ يمنع التجربة. افتح «فحص» لمراجعة الخطوات الناقصة.',
              'The bot has an issue that blocks testing. Run “Validate” to review incomplete steps.',
            )
          : t(
              'تعذّرت التجربة. أعد المحاولة، وإن تكرر الخطأ راجع الخطوات ثم افحص البوت.',
              'The preview failed. Retry; if it repeats, review the steps and validate the bot.',
            );
  const statusText =
    (
      {
        handed_off: t('تم التحويل إلى موظف', 'Handed off to staff'),
        waiting: t('بانتظار رد العميل', 'Waiting for a reply'),
        ended: t('انتهت التجربة', 'Test ended'),
        done: t('اكتملت التجربة', 'Test complete'),
        completed: t('اكتملت التجربة', 'Test complete'),
        error: t('تعذّر إكمال التجربة', 'Test failed'),
        running: t('جارٍ التنفيذ', 'Running'),
      } as Record<string, string>
    )[status] ??
    (status
      ? t('حالة غير معروفة؛ راجع التفاصيل المتقدمة', 'Unknown status; see advanced details')
      : t('لم تبدأ التجربة بعد', 'Not started yet'));
  const canAnswer = !busy && ['choice', 'answer'].includes(waitKind ?? '');
  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="tp">
      <header className="tp-head">
        <span className="tp-avatar" aria-hidden="true">
          B
        </span>
        <div className="tp-title">
          <strong>{t('تجربة البوت', 'Bot preview')}</strong>
          <small className={`tp-status ${status === 'error' ? 'is-error' : ''}`} role="status">
            {busy ? t('جارٍ الكتابة…', 'typing…') : statusText}
          </small>
        </div>
        <button onClick={restart} disabled={busy} className="tp-btn tp-btn-primary">
          {state ? t('إعادة البدء', 'Restart') : t('ابدأ التجربة', 'Start preview')}
        </button>
        <button
          onClick={clearChat}
          disabled={busy || (!log.length && !state)}
          className="tp-btn"
          aria-label={t('مسح المحادثة التجريبية', 'Clear test conversation')}
        >
          {t('مسح', 'Clear')}
        </button>
      </header>
      <p className="tp-note">
        {t(
          'اختبار للمنطق — شكل الرسائل تقريبي وقد يختلف حسب القناة. لا تُرسل رسائل للعملاء.',
          'Logic test — message appearance is approximate and varies by channel. No customer messages are sent.',
        )}
      </p>
      {error && (
        <div role="alert" className="tp-error">
          <strong>{friendly(error)}</strong>
          <ConfigDisclosure>
            <ConfigSummary>{t('تفاصيل تقنية', 'Technical details')}</ConfigSummary>
            <code dir="ltr">{error}</code>
          </ConfigDisclosure>
        </div>
      )}
      {status === 'error' && statusError && (
        <div role="alert" className="tp-error">
          <strong>
            {t(
              'توقفت التجربة عند خطوة بها مشكلة.',
              'The preview stopped at a step with a problem.',
            )}
          </strong>
          <ConfigDisclosure>
            <ConfigSummary>{t('تفاصيل تقنية', 'Technical details')}</ConfigSummary>
            <code dir="ltr">{statusError}</code>
          </ConfigDisclosure>
        </div>
      )}
      <div ref={chatRef} className="tp-chat" aria-live="polite">
        {!log.length && !busy && (
          <div className="tp-empty">
            <strong>{t('جاهز للتجربة', 'Ready to test')}</strong>
            <span>
              {t(
                'اضغط «ابدأ التجربة» لترى المحادثة كما يراها العميل.',
                'Press “Start preview” to see the conversation as your customer sees it.',
              )}
            </span>
          </div>
        )}
        {log.map((e, i) =>
          e.who === 'system' ? (
            <div key={i} className="tp-system">
              {String(e.content)}
            </div>
          ) : (
            <div key={i} className={`tp-bubble ${e.who === 'you' ? 'is-you' : 'is-bot'}`}>
              {(e.content.product || e.content.productList) && (
                <pre className="text-xs" dir="ltr">
                  {JSON.stringify(e.content.product ?? e.content.productList, null, 2)}
                </pre>
              )}
              {e.content.whatsappFlow && (
                <p>
                  {t(
                    'معاينة نموذج WhatsApp — أدخل JSON للرد التجريبي أدناه',
                    'WhatsApp form preview — enter JSON as a simulated reply below',
                  )}
                  : {e.content.whatsappFlow.cta}
                </p>
              )}
              {e.content.media && <MediaPreview media={e.content.media} />}
              {e.content.header?.type === 'text' && (
                <strong className="tp-head-text">{e.content.header.text}</strong>
              )}
              {e.content.header?.type === 'image' && (
                <MediaPreview media={{ kind: 'image', url: e.content.header.url }} />
              )}
              {e.content.location && (
                <div className="text-xs">
                  📍 {e.content.location.name ?? ''} ({e.content.location.lat},{' '}
                  {e.content.location.lng})
                </div>
              )}
              {e.content.template && (
                <div className="text-xs">
                  🧩 {e.content.template.name} ({e.content.template.language})
                </div>
              )}
              <div className="whitespace-pre-wrap">{e.content.text}</div>
              {e.content.footer && <small className="tp-foot">{e.content.footer}</small>}
              {e.content.cta && (
                <div className="tp-cta">
                  🔗 {e.content.cta.text} <span dir="ltr">{e.content.cta.url}</span>
                </div>
              )}
              {e.content.buttons && (
                <div className="tp-buttons">
                  {e.content.buttons.map((b: { id: string; title: string }) => (
                    <button
                      type="button"
                      key={b.id}
                      disabled={!(e === lastBot && canAnswer)}
                      onClick={() => send(b.title, b.id)}
                    >
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
              {e.content.list && (
                <ListPreview
                  list={e.content.list}
                  disabled={busy || e !== lastBot || !['choice', 'answer'].includes(waitKind ?? '')}
                  onSelect={send}
                />
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="tp-bubble is-bot tp-typing" aria-label={t('البوت يكتب', 'Bot is typing')}>
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {waitKind === 'delay' && (
        <button
          onClick={() => run({ state, advanceDelay: true })}
          className="tp-btn tp-skip"
          disabled={busy}
        >
          {t('تخطّي الانتظار الزمني', 'Advance delay')}
        </button>
      )}
      <form
        className="tp-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canAnswer) return;
          if (mediaKind && mediaUrl.trim()) {
            void run(
              { state, text: text.trim(), media: { kind: mediaKind, url: mediaUrl.trim() } },
              text.trim() || t('مرفق تجريبي', 'Simulated attachment'),
            );
            setText('');
            setMediaUrl('');
          } else if (text.trim()) send(text.trim());
        }}
      >
        <input
          value={text}
          disabled={busy || !status.startsWith('waiting') || waitKind === 'delay'}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('رد العميل', 'Customer reply')}
          placeholder={
            status.startsWith('waiting')
              ? t('اكتب ردّ العميل…', 'Type a customer reply…')
              : t('ابدأ التجربة أولًا', 'Start the preview first')
          }
        />
        <button
          className="tp-send"
          disabled={!canAnswer || (!text.trim() && !(mediaKind && mediaUrl.trim()))}
          aria-label={t('إرسال', 'Send')}
        >
          ➤
        </button>
      </form>
      <ConfigDisclosure className="tp-adv">
        <ConfigSummary>{t('إرفاق وسائط في المحاكاة', 'Simulate Media Reply')}</ConfigSummary>
        <label className="field">
          {t('نوع المرفق', 'Attachment Type')}
          <select
            value={mediaKind}
            disabled={!canAnswer}
            onChange={(e) => setMediaKind(e.target.value)}
          >
            <option value="">{t('بدون مرفق', 'No Attachment')}</option>
            {['image', 'video', 'file'].map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        {mediaKind && (
          <label className="field">
            {t('رابط المرفق التجريبي', 'Simulated Attachment URL')}
            <input
              type="url"
              dir="ltr"
              value={mediaUrl}
              disabled={!canAnswer}
              onChange={(e) => setMediaUrl(e.target.value)}
            />
          </label>
        )}
        <p>
          {t(
            'المحاكي يحفظ الرابط كإجابة فقط، ولا يرسل مرفقات إلى العملاء.',
            'The simulator records this URL as an answer and does not send attachments to customers.',
          )}
        </p>
      </ConfigDisclosure>
      <ConfigDisclosure className="tp-adv">
        <ConfigSummary>
          {t('أدوات متقدمة والمتغيّرات', 'Advanced tools and variables')}
        </ConfigSummary>
        <label className="field">
          {t('وقت وهمي لاختبار ساعات العمل (محلي)', 'Simulated time for business hours (local)')}
          <input
            type="datetime-local"
            value={simulateAt}
            disabled={busy}
            onChange={(e) => setSimulateAt(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={allowHttp}
            onChange={(e) => setAllowHttp(e.target.checked)}
          />{' '}
          {t('تنفيذ طلبات API فعليًا', 'Allow real HTTP requests')}
        </label>
        {state && (
          <>
            <button onClick={() => setShowVars(!showVars)} className="tp-link">
              {t('المتغيّرات', 'Variables')}
            </button>
            {showVars && (
              <pre dir="ltr" className="tp-vars">
                {JSON.stringify(
                  { status, error: statusError || undefined, variables: state.vars },
                  null,
                  2,
                )}
              </pre>
            )}
          </>
        )}
      </ConfigDisclosure>
    </div>
  );
}
