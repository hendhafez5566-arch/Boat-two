'use client';
import { statusLabel } from '../product/status';
import { CrmRetention } from './CrmRetention';
import { useEffect, useState } from 'react';
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
  uploaded?: number;
  snapshot_at?: string;
  expired_at?: string | null;
  errors: { row: number; error: string }[];
};
export function CrmJobs() {
  const { t } = useLocale();
  const jobs = useData<Job[]>('/crm/jobs', []);
  useEffect(() => {
    const reload = () => {
      void jobs.reload();
    };
    window.addEventListener('boat:crm-jobs', reload);
    return () => window.removeEventListener('boat:crm-jobs', reload);
  }, [jobs.reload]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
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
    <section id="crm-jobs" className="card stack">
      <h2>{t('مهام استيراد وتصدير العملاء', 'Contact import and export jobs')}</h2>
      <p>
        {t(
          'اختر ملفًا واحدًا حتى 10,000 عميل. الملفات الصغيرة تُستورد مباشرة والكبيرة تُعالج على دفعات مع تقدم قابل للمتابعة.',
          'Choose one file with up to 10,000 contacts. Small files import directly; large files use recoverable batches with progress.',
        )}
      </p>
      <p className="muted">
        {t(
          'تُثبّت قيم التصدير عند الطلب ولا تتغير بتعديل العملاء لاحقًا. يدعم الوقت التاريخي الاختياري السجل المحفوظ ضمن فترة التغطية أدناه.',
          'Export values are frozen when requested and survive later profile edits. An optional historical time uses retained history within the coverage shown below.',
        )}
      </p>
      {(error || jobs.error) && (
        <p className="notice error" role="alert">
          {error || jobs.error}
        </p>
      )}
      <details className="stack"><summary>{t('تصدير بتاريخ سابق وتفاصيل الاحتفاظ','Historical export and retention details')}</summary>
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
      </details>
      <p className="muted">
        {t(
          'يُرفع الملف على دفعات محفوظة قبل بدء الاستيراد. عند انقطاع الرفع، اختر الملف نفسه لاستكماله دون تكرار الصفوف. تعالج المهام البيانات ضمن حدود الخطة.',
          'Files upload in durable chunks before import starts. After interruption, select the same file to resume without repeating rows. Jobs process contacts within plan limits.',
        )}
      </p>
      {uploadProgress && (
        <div
          role="progressbar"
          aria-label={t('تقدم رفع العملاء', 'Contact upload progress')}
          aria-valuemin={0}
          aria-valuemax={uploadProgress.total}
          aria-valuenow={uploadProgress.done}
        >
          {uploadProgress.done}/{uploadProgress.total} {t('صف مرفوع', 'rows uploaded')}
        </div>
      )}
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
                  if (file.size > 10000000)
                    throw new Error(
                      t('حد الملف 10MB و10,000 صف.', 'File limit is 10MB and 10,000 rows.'),
                    );
                  const text = await file.text();
                  const contacts = file.name.toLowerCase().endsWith('.csv')
                    ? parseCsv(text).map((row) => ({
                        ...row,
                        tags: (row.tags || '').split(/[;|]/).filter(Boolean),
                      }))
                    : JSON.parse(text);
                  if (!Array.isArray(contacts) || contacts.length < 1 || contacts.length > 10000)
                    throw new Error(
                      t(
                        'اختر ملفًا يحتوي من 1 إلى 10,000 عميل.',
                        'Choose a file with 1 to 10,000 contacts.',
                      ),
                    );
                  if (contacts.length <= 500) {
                    const result = await api<{imported:number}>('/crm/contacts/import', {method:'POST',body:JSON.stringify({contacts:contacts.map((r:any)=>({...r,email:r.email || null,phone:r.phone || null,tags:Array.isArray(r.tags)?r.tags:String(r.tags || '').split(/[;|]/).filter(Boolean)}))})});
                    setUploadProgress({done:result.imported,total:contacts.length});
                    window.dispatchEvent(new Event('boat:crm-imported'));
                    return;
                  }
                  const fingerprint = Array.from(
                    new Uint8Array(
                      await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
                    ),
                  )
                    .map((byte) => byte.toString(16).padStart(2, '0'))
                    .join('');
                  const session = await api<{ id: string; uploaded: number; total: number }>(
                    '/crm/jobs/uploads',
                    {
                      method: 'POST',
                      body: JSON.stringify({ total: contacts.length, fingerprint }),
                    },
                  );
                  let offset = session.uploaded;
                  setUploadProgress({ done: offset, total: contacts.length });
                  while (offset < contacts.length) {
                    let rows = contacts.slice(offset, offset + 100);
                    while (
                      new TextEncoder().encode(JSON.stringify({ after: offset, rows })).byteLength >
                      900000
                    ) {
                      if (rows.length === 1)
                        throw new Error(
                          t(
                            'صف واحد يتجاوز حد الطلب؛ قلل بياناته.',
                            'One row exceeds the request limit; reduce its data.',
                          ),
                        );
                      rows = rows.slice(0, Math.ceil(rows.length / 2));
                    }
                    const page = await api<{ uploaded: number }>(`/crm/jobs/${session.id}/upload`, {
                      method: 'POST',
                      body: JSON.stringify({ after: offset, rows }),
                    });
                    if (page.uploaded <= offset || page.uploaded > contacts.length)
                      throw new Error(
                        t(
                          'تعذّر تقدم الرفع. اختر الملف نفسه للاستكمال.',
                          'Upload did not advance. Select the same file to resume.',
                        ),
                      );
                    offset = page.uploaded;
                    setUploadProgress({ done: offset, total: contacts.length });
                  }
                  await api(`/crm/jobs/${session.id}/complete-upload`, { method: 'POST' });
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
      <CrmRetention />
      {jobs.data.map((job) => (
        <article key={job.id} className="rounded-xl border p-3">
          <strong>
            {job.kind === 'activity_export'
              ? t('سجل العميل', 'Customer activity')
              : job.kind === 'export'
                ? t('تصدير العملاء', 'Contact export')
                : t('استيراد العملاء', 'Contact import')}{' '}
            · {statusLabel(job.status, t)}
          </strong>
          <p>
            {job.status === 'uploading' ? (job.uploaded ?? 0) : job.processed}/{job.total} ·{' '}
            {t('ناجح', 'Succeeded')}: {job.succeeded}
          </p>
          {job.expired_at && (
            <p className="muted">
              {t(
                'انتهت صلاحية الملف وفق الاحتفاظ؛ بيانات المهمة محفوظة.',
                'Payload expired under retention; job metadata is retained.',
              )}
            </p>
          )}
          {job.snapshot_at && (
            <p>
              {t('وقت اللقطة: ', 'Snapshot time: ')}
              {new Date(job.snapshot_at).toLocaleString()}
            </p>
          )}
          {['uploading', 'pending', 'running'].includes(job.status) && (
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
          {job.status === 'completed' && !job.expired_at && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  type Page = {
                    result: Record<string, unknown>[];
                    errors: unknown[];
                    snapshot_at?: string;
                    total: number;
                    nextAfter: number | null;
                  };
                  let after = 0,
                    meta: Page | undefined;
                  const rows: Record<string, unknown>[] = [];
                  for (let page = 0; page < 201; page++) {
                    const part = await api<Page>(
                      '/crm/jobs/' + job.id + '/result?limit=250&after=' + after,
                    );
                    meta = part;
                    rows.push(...part.result);
                    if (part.nextAfter === null) break;
                    if (part.nextAfter <= after)
                      throw new Error(
                        t(
                          'تعذّر تقدم تنزيل الملف؛ أعد المحاولة.',
                          'Download cursor did not advance; retry.',
                        ),
                      );
                    after = part.nextAfter;
                  }
                  const result = { ...meta, result: rows };
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
