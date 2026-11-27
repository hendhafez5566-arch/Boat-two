'use client';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Settings = {
  enabled: boolean;
  auto_reply: boolean;
  business_name: string | null;
  instructions: string | null;
  tone: 'friendly' | 'professional' | 'concise';
  language: 'auto' | 'ar' | 'en';
  handoff_enabled: boolean;
  fallback_message: string;
  handoff_message: string;
  max_history: number;
  temperature: number;
};
type Answer = {
  text: string;
  failed: boolean;
  handoff: boolean;
  reason?: string;
  sources: { title: string }[];
};
export default function AiPage() {
  const { t } = useLocale(),
    settings = useData<Settings | null>('/ai/settings', null),
    usage = useData<{
      attempts: number;
      replies: number;
      limit: number;
      reservedTokens: number;
      remaining: number | null;
    } | null>('/ai/usage', null),
    status = useData<{ llmConfigured: boolean; generationEnabled: boolean } | null>(
      '/ai/status',
      null,
    ),
    workspace = useData<{ role: string }>('/workspace', { role: '' });
  const [activePanel,setActivePanel]=useState<'settings'|'test'>('settings');
  const [draft, setDraft] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [q, setQ] = useState(''),
    [answer, setAnswer] = useState<Answer | null>(null);
  const s = draft ?? settings.data,
    manage = ['owner', 'admin'].includes(workspace.data.role);
  const lock=useRef(false);
  const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(settings.data);
  const valid=!!s&&!!s.fallback_message.trim()&&!!s.handoff_message.trim()&&Number.isInteger(s.max_history)&&s.max_history>=2&&s.max_history<=30&&Number.isFinite(s.temperature)&&s.temperature>=0&&s.temperature<=1;
  useEffect(()=>{if(!saved)return;const timer=setTimeout(()=>setSaved(false),4000);return()=>clearTimeout(timer);},[saved]);
  useEffect(()=>{const unload=(event:BeforeUnloadEvent)=>{if(dirty||lock.current){event.preventDefault();event.returnValue='';}};const click=(event:MouseEvent)=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const a=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.target==='_blank'||a.download||a.href===location.href)return;if(lock.current||(dirty&&!window.confirm(t('توجد إعدادات غير محفوظة. تجاهلها؟','Discard unsaved settings?')))){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};},[dirty,t]);
  function set(patch: Partial<Settings>) {
    if (s) setDraft({ ...s, ...patch });
    setSaved(false);
  }
  if (!s)
    return (
      <main className="stack">
        <h1>{t('المساعد الذكي', 'AI assistant')}</h1>
        <p role={settings.error ? 'alert' : 'status'}>
          {settings.error || t('جارٍ التحميل…', 'Loading…')} {settings.error&&<button className="btn" onClick={()=>void settings.reload()}>{t('إعادة المحاولة','Retry')}</button>}
        </p>
      </main>
    );
  return (
    <main className="stack ai-professional" aria-busy={busy}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('ذكاء مرتبط بمعرفة شركتك', 'KNOWLEDGE-GROUNDED AI')}</p>
          <h1>{t('المساعد الذكي', 'AI assistant')}</h1>
          <p>
            {t(
              'اضبط أسلوب الرد وحدود السياق ومسار التحويل البشري.',
              'Configure replies, conversation context and human escalation.',
            )}
          </p>
        </div>
        <Link className="btn" href="/dashboard/agents">
          {t('المساعدون والميزانية', 'Agents & budget')}
        </Link>
      </div>
      <div className="workbench-metrics">
        <div><small>{t('إعداد المساعد','Assistant setting')}</small><strong>{settings.data?.enabled?t('مفعّل','Enabled'):t('متوقف','Disabled')}</strong></div>
        <div><small>{t('اتصال المزود','Provider readiness')}</small><strong>{status.loading||status.error||!status.data?'—':status.data.generationEnabled&&status.data.llmConfigured?t('جاهز للإعداد','Configured'):t('غير جاهز','Unavailable')}</strong></div>
        <div><small>{t('محاولات هذا الشهر','Monthly attempts')}</small><strong>{!usage.loading&&!usage.error&&usage.data?usage.data.attempts+' / '+(usage.data.limit===-1?'∞':usage.data.limit):'—'}</strong></div>
      </div>
      {!status.loading && !status.error&&status.data&&!status.data.generationEnabled && (
        <p className="notice">
          {t(
            'استدعاءات المزود معطّلة في هذه البيئة. حفظ الإعدادات لا يفعّل خدمة مدفوعة.',
            'Provider calls are disabled in this environment. Saving settings does not activate paid services.',
          )}
        </p>
      )}
      {status.data && !status.data.llmConfigured && (
        <p className="notice">
          {t(
            'أضف مزودًا واضبط المساعد من صفحة المساعدين قبل الاستخدام.',
            'Set up a provider and agent from the Agents page before use.',
          )}
        </p>
      )}
      {usage.data && (
        <details className="card"><summary>{t('تفاصيل استهلاك هذا الشهر','Monthly usage details')}</summary>
          <p>
            {usage.data.attempts} / {usage.data.limit === -1 ? '∞' : usage.data.limit}{' '}
            {t(
              'محاولة؛ الحجوزات المجهولة تظل محسوبة.',
              'attempts; unknown outcomes remain counted.',
            )}
          </p>
          <p>
            {t('رموز محجوزة: ', 'Reserved tokens: ')}
            {usage.data.reservedTokens}
          </p>
        </details>
      )}
      {(error || settings.error||usage.error||status.error||workspace.error) && (
        <p className="notice error" role="alert">
          {error || settings.error||usage.error||status.error||workspace.error} {(settings.error||usage.error||status.error||workspace.error)&&<button className="btn" disabled={busy} onClick={()=>void Promise.all([settings.reload(),usage.reload(),status.reload(),workspace.reload()])}>{t('إعادة المحاولة','Retry')}</button>}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          {t('تم حفظ إعدادات المساعد.', 'Assistant settings saved.')}
        </p>
      )}
      <nav className="workbench-tabs" aria-label={t('أقسام المساعد','Assistant sections')}><button type="button" aria-pressed={activePanel==='settings'} onClick={()=>setActivePanel('settings')}>{t('إعداد المساعد','Configure assistant')}{draft?' •':''}</button><button type="button" aria-pressed={activePanel==='test'} onClick={()=>setActivePanel('test')}>{t('اختبار الرد','Test reply')}</button></nav>
      <form hidden={activePanel!=='settings'}
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if(lock.current||!manage||!dirty||!valid)return;
          if((s.enabled!==settings.data?.enabled||s.auto_reply!==settings.data?.auto_reply)&&!window.confirm(t('تأكيد تغيير حالة الرد التلقائي؟','Confirm assistant and automatic reply changes?')))return;
          lock.current=true;setBusy(true);
          setError('');setSaved(false);
          try {
            await api('/ai/settings', { method: 'PUT', body: JSON.stringify(s) });
            await settings.reload();
            setDraft(null);
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            lock.current=false;setBusy(false);
          }
        }}
      >
        <h2>{t('إعدادات الرد', 'Reply settings')}</h2>
        <fieldset className="stack" disabled={!manage || busy||!!settings.error}><section className="settings-block">
          <label>
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
            />{' '}
            {t('تفعيل المساعد', 'Enable assistant')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.auto_reply}
              onChange={(e) => set({ auto_reply: e.target.checked })}
            />{' '}
            {t('الرد على الرسائل خارج السيناريوهات', 'Reply outside bot workflows')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.handoff_enabled}
              onChange={(e) => set({ handoff_enabled: e.target.checked })}
            />{' '}
            {t('السماح بالتحويل البشري', 'Allow human escalation')}
          </label>
          </section><section className="settings-block"><h3>{t('هوية المساعد وأسلوبه','Assistant identity and tone')}</h3><label className="field">
            {t('اسم النشاط', 'Business name')}
            <input
              maxLength={120}
              value={s.business_name ?? ''}
              onChange={(e) => set({ business_name: e.target.value || null })}
            />
          </label>
          <label className="field">
            {t('تعليمات المساعد', 'Assistant instructions')}
            <textarea
              maxLength={4000}
              rows={4}
              value={s.instructions ?? ''}
              onChange={(e) => set({ instructions: e.target.value || null })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              {t('أسلوب الرد', 'Tone')}
              <select
                aria-label={t('أسلوب الرد', 'Tone')}
                value={s.tone}
                onChange={(e) => set({ tone: e.target.value as Settings['tone'] })}
              >
                <option value="friendly">{t('ودود', 'Friendly')}</option>
                <option value="professional">{t('رسمي', 'Professional')}</option>
                <option value="concise">{t('مختصر', 'Concise')}</option>
              </select>
            </label>
            <label className="field">
              {t('لغة الرد', 'Reply language')}
              <select
                aria-label={t('لغة الرد', 'Reply language')}
                value={s.language}
                onChange={(e) => set({ language: e.target.value as Settings['language'] })}
              >
                <option value="auto">{t('لغة العميل', 'Customer language')}</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              {t('عدد رسائل السياق', 'Conversation history limit')}
              <input
                type="number"
                min={2}
                max={30}
                value={s.max_history}
                onChange={(e) => set({ max_history: Number(e.target.value) })}
                required
              />
            </label>
            <label className="field">
              {t('درجة تنوع الرد', 'Response variation')}
              <input
                type="number"
                min={0}
                max={1}
                step="0.1"
                value={s.temperature}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
                required
              />
            </label>
          </div>
          </section><section className="settings-block"><h3>{t('عند تعذّر الرد','Fallback and handoff')}</h3><label className="field">
            {t('رسالة تعذّر الرد', 'Fallback message')}
            <textarea
              maxLength={500}
              required
              value={s.fallback_message}
              onChange={(e) => set({ fallback_message: e.target.value })}
            />
          </label>
          <label className="field">
            {t('رسالة التحويل البشري', 'Human escalation message')}
            <textarea
              maxLength={500}
              required
              value={s.handoff_message}
              onChange={(e) => set({ handoff_message: e.target.value })}
            />
          </label>
          </section>{dirty&&<p role="status" className="notice">{t('تغييرات غير محفوظة','Unsaved changes')}</p>}<div className="form-actions"><button type="button" className="btn" disabled={!dirty||busy} onClick={()=>{if(window.confirm(t('تجاهل التعديلات؟','Discard changes?'))){setDraft(null);setError('');}}}>{t('تجاهل التعديلات','Discard changes')}</button><button className="btn btn-primary self-start" disabled={busy || !dirty||!valid}>
            {t('حفظ الإعدادات', 'Save settings')}
          </button></div>
        </fieldset>
      </form>
      <section className="card stack" hidden={activePanel!=='test'}>
        <h2>{t('تجربة المساعد', 'Test assistant')}</h2>
        {draft&&<p className="muted">{t('الاختبار يستخدم الإعدادات المحفوظة؛ احفظ المسودة أولًا لتجربة التغييرات.','Tests use saved settings; save the draft to test your changes.')}</p>}
        <p className="muted">
          {t(
            'التجربة تستخدم الميزانية نفسها عند السماح بالاتصال بالمزود.',
            'Tests use the same budget when provider calls are enabled.',
          )}
        </p>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if(lock.current||!manage||!q.trim()||dirty||status.loading||!!status.error)return;
            lock.current=true;setBusy(true);
            setError('');
            setAnswer(null);
            try {
              setAnswer(
                await api('/ai/test', { method: 'POST', body: JSON.stringify({ question: q.trim() }) }),
              );
              await usage.reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              lock.current=false;setBusy(false);
            }
          }}
        >
          <label className="field">
            {t('سؤال تجريبي', 'Test question')}
            <input value={q} maxLength={1000} required disabled={busy} onChange={(e) => {setQ(e.target.value);setAnswer(null);}} />
          </label>
          <button className="btn" disabled={busy || !manage||dirty||!q.trim()||status.loading||!!status.error}>
            {t('اختبار الرد', 'Test reply')}
          </button>
        </form>
        {answer && (
          <article className="notice whitespace-pre-wrap" role="status">
            <p>{answer.text}</p>
            {answer.reason&&<small>{t('سبب النتيجة','Result reason')}: {answer.reason}</small>}
            {answer.failed && (
              <p>
                {t(
                  'تعذّر الرد؛ راجع الإعدادات والميزانية.',
                  'Could not answer; review settings and budget.',
                )}
              </p>
            )}
            {answer.handoff && <p>{t('يلزم متابعة بشرية.', 'Human follow-up required.')}</p>}
            {answer.sources?.length > 0 && (
              <p>
                {t('المصادر: ', 'Sources: ')}
                {answer.sources.map((s) => s.title).join(' · ')}
              </p>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
