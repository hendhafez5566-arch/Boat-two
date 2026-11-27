'use client';
import { useEffect,useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
export type Source = {
  id: string;
  title: string;
  type: 'text' | 'faq' | 'url' | 'file';
  source_ref: string | null;
  content?: string | null;
  revision: number;
  archived_at: string | null;
  status: string;
  chunk_count: number;
  char_count: number;
  error: string | null;
};
type Extraction = {
  id: string;
  source_revision: number;
  char_count: number;
  created_at: string;
  purged_at?: string | null;
};
type Revision = { revision: number; title: string; created_at: string };
export function parseFaq(content: string) {
  return content
    .split('\n---\n')
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^Q: ([\s\S]*?)\nA: ([\s\S]*)$/);
      return { question: match?.[1] ?? part, answer: match?.[2] ?? '' };
    });
}
export function KnowledgeSourceEditor({
  id,
  onClose,
  onSaved,onDraftState,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDraftState?:(dirty:boolean,busy:boolean)=>void;
}) {
  const { t } = useLocale();
  const [file, setFile] = useState<File | null>(null),
    [extractions, setExtractions] = useState<Extraction[]>([]),
    [extractedPreview, setExtractedPreview] = useState('');
  const [source, setSource] = useState<Source | null>(null),
    [history, setHistory] = useState<Revision[]>([]),
    [title, setTitle] = useState(''),
    [content, setContent] = useState(''),
    [url, setUrl] = useState(''),
    [faq, setFaq] = useState<{ question: string; answer: string }[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const lock=useRef(false);
  const [snapshot,setSnapshot]=useState('');
  const [loadError,setLoadError]=useState(false);
  const fingerprint=JSON.stringify([title,content,url,faq]);
  const dirty=!!source&&(snapshot!==fingerprint||!!file);
  const canLeave=()=>!lock.current&&(!dirty||window.confirm(t('تجاهل التعديلات غير المحفوظة؟','Discard unsaved changes?')));
  useEffect(()=>{onDraftState?.(dirty,busy);},[dirty,busy,onDraftState]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  function fill(value: { title: string; content?: string | null; source_ref: string | null }) {
    setTitle(value.title);
    setContent(value.content ?? '');
    setUrl(value.source_ref ?? '');
    setFaq(parseFaq(value.content ?? ''));
  }
  async function load() {
    const result = await api<{ source: Source; history: Revision[] }>(
      '/ai/knowledge/' + id + '/edit',
    );
    setExtractions(await api<Extraction[]>('/ai/knowledge/' + id + '/extractions'));
    setFile(null);setLoadError(false);setExtractedPreview('');
    setSnapshot(JSON.stringify([result.source.title,result.source.content??'',result.source.source_ref??'',parseFaq(result.source.content??'')]));
    setSource(result.source);
    setHistory(result.history);
    fill(result.source);
  }
  useEffect(() => {
    setSource(null);
    setError('');
    setExtractedPreview('');
    void load().catch((e) => {setLoadError(true);setError(e.message);});
  }, [id]);
  async function restore(revision: number) {
    if(!canLeave())return;
    lock.current=true;setBusy(true);
    setError('');
    try {
      const result = await api<{
        title: string;
        content: string | null;
        source_ref: string | null;
      }>('/ai/knowledge/' + id + '/revisions/' + revision);
      fill(result);
      setNotice(
        t(
          'تم تحميل إصدار سابق للمراجعة؛ احفظه كإصدار جديد لتطبيقه.',
          'A previous version is loaded for review; save it as a new revision to apply it.',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if(!source||lock.current||!dirty||source.archived_at||loadError)return;
    if(!title.trim()||(source.type==='text'&&!content.trim())||(source.type==='faq'&&(!faq.length||faq.some(x=>!x.question.trim()||!x.answer.trim())))){setError(t('أكمل الحقول المطلوبة.','Complete required fields.'));return;}
    if(source.type==='file'&&(!file||!file.size||file.size>5*1024*1024||!/[.](txt|md|csv|pdf|docx)$/i.test(file.name))){setError(t('اختر ملفًا مدعومًا حتى 5MB.','Choose a supported file up to 5MB.'));return;}
    lock.current=true;setBusy(true);
    setError('');
    try {
      if (source.type === 'file') {
        if (!file) throw new Error(t('اختر ملفًا بديلًا', 'Choose a replacement file'));
        const body = new FormData();
        body.set('file', file);
        body.set('title', title);
        body.set('expectedRevision', String(source.revision));
        await api('/ai/knowledge/' + id + '/replace-file', { method: 'POST', body });
      } else
        await api('/ai/knowledge/' + id, {
          method: 'PATCH',
          body: JSON.stringify({
            type: source.type,
            title,
            expectedRevision: source.revision,
            ...(source.type === 'text'
              ? { content }
              : source.type === 'faq'
                ? { items: faq }
                : { url }),
          }),
        });
      setSnapshot(fingerprint);setFile(null);
      try{await load();}catch(e){setLoadError(true);setError(t('تم الحفظ لكن تعذر تحديث الإصدار. أعد تحميله قبل أي تعديل.','Saved, but revision refresh failed. Reload before editing again.')+' '+(e as Error).message);return;}
      await onSaved();
      setNotice(
        t('حُفظ الإصدار وأضيفت مهمة فهرسة جديدة.', 'Revision saved and a new indexing job queued.'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  return (
    <section className="card stack knowledge-editor" aria-busy={busy} aria-label={t('تحرير مصدر المعرفة', 'Edit knowledge source')}>
      <div className="page-heading">
        <h2>{t('تحرير المصدر والإصدارات', 'Source editor and history')}</h2>
        <button className="btn" disabled={busy} onClick={()=>{if(canLeave())onClose();}}>
          {t('إغلاق', 'Close')}
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error} {loadError&&<button type="button" className="btn" disabled={busy} onClick={()=>{if(!canLeave())return;lock.current=true;setBusy(true);setError('');void load().catch(e=>{setLoadError(true);setError(e.message);}).finally(()=>{lock.current=false;setBusy(false);});}}>{t('إعادة تحميل المصدر','Reload source')}</button>}
        </p>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {dirty&&<p className="notice" role="status">{t('تغييرات غير محفوظة','Unsaved changes')}</p>}
      {!source ? (
        !loadError&&<p role="status">{t('جارٍ تحميل المصدر…', 'Loading source…')}</p>
      ) : (
        <>
          <p className="muted">
            {t('الإصدار الحالي', 'Current revision')} {source.revision} ·{' '}
            {t(
              'ألغِ مهمة الفهرسة النشطة قبل التحرير. يبقى الفهرس السابق حتى اكتمال البديل.',
              'Cancel active indexing before editing. The prior index remains until its replacement completes.',
            )}
          </p>
          <form className="stack" onSubmit={save}>
            <fieldset className="knowledge-fields" disabled={busy||!!source.archived_at||loadError}>
            <label className="field">
              {t('العنوان', 'Title')}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            {source.type === 'text' && (
              <label className="field">
                {t('المحتوى', 'Content')}
                <textarea
                  rows={10}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  minLength={20}
                  maxLength={300000}
                  required
                />
              </label>
            )}
            {source.type === 'url' && (
              <label className="field">
                {t('رابط المصدر', 'Source URL')}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  maxLength={2000}
                  required
                  dir="ltr"
                />
              </label>
            )}
            {source.type === 'faq' && (
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
            {source.type === 'file' && (
              <>
                <p className="notice">
                  {t(
                    'استبدال الملف يحفظ معرّف المصدر وربط المساعد والفهرس الحالي حتى اكتمال الفهرس البديل. ألغِ أي مهمة نشطة أولًا. الحد 5MB.',
                    'Replacement preserves the source ID, agent assignments and current index until the new index completes. Cancel active indexing first. Maximum 5MB.',
                  )}
                </p>
                <label>
                  {t('الملف البديل', 'Replacement file')}
                  <input
                    key={source.revision} type="file"
                    accept=".txt,.md,.csv,.pdf,.docx"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </>
            )}
            <button className="btn btn-primary" disabled={busy||!!source.archived_at||!dirty||loadError}>
              {t('حفظ إصدار وإعادة الفهرسة', 'Save revision and reindex')}
            </button>
            </fieldset>
          </form>
          {extractions.length > 0 && (
            <section className="stack">
              <h3>{t('لقطات النص المستخرج', 'Extracted text snapshots')}</h3>
              {extractions.map((row) => (
                <div key={row.id} className="form-actions">
                  <span>
                    {t('إصدار', 'Revision')} {row.source_revision} · {row.char_count} ·{' '}
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                  <button
                    className="btn"
                    disabled={busy||!!row.purged_at}
                    onClick={async () => {
                      if(lock.current)return;lock.current=true;setExtractedPreview('');setBusy(true);
                      setError('');
                      try {
                        const snapshot = await api<{ content: string }>(
                          '/ai/knowledge/' + id + '/extractions/' + row.id,
                        );
                        if (!snapshot.content)
                          throw new Error(
                            t(
                              'نُقّحت اللقطة وفق سياسة الاحتفاظ',
                              'Snapshot content was removed under retention policy',
                            ),
                          );
                        setExtractedPreview(snapshot.content.slice(0, 10000));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        lock.current=false;setBusy(false);
                      }
                    }}
                  >
                    {t('معاينة النص', 'Preview text')}
                  </button>
                </div>
              ))}
              {extractedPreview && (
                <>
                  <p className="muted">
                    {t('معاينة حتى 10,000 حرف', 'Preview up to 10,000 characters')}
                  </p>
                  <textarea
                    readOnly
                    rows={10}
                    aria-label={t('لقطة النص المستخرج', 'Extracted text snapshot')}
                    value={extractedPreview}
                  />
                </>
              )}
            </section>
          )}
          <h3>{t('سجل الإصدارات', 'Revision history')}</h3>
          <div className="stack">
            {history.map((row) => (
              <div className="form-actions" key={row.revision}>
                <span>
                  {row.revision} · {row.title} · {new Date(row.created_at).toLocaleString()}
                </span>
                <button
                  className="btn"
                  disabled={busy||source.type==='file'||!!source.archived_at||loadError}
                  onClick={() => void restore(row.revision)}
                >
                  {t('تحميل للمراجعة', 'Load for review')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
