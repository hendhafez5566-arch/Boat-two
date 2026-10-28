'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import {
  billingDocument,
  billingMoney,
  BillingPlan,
  BillingStatus,
  BillingWorkspace,
} from '../../../lib/billing-display';
import styles from './billing.module.css';
type Invoice = {
  provider_id: string;
  number: string | null;
  currency: string;
  amount_paid: string;
  paid_at: string | null;
  pdf_url: string | null;
  hosted_url: string | null;
};
export default function Billing() {
  const { t } = useLocale();
  const ws = useData<BillingWorkspace | null>('/workspace', null);
  const plans = useData<BillingPlan[]>('/plans', []);
  const status = useData<BillingStatus | null>('/billing/status', null);
  const [search, setSearch] = useState(''),
    [draftSearch, setDraftSearch] = useState('');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [datesOpen, setDatesOpen] = useState(false),
    [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1),
    [limit, setLimit] = useState(25);
  const allowed = ['owner', 'admin'].includes(ws.data?.role || '');
  const query = new URLSearchParams({
    status: 'paid',
    page: String(page),
    limit: String(limit),
    search,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const log = useData<{
    items: Invoice[];
    total: number;
    page: number;
    limit: number;
    filters: { search: string; from: string; to: string };
  } | null>(allowed ? '/billing/invoices?' + query : null, null);
  const data =
    !log.loading &&
    !log.error &&
    log.data?.page === page &&
    log.data.limit === limit &&
    log.data.filters.search === search &&
    log.data.filters.from === from &&
    log.data.filters.to === to
      ? log.data
      : null;
  useEffect(() => {
    if (data && page > Math.max(1, Math.ceil(data.total / limit)))
      setPage(Math.max(1, Math.ceil(data.total / limit)));
  }, [data, page, limit]);
  const plan = plans.data.find((p) => p.code === ws.data?.plan.plan_code);
  const expiry =
    status.data?.subscription?.currentPeriodEnd ||
    (ws.data?.plan.status === 'trialing' ? ws.data.plan.trial_ends_at : null);
  const free = plan?.price_cents === 0;
  const error = ws.error || plans.error || status.error || log.error;
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <h1>{t('الفوترة', 'Billing')}</h1>
        <p>{t('الخطة والإضافات وسجل الدفع', 'Plan, addons, and payment history')}</p>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <section
        className={styles.summary}
        aria-label={t('ملخص الاشتراك', 'Account package statistics')}
      >
        <div>
          <span className={`${styles.icon} ${styles.package}`}>
            <NavIcon name="upgrade" />
          </span>
          <div>
            <small>{t('الباقة', 'Package')}</small>
            <strong>{ws.data?.plan.plan_name || '—'}</strong>
            <Link className={styles.upgrade} href="/dashboard/pricing">
              {t('الترقية إلى Pro', 'Upgrade to Pro')}
            </Link>
          </div>
        </div>
        <div>
          <span className={`${styles.icon} ${styles.price}`}>
            <NavIcon name="coins" />
          </span>
          <div>
            <small>{t('السعر والصلاحية', 'Price & Validity')}</small>
            <strong>
              {plan
                ? free
                  ? t('مجاني (مدة غير محدودة)', 'Free (Unlimited)')
                  : `${billingMoney(plan.price_cents, plan.currency)} (${plan.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')})`
                : '—'}
            </strong>
          </div>
        </div>
        <div>
          <span className={`${styles.icon} ${styles.expiry}`}>
            <NavIcon name="calendar" />
          </span>
          <div>
            <small>{t('انتهاء الحساب', 'Account Expiry')}</small>
            <strong>
              {expiry
                ? new Date(expiry).toLocaleDateString()
                : free
                  ? t('بدون انتهاء', 'Never')
                  : '—'}
            </strong>
          </div>
        </div>
      </section>
      <section className={styles.log} aria-busy={log.loading}>
        <h2>{t('سجل المعاملات', 'Transaction Log')}</h2>
        <p className={styles.subtitle}>{t('المعاملات الأخيرة', 'Recent Transactions')}</p>
        <div className={styles.tools}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(draftSearch.trim());
              setPage(1);
            }}
          >
            <NavIcon name="search" />
            <input
              type="search"
              value={draftSearch}
              maxLength={200}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder={t('ابحث واضغط Enter…', 'Search & Enter…')}
              aria-label={t('البحث في المعاملات', 'Search transactions')}
            />
          </form>
          <button
            type="button"
            className={styles.dateButton}
            onClick={() => {
              setDateError('');
              setDatesOpen(true);
            }}
          >
            <NavIcon name="calendar" />
            {t('تصفية التاريخ', 'Date Filter')}
          </button>
        </div>
        {(from || to) && (
          <div className={styles.range}>
            <span>
              {from || '…'} — {to || '…'}
            </span>
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              {t('مسح', 'Clear')}
            </button>
          </div>
        )}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {[
                  '#',
                  t('المعرف', 'ID'),
                  t('البريد', 'Email'),
                  t('الطريقة', 'Method'),
                  t('المبلغ', 'Amount'),
                  t('المنتج', 'Product'),
                  t('النوع', 'Type'),
                  t('دورة الفوترة', 'Billing Cycle'),
                  t('تاريخ الدفع', 'Paid At'),
                  t('الفاتورة', 'Invoice'),
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row, i) => {
                const document = billingDocument(row.pdf_url) || billingDocument(row.hosted_url);
                return (
                  <tr key={row.provider_id}>
                    <td>{(page - 1) * limit + i + 1}</td>
                    <td title={row.provider_id}>{row.number || row.provider_id}</td>
                    <td>—</td>
                    <td>Stripe</td>
                    <td>{billingMoney(row.amount_paid, row.currency)}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{row.paid_at ? new Date(row.paid_at).toLocaleString() : '—'}</td>
                    <td>
                      {document ? (
                        <a href={document} target="_blank" rel="noopener noreferrer">
                          {t('عرض', 'View')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!data || !data.items.length) && (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    {!allowed && !ws.loading
                      ? t('هذه الصفحة تحتاج صلاحيات إدارية', 'Management access required')
                      : log.loading || ws.loading
                        ? t('جارٍ التحميل…', 'Loading…')
                        : error
                          ? '—'
                          : t('لا توجد بيانات في الجدول', 'No data available in table')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.footer}>
          <select
            value={limit}
            aria-label={t('عدد الصفوف', 'Rows per page')}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            {[5, 10, 25, 50, 100, 200, 500].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <span>
            {data
              ? `${data.total ? (page - 1) * limit + 1 : 0}–${Math.min(page * limit, data.total)} ${t('من', 'of')} ${data.total}`
              : '—'}
          </span>
          <div>
            <button
              type="button"
              disabled={log.loading || page === 1}
              onClick={() => setPage(page - 1)}
            >
              {t('السابق', 'Previous')}
            </button>
            <button
              type="button"
              disabled={log.loading || !data || page * limit >= data.total}
              onClick={() => setPage(page + 1)}
            >
              {t('التالي', 'Next')}
            </button>
          </div>
        </footer>
      </section>
      <Dialog
        open={datesOpen}
        title={t('تصفية التاريخ', 'Date Filter')}
        onClose={() => setDatesOpen(false)}
      >
        <form
          key={`${datesOpen}:${from}:${to}`}
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget),
              a = String(values.get('from') || ''),
              b = String(values.get('to') || '');
            if (a && b && a > b) {
              setDateError(t('تاريخ البداية يجب أن يسبق النهاية', 'Start must precede end'));
              return;
            }
            setFrom(a);
            setTo(b);
            setPage(1);
            setDatesOpen(false);
          }}
        >
          {dateError && <p role="alert">{dateError}</p>}
          <label className="field">
            {t('من', 'From')}
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label className="field">
            {t('إلى', 'To')}
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn btn-primary">{t('تطبيق', 'Apply')}</button>
        </form>
      </Dialog>
    </main>
  );
}
