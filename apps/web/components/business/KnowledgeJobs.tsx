'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { useEffect,useRef,useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
type Job = {
  id: string;
  title: string;
  status: string;
  processed: number;
  total: number;
  error: string | null;
  attempts: number;
};
export function KnowledgeJobs() {
  const { t } = useLocale();
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(1);
  const path='/ai/knowledge-jobs/index?'+new URLSearchParams({q:query,status,page:String(page),limit:'12'});
  const data = useData<{
    jobs: Job[];total:number;
    usage: { charged: number; reserved: number };
    limit: number;
    reservations: { effect_key: string; amount: number; status: string }[];
  }>(path, {
    jobs: [],total:0,
    usage: { charged: 0, reserved: 0 },
    limit: 0,
    reservations: [],
  });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock=useRef(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  const ready=data.loadedPath===path&&!data.loading&&!data.error;
  const jobs=ready?data.data.jobs:[],pages=Math.max(1,Math.ceil(data.data.total/12));
  useEffect(()=>{setPage(1);},[query,status]);useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
  async function act(path: string, body?: unknown) {
    if(lock.current)return;lock.current=true;setBusy(true);setNotice('');
    setError('');
    try {
      await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      await data.reload();setNotice(t('تم تنفيذ الإجراء','Action completed'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <div className="form-actions">
        <h2>{t('معالجة المعرفة والميزانية', 'Knowledge processing and budget')}</h2>
        <button className="btn" disabled={busy||data.loading} onClick={() => data.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      <p className="notice">
        {t(
          'المعالجة محفوظة وتُستأنف من آخر دفعة. الاستدعاءات المدفوعة معطّلة افتراضيًا. الميزانية تحفظ تقديرًا محافظًا: وحدة لكل بايت UTF-8؛ ليست فاتورة المزود.',
          'Processing is durable and resumes from the last batch. Paid calls are disabled by default. Budget uses a conservative unit per UTF-8 byte; it is not a provider invoice.',
        )}
      </p>
      <p>
        {t('محتسب', 'Charged')}: {data.loading||data.error?'—':data.data.usage.charged} · {t('محجوز', 'Reserved')}:{' '}
        {data.loading||data.error?'—':data.data.usage.reserved} / {data.loading||data.error?'—':data.data.limit}
      </p>
      {(error || data.error) && (
        <p role="alert" className="notice error">
          {error || data.error} {data.error&&<button className="btn" onClick={()=>void data.reload()}>{t('إعادة المحاولة','Retry')}</button>}
        </p>
      )}
      {notice&&<p role="status" className="notice">{notice}</p>}
      <div className="form-actions"><input type="search" aria-label={t('بحث مهام المعرفة','Search knowledge jobs')} maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={t('حالة المهمة','Job status')} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">{t('كل الحالات','All statuses')}</option>{['pending','running','blocked','failed','completed','canceled'].map(v=><option key={v}>{v}</option>)}</select><button className="btn" onClick={()=>{setQuery('');setStatus('all');}}>{t('مسح فلاتر المهام','Clear job filters')}</button></div>
      {data.error?null:!ready ? (
        <p>{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : !jobs.length ? (
        <p>{t('لا توجد مهام مطابقة.', 'No matching jobs.')}</p>
      ) : (
        jobs.map((job) => (
          <article key={job.id} className="rounded border p-3 space-y-2">
            <strong>{job.title}</strong>
            <p>
              {job.status} · {job.processed}/{job.total} · {t('محاولات فاشلة', 'Failed attempts')}:{' '}
              {job.attempts}
            </p>
            {job.error && <p className="notice error">{job.error}</p>}
            <div className="form-actions">
              {['blocked', 'failed'].includes(job.status) && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void act('/ai/knowledge-jobs/' + job.id + '/resume')}
                >
                  {t('استئناف آمن', 'Resume safely')}
                </button>
              )}
              {!['completed', 'canceled'].includes(job.status) && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {if(window.confirm(t('إلغاء العمل المتبقي لهذه المهمة؟','Cancel remaining work for this job?')))void act('/ai/knowledge-jobs/' + job.id + '/cancel');}}
                >
                  {t('إلغاء المتبقي', 'Cancel remaining')}
                </button>
              )}
            </div>
          </article>
        ))
      )}
      {ready&&data.data.total>0&&<div className="form-actions"><span>{data.data.total} · {page}/{pages}</span><button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></div>}
      {!data.error&&!data.loading&&data.data.reservations.map((reservation) => (
        <details key={reservation.effect_key}>
          <DisclosureSummary>
            {reservation.status} · {reservation.amount} · {reservation.effect_key}
          </DisclosureSummary>
          <p>
            {t(
              'لا يُعاد إرسال طلب غامض. التسوية المحاسبية تتطلب دليلاً من المزود.',
              'Unknown requests are not replayed. Accounting reconciliation requires provider evidence.',
            )}
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (confirm(t('تأكيد التسوية بناءً على الدليل؟', 'Reconcile based on the evidence?')))
                void act('/ai/knowledge-jobs/reservations/reconcile', {
                  key: reservation.effect_key,
                  result: f.get('result'),
                  evidence: f.get('evidence'),
                });
            }}
          >
            <select name="result" aria-label={t("نتيجة التسوية","Reconciliation outcome")} disabled={busy}>
              <option value="charged">{t('نُفّذ ويُحتسب', 'Executed and charged')}</option>
              <option value="not_executed">
                {t('تأكد عدم التنفيذ', 'Confirmed not executed')}
              </option>
            </select>
            <textarea name="evidence" aria-label={t("دليل المزود","Provider evidence")} disabled={busy} required minLength={20} maxLength={1000} />
            <button className="btn" disabled={busy}>
              {t('تسوية دون إعادة إرسال', 'Reconcile without replay')}
            </button>
          </form>
        </details>
      ))}
    </section>
  );
}
