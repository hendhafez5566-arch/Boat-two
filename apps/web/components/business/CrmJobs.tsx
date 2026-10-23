'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
import { download, exportCsv, parseCsv } from './csv';
type Job = {
  id: string;
  kind: string;
  status: string;
  processed: number;
  total: number;
  succeeded: number;
  snapshot_at?: string;
  errors: { row: number; error: string }[];
};
export function CrmJobs() {
  const { t } = useLocale();
  const jobs = useData<Job[]>('/crm/jobs', []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [asOf, setAsOf] = useState('');
  const history = useData<{ available_from: string; pending_changes: number } | null>(
    '/crm/jobs/history',
    null,
  );
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await jobs.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>{t('مهام استيراد وتصدير العملاء', 'Contact import and export jobs')}</h2>
      <p>
        {t(
          'استيراد حتى 10,000 صف على دفعات قابلة للاستعادة، وتصدير حتى 50,000 ملف. الصفوف المرفوضة لا توقف الصفوف الأخرى. يحتفظ الإلغاء بما اكتمل.',
          'Import up to 10,000 rows in recoverable batches and export up to 50,000 profiles. Rejected rows do not stop other rows. Canceling retains completed work.',
        )}
      </p>
      <p className="muted">
        {t(
          'تُثبّت قيم التصدير عند الطلب ولا تتغير بتعديل العملاء لاحقًا. التنزيل يعرض وقت اللقطة؛ لا يعيد بناء تاريخ سابق للطلب.',
          'Export values are frozen when requested and survive later profile edits. Downloads include the snapshot time; earlier history cannot be reconstructed.',
        )}
      </p>
      {(error || jobs.error) && (
        <p className="notice error" role="alert">
          {error || jobs.error}
        </p>
      )}
      <div className="stack">
        <label className="field">
          {t('تصدير تاريخ مسجّل (اختياري)', 'Recorded historical export (optional)')}
          <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <p className="muted">
          {t(
            'التاريخ يعكس التغييرات المؤكدة التي سجلها الدفتر بعد الالتزام، وليس وقت الالتزام الأصلي. لا يشمل تاريخًا قبل بدء الدفتر أو بعد حذف فترة الاحتفاظ.',
            'History reflects committed changes when observed by the journal, not their original database commit timestamp. Times before journal coverage or retained history are unavailable.',
          )}
        </p>
        {history.data && (
          <p>
            {t('متاح منذ: ', 'Available since: ')}
            {new Date(history.data.available_from).toLocaleString()} ·{' '}
            {t('تغييرات تنتظر التسجيل: ', 'Changes awaiting recording: ')}
            {history.data.pending_changes}
          </p>
        )}
      </div>
      <div className="form-actions">
        <label className="btn">
          {t('استيراد CSV أو JSON', 'Import CSV or JSON')}
          <input
            type="file"
            accept=".csv,.json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void run(async () => {
                  if (file.size > 900000)
                    throw new Error(
                      t(
                        'حد الملف 900KB؛ قسّم الملفات الأكبر.',
                        'File limit is 900KB; split larger files.',
                      ),
                    );
                  const text = await file.text();
                  const contacts = file.name.endsWith('.csv')
                    ? parseCsv(text).map((row) => ({
                        ...row,
                        tags: (row.tags || '').split(/[;|]/).filter(Boolean),
                      }))
                    : JSON.parse(text);
                  await api('/crm/jobs', {
                    method: 'POST',
                    body: JSON.stringify({ kind: 'import', contacts }),
                  });
                });
              event.target.value = '';
            }}
          />
        </label>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(() =>
              api('/crm/jobs', {
                method: 'POST',
                body: JSON.stringify({
                  kind: 'export',
                  ...(asOf ? { asOf: new Date(asOf).toISOString() } : {}),
                }),
              }),
            )
          }
        >
          {t('إنشاء لقطة تصدير ثابتة', 'Create snapshot export')}
        </button>
        <button className="btn" onClick={() => jobs.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      {jobs.loading && <p>{t('جارٍ التحميل…', 'Loading…')}</p>}
      {!jobs.loading && !jobs.data.length && <p>{t('لا توجد مهام بعد.', 'No jobs yet.')}</p>}
      {jobs.data.map((job) => (
        <article key={job.id} className="rounded-xl border p-3">
          <strong>
            {job.kind} · {job.status}
          </strong>
          <p>
            {job.processed}/{job.total} · {t('ناجح', 'Succeeded')}: {job.succeeded}
          </p>
          {job.snapshot_at && (
            <p>
              {t('وقت اللقطة: ', 'Snapshot time: ')}
              {new Date(job.snapshot_at).toLocaleString()}
            </p>
          )}
          {['pending', 'running'].includes(job.status) && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(() => api('/crm/jobs/' + job.id + '/cancel', { method: 'PATCH' }))
              }
            >
              {t('إلغاء المتبقي', 'Cancel remaining')}
            </button>
          )}
          {job.status === 'completed' && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{
                    result: Record<string, unknown>[];
                    errors: unknown[];
                  }>('/crm/jobs/' + job.id + '/result');
                  download(
                    'crm-' + job.id + '.json',
                    JSON.stringify(result, null, 2),
                    'application/json',
                  );
                  if (job.kind === 'export')
                    download(
                      'contacts.csv',
                      exportCsv(result.result, [
                        'id',
                        'name',
                        'email',
                        'phone',
                        'lifecycle',
                        'tags',
                        'archived_at',
                      ]),
                      'text/csv',
                    );
                })
              }
            >
              {t('تنزيل النتائج', 'Download results')}
            </button>
          )}
          {job.errors.length > 0 && (
            <details>
              <summary>{t('أخطاء الصفوف (أول 100)', 'Row errors (first 100)')}</summary>
              {job.errors.map((e) => (
                <p key={e.row}>
                  {e.row}: {e.error}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
