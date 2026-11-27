'use client';
import { useEffect,useRef,useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Preview = { cutoff: string; jobs: number; extractions: number };
type Run = {
  id: string;
  status: string;
  jobs_purged: number;
  extractions_purged: number;
  created_at: string;
  error: string | null;
};
export function KnowledgeRetention() {
  const { t } = useLocale(),
    ws = useData<{ role: string }>('/workspace', { role: '' }),
    runs = useData<Run[]>(ws.data.role === 'owner' ? '/ai/knowledge-retention' : null, []);
  const [days, setDays] = useState(90),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const lock=useRef(false);
  const [notice,setNotice]=useState('');
  const [reviewedDays,setReviewedDays]=useState<number|null>(null);
  const valid=Number.isInteger(days)&&days>=30&&days<=3650;
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  async function act(start = false) {
    if(lock.current||!valid||(start&&(!preview||reviewedDays!==days||!confirmed)))return;
    if(start&&!window.confirm(t('تأكيد إزالة المحتوى القديم نهائيًا؟','Confirm permanent removal of old payloads?')))return;
    lock.current=true;setBusy(true);setNotice('');
    setError('');
    try {
      if (start) {
        await api('/ai/knowledge-retention', {
          method: 'POST',
          body: JSON.stringify({ days, confirmed: true }),
        });
        setPreview(null);
        setConfirmed(false);
        await runs.reload();setNotice(t('تم طلب التنظيف المحدود','Bounded cleanup requested'));
      } else {
        setPreview(null);setConfirmed(false);setReviewedDays(null);
        setPreview(
          await api<Preview>('/ai/knowledge-retention/preview', {
            method: 'POST',
            body: JSON.stringify({ days }),
          }),
        );setReviewedDays(days);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  if (ws.data.role !== 'owner') return null;
  return (
    <section className="card stack">
      <h2>{t('الاحتفاظ ببيانات مهام المعرفة', 'Knowledge job retention')}</h2>
      <p className="notice">
        {t(
          'يحذف محتوى المهام المكتملة والملغاة القديمة واللقطات القديمة المؤهلة. يحتفظ بالمصدر والفهرس المنشور وآخر لقطة والإصدارات والبصمات وسجلات المحاسبة. المهام الفاشلة والنشطة تبقى قابلة للاسترداد. إزالة المحتوى دائمة.',
          'Removes eligible old completed/canceled job payloads and old extraction text. Source content, published index, latest snapshot, revisions, hashes and accounting ledgers remain. Failed and active jobs stay recoverable. Payload removal is permanent.',
        )}
      </p>
      {(error || runs.error) && (
        <p className="notice error" role="alert">
          {error || runs.error} {runs.error&&<button className="btn" onClick={()=>void runs.reload()}>{t('إعادة المحاولة','Retry')}</button>}
        </p>
      )}
      {notice&&<p role="status" className="notice">{notice}</p>}
      <label>
        {t('الاحتفاظ بالأيام (30 على الأقل)', 'Retention days (at least 30)')}
        <input
          type="number"
          disabled={busy} step={1} min={30}
          max={3650}
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setPreview(null);
            setConfirmed(false);
          }}
        />
      </label>
      <button className="btn" disabled={busy||!valid} onClick={() => act()}>
        {t('معاينة البيانات المؤهلة', 'Preview eligible data')}
      </button>
      {preview && (
        <>
          <p>
            {t('المهام / اللقطات المؤهلة', 'Eligible jobs / snapshots')}: {preview.jobs} /{' '}
            {preview.extractions} · {new Date(preview.cutoff).toLocaleString()}
          </p>
          <label>
            <input
              type="checkbox"
              disabled={busy} checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t('أؤكد إزالة المحتوى القديم نهائيًا', 'I confirm permanent removal of old payloads')}
          </label>
          <button className="btn" disabled={busy||!confirmed||reviewedDays!==days} onClick={() => act(true)}>
            {t('بدء التنظيف المحدود', 'Start bounded cleanup')}
          </button>
        </>
      )}
      <button className="btn" disabled={busy||runs.loading} onClick={() => runs.reload()}>
        {t('تحديث التنفيذ', 'Refresh runs')}
      </button>
      {runs.loading&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
      {!runs.loading&&!runs.error&&!runs.data.length&&<p>{t('لا توجد عمليات تنظيف مسجلة','No cleanup runs recorded')}</p>}
      {!runs.loading&&!runs.error&&runs.data.map((r) => (
        <p key={r.id}>
          {r.status} · {t('مهام / لقطات', 'Jobs / snapshots')}: {r.jobs_purged} /{' '}
          {r.extractions_purged} · {r.error}
        </p>
      ))}
    </section>
  );
}
