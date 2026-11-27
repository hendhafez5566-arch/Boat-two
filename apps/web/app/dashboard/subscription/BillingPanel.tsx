'use client';
import { useEffect, useRef, useState } from 'react';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import {
  billingDate,
  billingDocument,
  billingMoney,
  BillingStatus,
} from '../../../lib/billing-display';
import styles from './billing.module.css';
import shared from './subscription.module.css';
import { api } from '../../../lib/api';
type Invoice = {
  provider_id: string;
  number: string | null;
  currency: string;
  amount_paid: string;
  amount_due: string;
  status: string;
  payment_failed: boolean;
  provider_created: string | number;
  paid_at: string | null;
  pdf_url: string | null;
  hosted_url: string | null;
};
function invoiceStatus(row: Invoice, t: (ar: string, en: string) => string) {
  if (row.status === 'open' && row.payment_failed) return t('فشل الدفع', 'Payment failed');
  switch (row.status) {
    case 'paid':
      return t('مدفوعة', 'Paid');
    case 'open':
      return t('بانتظار الدفع', 'Awaiting payment');
    case 'draft':
      return t('مسودة', 'Draft');
    case 'void':
      return t('ملغاة', 'Void');
    case 'uncollectible':
      return t('متعذّر تحصيلها', 'Uncollectible');
    case 'deleted':
      return t('محذوفة لدى المزود', 'Deleted by provider');
    default:
      return '—';
  }
}

export default function BillingPanel({
  status,
  role,
  loading,
  requestError,
}: {
  status: BillingStatus | null;
  role?: string;
  loading: boolean;
  requestError: string;
}) {
  const { t, language } = useLocale();
  const me = useData<{ user: { account_profile?: { timezone?: string } } } | null>(
    '/auth/me',
    null,
  );
  const [search, setSearch] = useState(''),
    [draftSearch, setDraftSearch] = useState('');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [datesOpen, setDatesOpen] = useState(false),
    [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1),
    [limit, setLimit] = useState(25);
  const allowed = ['owner', 'admin'].includes(role || '');
  const query = new URLSearchParams({
    status: 'all',
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
  const [portalError, setPortalError] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);
  const error = requestError || log.error || portalError;
  const portalLock=useRef(false);
  async function openPortal() {
    if(portalLock.current||role!=='owner'||!status?.portalAvailable)return;
    portalLock.current=true;
    setPortalBusy(true);
    setPortalError('');
    try {
      const result = await api<{ url: string }>('/billing/portal', { method: 'POST' });
      const url = billingDocument(result.url);
      if (!url) throw new Error(t('رابط بوابة الدفع غير صالح.', 'Invalid billing portal URL.'));
      window.location.assign(url);
    } catch (reason) {
      setPortalError((reason as Error).message);
      portalLock.current=false;
      setPortalBusy(false);
    }
  }
  return (
    <section className={shared.content}>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {status?.configured === false && (
        <p
          className="notice"
          role="status"
          aria-label={t('حالة الدفع الإلكتروني', 'Online payment availability')}
        >
          {t('الدفع الإلكتروني غير متاح حاليًا.', 'Online payments are currently unavailable.')}
        </p>
      )}
      {status?.portalAvailable && role === 'owner' && (
        <button className="btn" disabled={portalBusy} onClick={() => void openPortal()}>
          <NavIcon name="billing"/>{portalBusy?t('جارٍ فتح البوابة…','Opening portal…'):t('إدارة وسيلة الدفع والتجديد', 'Manage payment method and renewal')}
        </button>
      )}
      <section className={shared.panel} aria-busy={log.loading || loading}>
        <header className={shared.sectionHeader}><h2><NavIcon name="billing"/>{t('سجل المدفوعات', 'Payment history')}</h2><button className="btn" type="button" disabled={!allowed||log.loading} onClick={()=>void log.reload()}><NavIcon name="refresh"/>{t('تحديث','Refresh')}</button></header>
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
            /><button className="btn" type="submit" disabled={log.loading||!allowed}>{t('بحث','Search')}</button>{(draftSearch||search)&&<button className="btn" type="button" aria-label={t('مسح البحث','Clear search')} onClick={()=>{setDraftSearch('');setSearch('');setPage(1)}}><NavIcon name="close"/></button>}
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
                  t('رقم الفاتورة', 'Invoice number'),
                  t('المبلغ', 'Amount'),
                  t('الحالة', 'Status'),
                  t('التاريخ', 'Date'),
                  t('المستند', 'Document'),
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => {
                const document = billingDocument(row.pdf_url) || billingDocument(row.hosted_url);
                return (
                  <tr key={row.provider_id}>
                    <td title={row.provider_id}>{row.number || row.provider_id}</td>
                    <td>
                      {billingMoney(
                        row.status === 'paid' ? row.amount_paid : row.amount_due,
                        row.currency,
                      )}
                    </td>
                    <td>
                      <span className={shared.badge} data-status={row.payment_failed&&row.status==='open'?'failed':row.status}>{invoiceStatus(row, t)}</span>
                    </td>
                    <td>
                      {billingDate(
                        row.paid_at || new Date(Number(row.provider_created) * 1000).toISOString(),
                        language,
                        me.data?.user.account_profile?.timezone || 'UTC',
                      )}
                    </td>
                    <td>
                      {document ? (
                        <a href={document} target="_blank" rel="noopener noreferrer">
                          <NavIcon name="eye"/>{t('عرض', 'View')}
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
                  <td colSpan={5} className={styles.empty}>
                    {!allowed && !loading
                      ? t('هذه الصفحة تحتاج صلاحيات إدارية', 'Management access required')
                      : log.loading || loading
                        ? t('جارٍ التحميل…', 'Loading…')
                        : error
                          ? '—'
                          : t('لا توجد فواتير مطابقة','No matching invoices')}
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
      <Dialog className={shared.reviewDialog}
        open={datesOpen}
        title={t('تصفية التاريخ', 'Date Filter')}
        onClose={() => setDatesOpen(false)}
      >
        <form
          key={`${datesOpen}:${from}:${to}`}
          className={styles.dateForm}
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
          <div className={styles.dateActions}><button className="btn" type="button" onClick={()=>setDatesOpen(false)}>{t('إلغاء','Cancel')}</button><button className="btn btn-primary"><NavIcon name="check"/>{t('تطبيق', 'Apply')}</button></div>
        </form>
      </Dialog>
    </section>
  );
}
