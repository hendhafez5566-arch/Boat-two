'use client';
import { WorkspaceHeading } from '../product/ProductUI';
import Link from 'next/link';
import styles from './ai-workspace.module.css';
import { KnowledgeRetention } from '../business/KnowledgeRetention';
import { useEffect, useState } from 'react';
import { KnowledgeJobs } from '../business/KnowledgeJobs';
import { KnowledgeSourceEditor, Source } from '../business/KnowledgeSourceEditor';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
export default function Knowledge() {
  const { t, language } = useLocale();
  const displayNumber = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en');
  const [items, setItems] = useState<Source[]>([]),
    [tab, setTab] = useState<'text' | 'faq' | 'url' | 'file'>('text'),
    [faq, setFaq] = useState([{ question: '', answer: '' }]),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [role, setRole] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [showArchived, setShowArchived] = useState(false),
    [query, setQuery] = useState(''),
    [createOpen, setCreateOpen] = useState(false);
  const [sourceStatus,setSourceStatus]=useState('all');
  const canManage = role === 'owner' || role === 'admin';
  const currentSources = items.filter((item) => !item.archived_at);
  const readySources = currentSources.filter((item) => item.status === 'ready');
  const processingSources = currentSources.filter((item) => ['pending', 'processing', 'blocked'].includes(item.status));
  function openAddSource(type?: typeof tab) {
    if (type) setTab(type);
    setCreateOpen(true);
    window.setTimeout(() => document.getElementById('knowledge-editor')?.scrollIntoView({
      behavior: 'smooth', block: 'start',
    }), 0);
  }
  async function load() {
    setItems(await api<Source[]>('/ai/knowledge'));
  }
  useEffect(() => {
    Promise.all([load(), api<{ role: string }>('/workspace').then((w) => setRole(w.role))])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!items.some((i) => !i.archived_at && ['pending', 'processing'].includes(i.status))) return;
    const timer = setTimeout(() => void load().catch((e) => setError(e.message)), 3000);
    return () => clearTimeout(timer);
  }, [items]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (busy) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      if (tab === 'file') await api('/ai/knowledge/upload', { method: 'POST', body: f });
      else
        await api('/ai/knowledge', {
          method: 'POST',
          body: JSON.stringify(
            tab === 'text'
              ? { type: tab, title: f.get('title'), content: f.get('content') }
              : tab === 'faq'
                ? { type: tab, title: f.get('title'), items: faq }
                : { type: tab, url: f.get('url'), title: f.get('title') || undefined },
          ),
        });
      form.reset();
      setFaq([{ question: '', answer: '' }]);
      setFeedback(t(
        'تم حفظ المصدر. راجع بطاقته لمعرفة حالة الفهرسة.',
        'Source saved. Check its card for indexing status.',
      ));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, method = 'POST', body?: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const statuses: Record<string, string> = {
    pending: t('في الانتظار', 'Pending'),
    processing: t('جارٍ المعالجة', 'Processing'),
    ready: t('جاهز', 'Ready'),
    failed: t('فشل', 'Failed'),
    blocked: t('بانتظار تفعيل المعالجة', 'Processing blocked'),
    canceled: t('ملغى', 'Canceled'),
  };
  const types: Record<string, string> = {
    text: t('نص', 'Text'),
    faq: t('أسئلة وأجوبة', 'FAQ'),
    url: t('صفحة ويب', 'Web page'),
    file: t('ملف', 'File'),
  };
  const filtered = items.filter(
    (i) => (showArchived || !i.archived_at) && (sourceStatus==='all'||(sourceStatus==='processing'?['pending','processing','blocked'].includes(i.status):i.status===sourceStatus)) && i.title.toLowerCase().includes(query.toLowerCase().trim()),
  );
  return (
    <section className="stack">
      <div className={styles.intro}>
        <div className={styles.introText}>
          <WorkspaceHeading
            title={t('قاعدة المعرفة', 'Knowledge Base')}
            description={t(
              'ضيف معلومات شركتك مرة واحدة، والمساعد يستعين بالمصادر اللي تختارها له.',
              'Add your company knowledge and choose which sources each AI assistant may use.',
            )}
          />
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => openAddSource()}>
            + {t('إضافة معلومات', 'Add knowledge')}
          </button>
        )}
      </div>
      <details className={styles.guide} aria-label={t('كيف تعمل قاعدة المعرفة', 'How knowledge works')}><summary>{t('دليل إعداد المعرفة','Knowledge setup guide')}</summary>
        <div className={styles.guideHead}>
          <strong>{t('إزاي المساعد بيتعلم معلومات شركتك؟', 'How your assistant uses company knowledge')}</strong>
          <span>{t('3 خطوات بسيطة', 'Three simple steps')}</span>
        </div>
        <div className={styles.steps}>
          <button className={styles.step} type="button" onClick={() => openAddSource('faq')} disabled={!canManage}>
            <span className={styles.stepNumber}>1</span>
            <span><strong>{t('ضيف معلومات أو أسئلة شائعة', 'Add information or FAQs')}</strong>
              <small>{t('الأسعار والسياسات والخدمات', 'Services, policies and prices')}</small></span>
          </button>
          <div className={styles.step}>
            <span className={styles.stepNumber}>2</span>
            <span><strong>{t('انتظر حالة «جاهز»', 'Wait for “Ready”')}</strong>
              <small>{t('بعد معالجة المصدر وفهرسته', 'Once the source is processed and indexed')}</small></span>
          </div>
          <Link className={styles.step} href="/dashboard/agents">
            <span className={styles.stepNumber}>3</span>
            <span><strong>{t('اربط المصدر بالمساعد', 'Assign it to an assistant')}</strong>
              <small>{t('المعلومات مش بتتربط تلقائيًا', 'Sources are not assigned automatically')}</small></span>
          </Link>
        </div>
      </details>
      <div className={styles.stats} aria-label={t('حالة المعلومات', 'Knowledge summary')}>
        <div><strong>{loading ? '…' : error && !items.length ? '—' : displayNumber.format(currentSources.length)}</strong><span>{t('إجمالي المصادر', 'Total sources')}</span></div>
        <div><strong>{loading ? '…' : error && !items.length ? '—' : displayNumber.format(readySources.length)}</strong><span>{t('جاهزة للاستخدام', 'Ready to use')}</span></div>
        <div><strong>{loading ? '…' : error && !items.length ? '—' : displayNumber.format(processingSources.length)}</strong><span>{t('تحت المعالجة أو الانتظار', 'Pending or processing')}</span></div>
      </div>
      <p className={styles.safetyNote} role="note">
        {t(
          'لاستخدام مصدر جاهز، اختره في إعدادات المساعد وفعّل تشغيل الذكاء الاصطناعي.',
          'To use a ready source, select it in the assistant settings and enable AI generation.',
        )}
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {feedback && <p role="status" className="notice">{feedback}</p>}
      {canManage && (
        <>
          <details
            id="knowledge-editor"
            className={styles.createDetails}
            open={createOpen}
            onToggle={(event) => setCreateOpen(event.currentTarget.open)}
          >
            <summary>{t('أضف معلومات جديدة للمساعد', 'Add a knowledge source')}</summary>
            <form className="stack" onSubmit={submit}>
              <div className="field">
                <strong>{t('اختار طريقة إضافة المعلومة', 'Choose how to add knowledge')}</strong>
                <div className={styles.typePicker} role="group" aria-label={t('نوع المصدر', 'Source type')}>
                  {Object.entries(types).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={tab === key ? styles.typeSelected : styles.typeOption}
                      aria-pressed={tab === key}
                      onClick={() => setTab(key as typeof tab)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <small className={styles.helper}>
                  {tab === 'text'
                    ? t('مناسب لتفاصيل الخدمات والسياسات المكتوبة.', 'Best for written service details and policies.')
                    : tab === 'faq'
                      ? t('مناسب لأسئلة العملاء المتكررة وإجاباتها.', 'Best for frequently asked customer questions.')
                      : tab === 'url'
                        ? t('استورد محتوى صفحة ويب عامة.', 'Import content from a public web page.')
                        : t('ارفع ملف معلومات نصي. ملفات PDF المصوّرة غير مدعومة.', 'Upload a text-based document. Scanned PDFs are not supported.')}
                </small>
              </div>
              <label className="field">
                {t('2. عنوان واضح للمصدر', '2. Give the source a clear title')}
                <input name="title" maxLength={200} required={tab === 'text' || tab === 'faq'}
                  placeholder={t('مثال: أسئلة العمرة أو سياسة الحجز', 'e.g. Booking policy or service FAQ')} />
              </label>
              {tab === 'text' && (
                <label className="field">
                  {t('المعلومات التي يستند إليها المساعد', 'Information the assistant can use')}
                  <textarea name="content" required minLength={20} maxLength={300000} rows={6}
                    placeholder={t('اكتب تفاصيل الخدمة أو السياسة بلغة واضحة. مثال: المستندات المطلوبة، المواعيد وشروط الإلغاء.', 'Describe the service or policy clearly. For example: required documents, schedules and cancellations.')} />
                </label>
              )}
              {tab === 'url' && (
                <label className="field">
                  {t('رابط الصفحة', 'Page URL')}
                  <input name="url" type="url" maxLength={2000} required dir="ltr"
                    placeholder="https://example.com/faq" />
                </label>
              )}
              {tab === 'file' && (
                <label className="field">
                  {t(
                    'ملف حتى 5MB؛ PDF المصوّر غير مدعوم',
                    'File up to 5MB; scanned PDFs are unsupported',
                  )}
                  <input name="file" type="file" required accept=".txt,.md,.csv,.pdf,.docx" />
                </label>
              )}
              {tab === 'faq' && (
                <>
                  {faq.map((item, index) => (
                    <div className="form-grid" key={index}>
                      <label className="field">
                        {t('السؤال', 'Question')}
                        <input
                          value={item.question}
                          required
                          maxLength={500}
                          onChange={(e) =>
                            setFaq(
                              faq.map((v, i) =>
                                i === index ? { ...v, question: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        {t('الإجابة', 'Answer')}
                        <textarea
                          value={item.answer}
                          required
                          maxLength={2500}
                          onChange={(e) =>
                            setFaq(
                              faq.map((v, i) =>
                                i === index ? { ...v, answer: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="btn"
                        type="button"
                        disabled={faq.length <= 1}
                        onClick={() => setFaq(faq.filter((_, i) => i !== index))}
                      >
                        {t('إزالة السؤال', 'Remove question')}
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn"
                    type="button"
                    disabled={faq.length >= 300}
                    onClick={() => setFaq([...faq, { question: '', answer: '' }])}
                  >
                    {t('إضافة سؤال', 'Add question')}
                  </button>
                </>
              )}
              <button className="btn btn-primary" disabled={busy}>
                {busy
                  ? t('جارٍ الحفظ…', 'Saving…')
                  : t('حفظ المصدر', 'Save source')}
              </button>
            </form>
          </details>
        </>
      )}
      <section className={styles.sourcesSection}>
        <div className={styles.sectionHeading}>
          <div><h2>{t('معلومات الشركة', 'Company knowledge')}</h2>
            <p>{t('شوف المصادر الموجودة وحالة كل مصدر، وعدّل اللي محتاج تحديث.', 'Check each source status and update what needs changing.')}</p></div>
        </div>
        <div className="form-actions">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('بحث في المصادر', 'Search sources')}
            placeholder={t('ابحث بالعنوان', 'Search by title')}
          />
          <select value={sourceStatus} onChange={e=>setSourceStatus(e.target.value)} aria-label={t('حالة المصدر','Source status')}><option value="all">{t('كل الحالات','All statuses')}</option><option value="ready">{t('جاهز','Ready')}</option><option value="processing">{t('قيد المعالجة','Processing')}</option><option value="failed">{t('فشل','Failed')}</option></select>
          <label>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {t('إظهار المؤرشف', 'Include archived')}
          </label>
        </div>
        {loading && <p role="status">{t('جارٍ تحميل المصادر…', 'Loading sources…')}</p>}
        {!loading && !filtered.length && !error && (
          query.trim()||sourceStatus!=='all' ? <div className={styles.empty}>
            <p>{t('مافيش مصادر مطابقة للبحث.', 'No matching sources.')}</p>
            <button type="button" className="btn" onClick={() => {setQuery('');setSourceStatus('all');}}>{t('مسح التصفية', 'Clear filters')}</button>
          </div> : <div className={styles.empty}>
            <strong>{t('لسه مفيش معلومات مضافة', 'No knowledge added yet')}</strong>
            <p>{t('ابدأ بإضافة الأسئلة الشائعة أو معلومات الخدمة عشان المساعد يلاقي إجابات موثوقة.', 'Add FAQs or service details so your assistant can find reliable answers.')}</p>
            {canManage && <button className="btn btn-primary" type="button" onClick={() => openAddSource('faq')}>{t('أضف أول سؤال وجواب', 'Add your first FAQ')}</button>}
          </div>
        )}
        <div className={styles.sourceGrid}>
          {filtered.map((source) => (
            <article className={styles.sourceCard} key={source.id}>
              <div className={styles.sourceTitle}>
                <span className={styles.sourceIcon} aria-hidden="true">{source.type === 'faq' ? '?' : source.type === 'file' ? '▤' : source.type === 'url' ? '↗' : '≡'}</span>
                <div><h3>{source.title}</h3><small>{types[source.type]}</small></div>
              </div>
              <span className={source.archived_at ? styles.statusMuted : source.status === 'ready' ? styles.statusActive : source.status === 'failed' ? styles.statusError : styles.statusPending}>
                {source.archived_at ? t('مؤرشف', 'Archived') : (statuses[source.status] ?? source.status)}
              </span>
              <p className={styles.sourceMeta}>{t('إصدار', 'Revision')} {source.revision}
                {' · '}{source.chunk_count} {t('مقطع', 'chunks')}{' · '}{source.char_count} {t('حرف', 'characters')}</p>
              {source.error && <p className="notice error" role="alert">{source.error}</p>}
              {canManage && (
                <div className={styles.sourceActions}>
                  <button type="button" className="btn" disabled={busy} onClick={() => setEditing(source.id)}>
                    {t('تعديل المعلومات', 'Edit source')}
                  </button>
                  <details className={styles.sourceMore}>
                    <summary>{t('المزيد من الخيارات', 'More options')}</summary>
                    <div className={styles.sourceMoreActions}>
                      <button type="button" className="btn" disabled={busy || !!source.archived_at}
                        onClick={() => void act('/ai/knowledge/' + source.id + '/reindex')}>
                        {t('إعادة الفهرسة', 'Reindex')}
                      </button>
                      <button type="button" className="btn" disabled={busy}
                        onClick={() => void act('/ai/knowledge/' + source.id + '/archive', 'PATCH', { archived: !source.archived_at })}>
                        {source.archived_at ? t('استعادة', 'Restore') : t('أرشفة', 'Archive')}
                      </button>
                      <button type="button" className="btn" disabled={busy}
                        onClick={() => {
                          if (confirm(t('حذف المصدر والفهرس والإصدارات نهائيًا؟ الأرشفة تحفظها.', 'Permanently delete source and history? Archive keeps them.')))
                            void act('/ai/knowledge/' + source.id, 'DELETE');
                        }}>
                        {t('حذف نهائي', 'Delete permanently')}
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <details className={styles.advanced}>
        <summary>{t('الإدارة المتقدمة: معالجة المصادر والاحتفاظ بالبيانات', 'Advanced: processing and data retention')}</summary>
        <div className={styles.advancedBody}>
          <p className={styles.helper}>{t('دي أدوات لمتابعة المهام التقنية أو تنظيف بيانات المعالجة القديمة، مش ضرورية لإضافة المعلومات اليومية.', 'These tools manage technical processing and old job data; they are not needed for everyday knowledge updates.')}</p>
          {canManage && <KnowledgeJobs />}
          <KnowledgeRetention />
        </div>
      </details>
      {editing && canManage && (
        <KnowledgeSourceEditor id={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </section>
  );
}
