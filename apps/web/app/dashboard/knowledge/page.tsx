'use client';
import { KnowledgeRetention } from '../../../components/business/KnowledgeRetention';
import { useEffect, useState } from 'react';
import { KnowledgeJobs } from '../../../components/business/KnowledgeJobs';
import { KnowledgeSourceEditor, Source } from '../../../components/business/KnowledgeSourceEditor';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
export default function Knowledge() {
  const { t } = useLocale();
  const [items, setItems] = useState<Source[]>([]),
    [tab, setTab] = useState<'text' | 'faq' | 'url' | 'file'>('text'),
    [faq, setFaq] = useState([{ question: '', answer: '' }]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [role, setRole] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [showArchived, setShowArchived] = useState(false),
    [query, setQuery] = useState('');
  const canManage = role === 'owner' || role === 'admin';
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
    setBusy(true);
    setError('');
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
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, method = 'POST', body?: unknown) {
    setBusy(true);
    setError('');
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
    (i) => (showArchived || !i.archived_at) && i.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('المعرفة', 'KNOWLEDGE')}</p>
          <h1>{t('معرفة موثوقة لمساعدك', 'Trusted knowledge for your assistant')}</h1>
          <p>
            {t(
              'أضف المعلومات، راجع مصادرها، ثم تابع الفهرسة. الاستدعاءات المدفوعة تتطلب تفعيل المشغّل.',
              'Add information, review sources, then track indexing. Paid calls require operator activation.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {canManage && (
        <>
          <form className="card stack" onSubmit={submit}>
            <h2>{t('إضافة مصدر', 'Add a source')}</h2>
            <label className="field">
              {t('1. اختر نوع المعلومات', '1. Choose the information type')}
              <select value={tab} onChange={(e) => setTab(e.target.value as typeof tab)}>
                {Object.entries(types).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('2. عنوان واضح للمصدر', '2. Give the source a clear title')}
              <input name="title" maxLength={200} required={tab === 'text' || tab === 'faq'} />
            </label>
            {tab === 'text' && (
              <label className="field">
                {t('المعلومات التي يستند إليها المساعد', 'Information the assistant can use')}
                <textarea name="content" required minLength={20} maxLength={300000} rows={7} />
              </label>
            )}
            {tab === 'url' && (
              <label className="field">
                {t('رابط الصفحة', 'Page URL')}
                <input name="url" type="url" maxLength={2000} required dir="ltr" />
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
                            faq.map((v, i) => (i === index ? { ...v, answer: e.target.value } : v)),
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
                : t('3. حفظ ومتابعة الفهرسة', '3. Save and track indexing')}
            </button>
          </form>
          <KnowledgeJobs />
        </>
      )}
      <section className="card stack">
        <h2>{t('مصادر المعرفة', 'Knowledge sources')}</h2>
        <div className="form-actions">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('بحث في المصادر', 'Search sources')}
            placeholder={t('ابحث بالعنوان', 'Search by title')}
          />
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
        {!loading && !filtered.length && (
          <p>
            {t(
              'لا توجد مصادر مطابقة. أضف نصًا أو ملفًا للبدء.',
              'No matching sources. Add text or a file to get started.',
            )}
          </p>
        )}
        <div className="card-grid">
          {filtered.map((source) => (
            <article className="card stack" key={source.id}>
              <h3>{source.title}</h3>
              <span className="badge">
                {source.archived_at
                  ? t('مؤرشف', 'Archived')
                  : (statuses[source.status] ?? source.status)}
              </span>
              <p className="muted">
                {types[source.type]} · {t('إصدار', 'Revision')} {source.revision} ·{' '}
                {source.chunk_count} {t('مقطع', 'chunks')} · {source.char_count}{' '}
                {t('حرف', 'characters')}
              </p>
              {source.error && <p className="notice error">{source.error}</p>}
              {canManage && (
                <div className="form-actions">
                  <button className="btn" disabled={busy} onClick={() => setEditing(source.id)}>
                    {t('تحرير والإصدارات', 'Edit and history')}
                  </button>
                  <button
                    className="btn"
                    disabled={busy || !!source.archived_at}
                    onClick={() => void act('/ai/knowledge/' + source.id + '/reindex')}
                  >
                    {t('إعادة الفهرسة', 'Reindex')}
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void act('/ai/knowledge/' + source.id + '/archive', 'PATCH', {
                        archived: !source.archived_at,
                      })
                    }
                  >
                    {source.archived_at ? t('استعادة', 'Restore') : t('أرشفة', 'Archive')}
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          t(
                            'حذف المصدر والفهرس والإصدارات نهائيًا؟ الأرشفة تحفظها.',
                            'Permanently delete this source, index and history? Archiving retains them.',
                          ),
                        )
                      )
                        void act('/ai/knowledge/' + source.id, 'DELETE');
                    }}
                  >
                    {t('حذف نهائي', 'Delete permanently')}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <KnowledgeRetention />
      {editing && canManage && (
        <KnowledgeSourceEditor id={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </main>
  );
}
