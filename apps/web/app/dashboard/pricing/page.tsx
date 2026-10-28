'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
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
  const { t } = useLocale();
  const plans = useData<BillingPlan[]>('/plans', []),
    ws = useData<BillingWorkspace | null>('/workspace', null),
    status = useData<BillingStatus | null>('/billing/status', null);
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
          <h1>{t('الترقية إلى Pro', 'Upgrade to Pro')}</h1>
          <Link href="/dashboard/billing">{t('الفوترة', 'Billing')}</Link>
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
      <div className="card-grid">
        {plans.data.map((p) => (
          <section className="card stack" key={p.code}>
            <h2>{p.name}</h2>
            <strong className="metric">
              {billingMoney(p.price_cents, p.currency)}
              <small> / {p.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}</small>
            </strong>
            <p>
              {p.limits.agents === -1 ? '∞' : p.limits.agents} {t('موظف', 'agents')} ·{' '}
              {p.limits.channels === -1 ? '∞' : p.limits.channels} {t('قنوات', 'channels')}
            </p>
            <button
              className="btn btn-primary"
              disabled={
                !status.data?.configured ||
                busy ||
                ws.data?.role !== 'owner' ||
                !p.price_cents ||
                ws.data?.plan.plan_code === p.code ||
                !!(
                  status.data.subscription?.linked &&
                  ['active', 'trialing', 'past_due'].includes(status.data.subscription.status)
                )
              }
              onClick={() => void pay('/billing/checkout', { planCode: p.code })}
            >
              {ws.data?.plan.plan_code === p.code
                ? t('الخطة الحالية', 'Current plan')
                : t('اشتراك', 'Subscribe')}
            </button>
          </section>
        ))}
      </div>
    </main>
  );
}
