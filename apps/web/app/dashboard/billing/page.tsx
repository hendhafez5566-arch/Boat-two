'use client';
import { SubscriptionRequests } from '../../../components/business/SubscriptionRequests';
import { BillingReconciliation } from '../../../components/business/BillingReconciliation';
import { BillingInvoices } from '../../../components/business/BillingInvoices';
import { BillingEvents } from '../../../components/business/BillingEvents';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
type Plan = {
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
};
type Workspace = {
  role: string;
  plan: {
    plan_code: string;
    plan_name: string;
    status: string;
    trial_ends_at: string | null;
    limits: Record<string, number>;
  };
  usage: Record<string, number>;
};
export default function Billing() {
  const { t } = useLocale();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<{
    configured: boolean;
    portalAvailable: boolean;
    subscription?: {
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      status: string;
      linked: boolean;
      pastDueSince: string | null;
      graceDays: number;
    };
  }>({ configured: false, portalAvailable: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      api<Plan[]>('/plans'),
      api<Workspace>('/workspace'),
      api<typeof status>('/billing/status'),
    ])
      .then(([p, w, s]) => {
        setPlans(p);
        setWs(w);
        setStatus(s);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function pay(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ url: string }>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const u = new URL(r.url);
      if (u.protocol !== 'https:') throw new Error('Invalid billing redirect');
      window.location.assign(u.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLAN & USAGE</p>
          <h1>{t('اشتراك ينمو مع شركتك', 'A plan that grows with you')}</h1>
          <p>{ws ? `${ws.plan.plan_name} · ${ws.plan.status}` : t('جارٍ التحميل…', 'Loading…')}</p>
        </div>
        <button
          className="btn"
          disabled={!status.portalAvailable || busy || ws?.role !== 'owner'}
          onClick={() => pay('/billing/portal')}
        >
          {t('الفواتير وطرق الدفع', 'Invoices & payment methods')}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!status.configured && (
        <p className="notice">
          {t(
            'الدفع غير مفعّل في هذه البيئة. يلزم إعداد Stripe والأسعار بواسطة مشغّل المنصة. لن يتم خصم أي مبلغ.',
            'Billing is not configured in this environment. The platform operator must configure Stripe and prices. No payment will be taken.',
          )}
        </p>
      )}
      {status.subscription?.pastDueSince && (
        <p className="notice" role="status">
          {t('تأخر السداد منذ: ', 'Payment overdue since: ')}
          {new Date(status.subscription.pastDueSince).toLocaleDateString()} ·{' '}
          {t('فترة السماح بالأيام: ', 'Grace period in days: ')}
          {status.subscription.graceDays}.{' '}
          {t(
            'بعدها تُطبق حدود الخطة المجانية دون حذف بياناتك. حدّث طريقة الدفع من بوابة الفوترة.',
            'Afterwards free-plan limits apply without deleting your data. Update your payment method in the billing portal.',
          )}
        </p>
      )}
      {status.subscription?.currentPeriodEnd && (
        <p className="notice">
          {status.subscription.cancelAtPeriodEnd
            ? t('ينتهي الاشتراك في: ', 'Subscription ends on: ')
            : t('نهاية الفترة الحالية: ', 'Current period ends: ')}
          {new Date(status.subscription.currentPeriodEnd).toLocaleDateString()}
        </p>
      )}
      {ws && (
        <section className="card">
          <h2>{t('استهلاك الشهر الحالي', 'Current usage')}</h2>
          <div className="card-grid">
            {Object.entries(ws.usage).map(([key, value]) => {
              const limit = ws.plan.limits[key];
              return (
                <div key={key}>
                  <p className="muted">
                    {(
                      {
                        agents: t('الموظفون', 'Team members'),
                        channels: t('القنوات', 'Channels'),
                        flows: t('السيناريوهات', 'Flows'),
                        contacts: t('جهات الاتصال', 'Contacts'),
                        messages_per_month: t('رسائل هذا الشهر', 'Messages this month'),
                      } as Record<string, string>
                    )[key] || key}
                  </p>
                  <strong>
                    {value} / {limit === -1 ? '∞' : (limit ?? '—')}
                  </strong>
                  <div className="progress-track">
                    <div
                      style={{ width: `${limit > 0 ? Math.min(100, (value / limit) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div className="card-grid">
        {plans.map((p) => (
          <section className="card" key={p.code}>
            <span className="badge">{p.name}</span>
            <div className="metric">
              {new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency }).format(
                p.price_cents / 100,
              )}
              <small className="muted">
                {' '}
                / {p.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}
              </small>
            </div>
            <p className="muted">
              {p.limits.agents === -1 ? '∞' : p.limits.agents} {t('موظف', 'agents')} ·{' '}
              {p.limits.channels === -1 ? '∞' : p.limits.channels} {t('قنوات', 'channels')}
            </p>
            <p className="muted">
              {p.limits.flows === -1 ? '∞' : p.limits.flows} {t('سيناريو', 'flows')} ·{' '}
              {p.limits.ai_credits} {t('رد ذكاء اصطناعي', 'AI replies')}
            </p>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                disabled={
                  !status.configured ||
                  busy ||
                  ws?.role !== 'owner' ||
                  !p.price_cents ||
                  (!!status.subscription?.linked &&
                    ['active', 'trialing', 'past_due'].includes(status.subscription.status)) ||
                  ws?.plan.plan_code === p.code
                }
                onClick={() => pay('/billing/checkout', { planCode: p.code })}
              >
                {ws?.plan.plan_code === p.code
                  ? t('الخطة الحالية', 'Current plan')
                  : t('الاشتراك عبر Stripe', 'Subscribe with Stripe')}
              </button>
            </div>
          </section>
        ))}
      </div>
      {['owner', 'admin'].includes(ws?.role ?? '') && <BillingInvoices />}
      {ws?.role === 'owner' && (
        <SubscriptionRequests plans={plans} linked={!!status.subscription?.linked} />
      )}
      <BillingReconciliation />
      <BillingEvents />
    </main>
  );
}
