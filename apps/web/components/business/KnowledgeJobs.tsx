'use client';
import { useState } from 'react';
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
  const data = useData<{
    jobs: Job[];
    usage: { charged: number; reserved: number };
    limit: number;
    reservations: { effect_key: string; amount: number; status: string }[];
  }>('/ai/knowledge-jobs', {
    jobs: [],
    usage: { charged: 0, reserved: 0 },
    limit: 0,
    reservations: [],
  });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      await data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <div className="form-actions">
        <h2>{t('معالجة المعرفة والميزانية', 'Knowledge processing and budget')}</h2>
        <button className="btn" onClick={() => data.reload()}>
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
        {t('محتسب', 'Charged')}: {data.data.usage.charged} · {t('محجوز', 'Reserved')}:{' '}
        {data.data.usage.reserved} / {data.data.limit}
      </p>
      {(error || data.error) && (
        <p role="alert" className="notice error">
          {error || data.error}
        </p>
      )}
      {data.loading ? (
        <p>{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : !data.data.jobs.length ? (
        <p>{t('أضف مصدرًا لإنشاء أول مهمة.', 'Add a source to create the first job.')}</p>
      ) : (
        data.data.jobs.map((job) => (
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
                  onClick={() => void act('/ai/knowledge-jobs/' + job.id + '/cancel')}
                >
                  {t('إلغاء المتبقي', 'Cancel remaining')}
                </button>
              )}
            </div>
          </article>
        ))
      )}
      {data.data.reservations.map((reservation) => (
        <details key={reservation.effect_key}>
          <summary>
            {reservation.status} · {reservation.amount} · {reservation.effect_key}
          </summary>
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
            <select name="result">
              <option value="charged">{t('نُفّذ ويُحتسب', 'Executed and charged')}</option>
              <option value="not_executed">
                {t('تأكد عدم التنفيذ', 'Confirmed not executed')}
              </option>
            </select>
            <textarea name="evidence" required minLength={20} maxLength={1000} />
            <button className="btn" disabled={busy}>
              {t('تسوية دون إعادة إرسال', 'Reconcile without replay')}
            </button>
          </form>
        </details>
      ))}
    </section>
  );
}
