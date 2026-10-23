'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
type Invoice = {
  provider_id: string;
  number: string | null;
  status: string;
  currency: string;
  amount_due: string;
  amount_paid: string;
  amount_remaining: string;
  attempted_count: number;
  payment_failed: boolean;
  hosted_url: string | null;
  pdf_url: string | null;
  due_at: string | null;
  provider_created: number;
};
export function BillingInvoices() {
  const { t } = useLocale();
  const [data, setData] = useState<{ items: Invoice[]; total: number; page: number } | null>(null),
    [status, setStatus] = useState('all'),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    api<{ items: Invoice[]; total: number; page: number }>(
      '/billing/invoices?' + new URLSearchParams({ status, page: String(page) }),
    )
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [status, page]);
  const labels: Record<string, string> = {
    all: t('الكل', 'All'),
    draft: t('مسودة', 'Draft'),
    open: t('مستحقة', 'Open'),
    paid: t('مدفوعة', 'Paid'),
    void: t('ملغاة', 'Void'),
    uncollectible: t('متعذرة التحصيل', 'Uncollectible'),
    deleted: t('محذوفة لدى المزود', 'Deleted at provider'),
    failed: t('فشل الدفع', 'Payment failed'),
  };
  function money(value: string, currency: string) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(
      Number(value) /
        ([
          'bif',
          'clp',
          'djf',
          'gnf',
          'jpy',
          'kmf',
          'krw',
          'mga',
          'pyg',
          'rwf',
          'ugx',
          'vnd',
          'vuv',
          'xaf',
          'xof',
          'xpf',
        ].includes(currency)
          ? 1
          : ['bhd', 'jod', 'kwd', 'omr', 'tnd'].includes(currency)
            ? 1000
            : 100),
    );
  }
  return (
    <section className="card stack">
      <h2>{t('الفواتير وحالات الدفع', 'Invoices and payment status')}</h2>
      <p className="muted">
        {t(
          'بيانات أحداث Stripe الموثّقة؛ إدارة الدفع والإلغاء تتم عبر بوابة الفوترة عند تفعيلها.',
          'Verified Stripe event data; payment and cancellation management use the billing portal when enabled.',
        )}
      </p>
      <label className="field">
        {t('الحالة', 'Status')}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy && <p role="status">{t('جارٍ تحميل الفواتير…', 'Loading invoices…')}</p>}
      {!busy && !error && !data?.items.length && (
        <p>
          {t(
            'لا توجد فواتير بهذه الحالة. لن تظهر بيانات تجريبية.',
            'No invoices match this status.',
          )}
        </p>
      )}
      <div className="table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              {[
                t('الفاتورة', 'Invoice'),
                t('الحالة', 'Status'),
                t('المستحق / المدفوع / المتبقي', 'Due / paid / remaining'),
                t('محاولات الدفع', 'Attempts'),
                t('الاستحقاق', 'Due date'),
                t('المستندات', 'Documents'),
              ].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!busy &&
              data?.items.map((row) => (
                <tr key={row.provider_id}>
                  <td>{row.number || row.provider_id}</td>
                  <td>
                    {labels[row.status]}
                    {row.payment_failed && row.status === 'open' && (
                      <p role="status">{labels.failed}</p>
                    )}
                  </td>
                  <td>
                    {money(row.amount_due, row.currency)} / {money(row.amount_paid, row.currency)} /{' '}
                    {money(row.amount_remaining, row.currency)}
                  </td>
                  <td>{row.attempted_count}</td>
                  <td>{row.due_at ? new Date(row.due_at).toLocaleDateString() : '—'}</td>
                  <td>
                    {row.hosted_url && (
                      <a
                        className="btn"
                        href={row.hosted_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('عرض لدى Stripe', 'View at Stripe')}
                      </a>
                    )}
                    {row.pdf_url && (
                      <a
                        className="btn"
                        href={row.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button className="btn" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>
          {t('السابق', 'Previous')}
        </button>
        <span>
          {page} · {data?.total ?? 0}
        </span>
        <button
          className="btn"
          disabled={busy || !data || page * 50 >= data.total}
          onClick={() => setPage(page + 1)}
        >
          {t('التالي', 'Next')}
        </button>
      </div>
    </section>
  );
}
