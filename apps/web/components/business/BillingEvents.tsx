'use client';
import { useData } from './useData';
import { useLocale } from '../product/locale';
export function BillingEvents() {
  const { t } = useLocale();
  const events = useData<
    { id: string; type: string; status: string; reason: string | null; created_at: string }[]
  >('/billing/events', []);
  return (
    <section className="card table-wrap">
      <div className="form-actions">
        <h2>{t('سجل أحداث الدفع', 'Payment event history')}</h2>
        <button className="btn" onClick={() => events.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      {events.error && <p className="notice error">{events.error}</p>}
      {events.loading ? (
        <p>{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : !events.data.length ? (
        <p className="empty">
          {t(
            'لم تصل أحداث دفع. تفعيل Stripe يتطلب إعداد المالك.',
            'No payment events received. Stripe activation requires owner configuration.',
          )}
        </p>
      ) : (
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('النوع', 'Type')}</th>
              <th>{t('الحالة', 'Status')}</th>
              <th>{t('السبب', 'Reason')}</th>
              <th>{t('التاريخ', 'Date')}</th>
            </tr>
          </thead>
          <tbody>
            {events.data.map((event) => (
              <tr key={event.id}>
                <td>{event.type}</td>
                <td>{event.status}</td>
                <td>{event.reason || '—'}</td>
                <td>{new Date(event.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
