'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
export function BillingReconciliation() {
  const { t } = useLocale();
  const workspace = useData<{ role: string }>('/workspace', { role: '' });
  const jobs = useData<
    {
      id: string;
      status: string;
      error: string | null;
      created_at: string;
      source: string;
      invoice_pages: number;
      backfill_complete: boolean;
    }[]
  >(workspace.data.role === 'owner' ? '/billing/reconciliations' : null, []);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (workspace.data.role !== 'owner') return null;
  return (
    <section className="card stack">
      <h2>{t('مزامنة حالة الاشتراك من Stripe', 'Reconcile subscription state from Stripe')}</h2>
      <p className="notice">
        {t(
          'طلب محفوظ في محرك الأحداث. يبقى محظورًا حتى إعداد Stripe وتفعيل الاتصال الخارجي صراحةً. لا ينشئ هذا الإجراء دفعة أو اشتراكًا جديدًا.',
          'A durable event-backed request. It stays blocked until Stripe is configured and external access is explicitly enabled. This action does not create a payment or a new subscription.',
        )}
      </p>
      {(error || jobs.error) && <p className="notice error">{error || jobs.error}</p>}
      <div className="form-actions">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api('/billing/reconciliations', { method: 'POST' });
              await jobs.reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('طلب مزامنة', 'Request reconciliation')}
        </button>
        <button className="btn" onClick={() => jobs.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      {jobs.data.map((job) => (
        <article key={job.id} className="border rounded p-3">
          <strong>{job.status}</strong>
          <p>
            {job.source === 'periodic'
              ? t('دورية', 'Periodic')
              : t('بطلب المالك', 'Owner requested')}{' '}
            · {t('صفحات الفواتير', 'Invoice pages')}: {job.invoice_pages} ·{' '}
            {job.backfill_complete
              ? t('اكتمل الاسترجاع', 'Backfill complete')
              : t('الاسترجاع غير مكتمل', 'Backfill incomplete')}
          </p>
          <p>{job.error}</p>
          <small>{new Date(job.created_at).toLocaleString()}</small>
        </article>
      ))}
    </section>
  );
}
