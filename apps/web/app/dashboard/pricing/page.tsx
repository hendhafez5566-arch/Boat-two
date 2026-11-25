'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import styles from '../subscription/subscription.module.css';
import { useSubscriptionUsage } from '../../../components/business/SubscriptionUsageProvider';
import { api } from '../../../lib/api';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
import {
  billingMoney,
  BillingPlan,
  BillingWorkspace,
  BillingStatus,
} from '../../../lib/billing-display';
export default function Pricing() {
  const { t, language } = useLocale();
  const usage = useSubscriptionUsage()?.usage;
  const format = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB');
  const plans = useData<BillingPlan[]>('/plans', []),
    ws = useData<BillingWorkspace | null>('/workspace', null),
    status = useData<BillingStatus | null>('/billing/status', null);
  const currentPlan = usage?.plan.plan_code ?? ws.data?.plan.plan_code;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function pay(path: string, body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ url: string }>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw new Error('Invalid billing redirect');
      window.location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('الباقات والاشتراك', 'Plans and subscription')}</h1>
          <Link href="/dashboard/subscription">{t('اشتراكي واستهلاكي', 'Subscription & usage')}</Link>{' · '}<Link href="/dashboard/billing">{t('الفواتير وسجل الدفع', 'Invoices and payment history')}</Link>
        </div>
        <button
          className="btn"
          disabled={busy || ws.data?.role !== 'owner' || !status.data?.portalAvailable}
          onClick={() => void pay('/billing/portal')}
        >
          {t('إدارة الاشتراك والدفع', 'Manage subscription and payment')}
        </button>
      </div>
      {(error || plans.error || ws.error || status.error) && (
        <p role="alert" className="notice error">
          {error || plans.error || ws.error || status.error}
        </p>
      )}
      {plans.loading && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
      {!status.loading && status.data && !status.data.configured && (
        <p>
          {t('الاشتراك المدفوع غير متاح حاليًا.', 'Paid subscriptions are currently unavailable.')}
        </p>
      )}
      <div className={styles.plans}>
        {plans.data.map((p) => (
          <section className={styles.plan} data-current={currentPlan === p.code} key={p.code}>
            <div className={styles.cardHeader}>
              <h2>{p.name}</h2>
              {currentPlan === p.code && <span className={styles.badge}>{t('باقتك الحالية', 'Current plan')}</span>}
            </div>
            <div className={styles.price}>
              <bdi>{billingMoney(p.price_cents, p.currency)}</bdi>
              <small> / {p.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}</small>
            </div>
            <dl className={styles.planLimits}>
              {([
                ['messages_per_month', 'رسائل صادرة شهريًا', 'Monthly outbound messages'],
                ['contacts', 'إجمالي جهات الاتصال', 'Total contacts'],
                ['ai_credits', 'محاولات AI شهريًا', 'Monthly AI attempts'],
                ['channels', 'القنوات', 'Channels'],
                ['agents', 'الموظفون', 'Staff'],
                ['flows', 'التدفقات', 'Flows'],
              ] as const).map(([key, ar, en]) => <div key={key}>
                <dt>{t(ar, en)}</dt><dd>{p.limits[key] === -1 ? t('غير محدود', 'Unlimited') :
                  p.limits[key] == null ? '—' : format.format(p.limits[key])}</dd>
              </div>)}
            </dl>
            {currentPlan !== p.code && <button
              className="btn btn-primary"
              disabled={
                !status.data?.configured ||
                busy ||
                ws.data?.role !== 'owner' ||
                !p.price_cents ||
                !!(
                  status.data.subscription?.linked &&
                  ['active', 'trialing', 'past_due'].includes(status.data.subscription.status)
                )
              }
              onClick={() => void pay('/billing/checkout', { planCode: p.code })}
            >
              {t('اشتراك', 'Subscribe')}
            </button>}
          </section>
        ))}
      </div>
    </main>
  );
}
