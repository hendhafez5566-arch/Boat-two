'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useData } from './useData';
import { useWorkspaceRealtime } from './SubscriptionUsageProvider';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './orders-attention.module.css';

type Order = { id: string; status: string; product_name: string; contact_name: string; created_at: string };
type Attention = { counts: { status: string; count: number }[]; items: Order[]; asOf: string };

const openStatuses = ['new','review','documents_required','processing','confirmed'];

export function OrdersAttention() {
  const { t } = useLocale();
  const workspace = useData<{ role: string } | null>('/workspace', null);
  const allowed = workspace.data?.role === 'owner' || workspace.data?.role === 'admin';
  const attention = useData<Attention | null>(allowed ? '/commerce/orders/attention' : null, null);
  useWorkspaceRealtime((event) => {
    if (event.type === 'orders_changed' && allowed) void attention.reload();
  });
  useEffect(() => {
    if (!allowed) return;
    const interval = setInterval(() => {
      if (!document.hidden) void attention.reload();
    }, 25000);
    const visible = () => { if (!document.hidden) void attention.reload(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('boat:orders-changed', visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('boat:orders-changed', visible);
    };
  }, [allowed, attention.reload]);
  const counts = useMemo(() => new Map(
    (attention.data?.counts ?? []).map(({ status, count }) => [status, Number(count)]),
  ), [attention.data?.counts]);
  const number = (status: string) => counts.get(status) ?? 0;
  const opened = openStatuses.reduce((n, status) => n + number(status), 0);
  const urgent = number('new') + number('documents_required') + number('review');
  const metrics = [
    { status: 'new', name: t('جديد', 'New'), count: number('new'), tone: 'urgent' },
    { status: 'documents_required', name: t('مطلوب مستندات', 'Documents needed'), count: number('documents_required'), tone: 'warning' },
    { status: 'review', name: t('قيد المراجعة', 'Under review'), count: number('review'), tone: 'warning' },
    { status: 'processing', name: t('قيد التنفيذ', 'In progress'), count: number('processing') + number('confirmed'), tone: 'active' },
  ];
  const labels: Record<string, string> = {
    new: t('جديد', 'New'),
    documents_required: t('مطلوب مستندات', 'Documents needed'),
    review: t('قيد المراجعة', 'Under review'),
    processing: t('قيد التنفيذ', 'In progress'),
    confirmed: t('مؤكد', 'Confirmed'),
  };
  if (workspace.loading || !workspace.data || !allowed) return null;
  const loading = attention.loading && !attention.data;
  return <section className={styles.panel} data-attention={urgent > 0} aria-labelledby="orders-attention-title">
    <header className={styles.head}>
      <div>
        <span className={styles.eyebrow}><NavIcon name="list" /> {t('الطلبات والحجوزات', 'Orders & bookings')}</span>
        <h2 id="orders-attention-title">
          {loading ? t('جارٍ تحميل الطلبات…', 'Loading orders…') :
            attention.error && !attention.data ? t('تعذر تحميل الطلبات', 'Orders unavailable') :
            opened ? t(`لديك ${opened} طلبات مفتوحة`, `${opened} open orders`) :
              t('لا توجد طلبات تحتاج متابعة', 'No orders waiting for action')}
        </h2>
        {urgent > 0 && <p className={styles.warning} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {t(`${urgent} طلبات تحتاج إجراء`, `${urgent} orders need attention`)}
        </p>}
      </div>
      <Link className={styles.mainLink} href="/dashboard/commerce?tab=orders">
        {t('متابعة الطلبات', 'Manage orders')} <NavIcon name="list" />
      </Link>
    </header>
    {attention.error && <p role="alert" className={styles.error}>
      {t('تعذر تحديث الطلبات؛ الأرقام المعروضة قديمة.', 'Could not refresh orders; displayed counts may be outdated.')}
      <button type="button" onClick={() => void attention.reload()}>{t('إعادة المحاولة', 'Retry')}</button>
    </p>}
    <div className={styles.metrics} aria-label={t('حالات الطلبات', 'Order statuses')}>
      {metrics.map((metric) => <Link key={metric.status}
        href={`/dashboard/commerce?tab=orders&status=${metric.status}`}
        className={styles.metric} data-tone={metric.tone} data-has-orders={metric.count > 0}>
        <small>{metric.name}</small>
        <strong aria-label={`${metric.name}: ${metric.count}`}>{loading ? '…' : metric.count.toLocaleString('en-US')}</strong>
      </Link>)}
    </div>
    {!!attention.data?.items.length && <div className={styles.recent}>
      <div className={styles.recentHead}>
        <strong>{t('طلبات تحتاج متابعة', 'Orders needing action')}</strong>
        <span>{t('الأهم أولًا', 'Highest priority first')}</span>
      </div>
      <div className={styles.orderList}>
        {attention.data.items.map((order) => <Link key={order.id}
          href={`/dashboard/commerce?tab=orders&status=${order.status}`}
          className={styles.order}>
          <div><strong dir="auto">{order.product_name || t('طلب', 'Order')}</strong>
            <span dir="auto">{order.contact_name}</span></div>
          <span className={styles.orderStatus} data-status={order.status}>{labels[order.status] ?? order.status}</span>
        </Link>)}
      </div>
    </div>}
    <p className={styles.finePrint}>
      {t('تتحدث العدادات تلقائيًا عند تغيير الطلب، مع مزامنة احتياطية. الطلبات المكتملة والملغاة ليست مفتوحة.',
         'Counts refresh when orders change, with backup synchronization. Completed and cancelled orders are not open.')}
    </p>
  </section>;
}
