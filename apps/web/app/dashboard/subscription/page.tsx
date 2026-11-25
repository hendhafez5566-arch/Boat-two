'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useData } from '../../../components/business/useData';
import { type Meter, useSubscriptionUsage } from '../../../components/business/SubscriptionUsageProvider';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
import { billingDate, billingMoney, type BillingPlan, type BillingStatus } from '../../../lib/billing-display';
import { statusLabel } from '../../../components/product/status';
import styles from './subscription.module.css';

type History = { days: { day: string; count: number }[]; today: number; lastSeven: number; previous: number; previousAi: number };

function UsageCard({ title, subtitle, icon, meter, purple }: {
  title: string; subtitle: string; icon: string; meter: Meter; purple?: boolean;
}) {
  const { t, language } = useLocale();
  const n = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 0 });
  const percent = meter.percent == null ? null : Math.floor(meter.percent);
  return <article className={styles.meter} data-purple={purple || undefined} data-warning={(percent ?? 0) >= 95}>
    <div className={styles.cardHeader}><h3>{title}</h3><NavIcon name={icon} /></div>
    <p className={styles.reading}><bdi>{n.format(meter.used)}</bdi>
      <small> / {meter.limit === -1 ? t('غير محدود', 'Unlimited') : <bdi>{n.format(meter.limit)}</bdi>}</small>
    </p>
    <p className={styles.muted}>{subtitle}</p>
    {percent !== null && <div className={styles.progressRow}>
      <progress aria-label={title} max={100} value={Math.min(100, percent)} />
      <bdi>{n.format(percent)}%</bdi>
    </div>}
    <p className={styles.remaining}>{meter.remaining === null ? t('بدون سقف استخدام', 'No usage cap') :
      <>{t('المتبقي', 'Remaining')} <strong>{n.format(meter.remaining)}</strong></>}</p>
  </article>;
}

export default function Subscription() {
  const { t, language } = useLocale();
  const snapshot = useSubscriptionUsage();
  const billing = useData<BillingStatus | null>('/billing/status', null);
  const plans = useData<BillingPlan[]>('/plans', []);
  const usage = snapshot?.usage;
  const history = useData<History | null>(usage ? '/workspace/subscription-history' : null, null);
  const reloadHistory = history.reload;
  useEffect(() => {
    if (usage?.cycleStart) void reloadHistory();
  // Refresh the daily series when the authoritative message count or cycle changes.
  }, [usage?.messages.used, usage?.cycleStart, reloadHistory]);
  const reloadBilling = billing.reload;
  useEffect(() => {
    if (usage?.plan.plan_code) void reloadBilling();
  }, [usage?.plan.plan_code, usage?.plan.status, usage?.plan.current_period_end, reloadBilling]);
  const plan = plans.data.find((item) => item.code === usage?.plan.plan_code);
  const n = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB');
  const date = (value: string | null | undefined) => value ? billingDate(value, language, 'UTC') : '—';
  const limit = (key: string) => {
    const value = usage?.plan.limits[key];
    return value === -1 ? t('غير محدود', 'Unlimited') : value == null ? '—' : n.format(value);
  };
  const subscription = billing.data?.subscription;
  const renewal = subscription?.linked && ['active', 'trialing'].includes(subscription.status) && !subscription.cancelAtPeriodEnd
    ? subscription.currentPeriodEnd : null;
  const days = renewal && usage ? Math.max(0, Math.ceil((Date.parse(renewal) - Date.parse(usage.asOf)) / 86400000)) : null;
  const max = Math.max(1, ...(history.data?.days.map((item) => item.count) ?? []));
  const warning = usage ? [
    [t('الرسائل', 'Messages'), usage.messages],
    [t('جهات الاتصال', 'Contacts'), usage.contacts],
    [t('الذكاء الاصطناعي', 'AI'), usage.ai],
  ].filter((entry) => ((entry[1] as Meter).percent ?? 0) >= 80) as [string, Meter][] : [];
  const live = snapshot?.connected && !snapshot.stale && usage;
  return <main className={styles.page}>
    <header className={styles.heading}><NavIcon name="reports" /><div>
      <h1>{t('اشتراكي واستهلاكي', 'Subscription & usage')}</h1>
      <p>{t('تابع حدود باقتك واستخدامها ومواعيد التجديد.', 'Track your limits, usage, and renewal dates.')}</p>
    </div></header>
    {!usage ? <section className={styles.panel} role={snapshot?.stale ? 'alert' : 'status'}>
      {snapshot?.stale ? t('تعذّر جلب الاستهلاك. سنعيد المحاولة تلقائيًا.', 'Usage is unavailable. Retrying automatically.') :
        t('جارٍ تحميل الاستهلاك…', 'Loading usage…')}
    </section> : <div className={styles.layout}>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div><span>{t('باقتك الحالية', 'Your current plan')}</span><h2>{usage.plan.plan_name}</h2>
            <p>{usage.plan.trial_expired ? t('انتهت التجربة', 'Trial ended') : statusLabel(usage.plan.status, t)}</p></div>
          <dl>{([
            ['channels', 'القنوات', 'Channels'], ['agents', 'الموظفون', 'Staff'], ['flows', 'التدفقات', 'Flows'],
          ] as const).map(([key, ar, en]) => <div key={key}><dt>{t(ar, en)}</dt><dd>{limit(key)}</dd></div>)}</dl>
          <Link className="btn" href="/dashboard/packages">{t('إدارة الاشتراك', 'Manage subscription')}</Link>
        </section>
        <section className={styles.panel} aria-labelledby="usage-heading">
          <div className={styles.sectionHeader}><h2 id="usage-heading">{t('الاستخدام الحالي', 'Current usage')}</h2>
            <span className={styles.connection} data-live={Boolean(live)}>{live ? t('متصل', 'Connected') :
              t('جارٍ إعادة الاتصال', 'Reconnecting')} · <bdi>{new Date(usage.asOf).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</bdi></span></div>
          <div className={styles.meters}>
            <UsageCard title={t('الرسائل الصادرة', 'Outbound messages')} subtitle={t('محاولات الإرسال المسجلة خلال الشهر', 'Recorded sends this calendar month')} icon="inbox" meter={usage.messages} />
            <UsageCard title={t('جهات الاتصال', 'Contacts')} subtitle={t('السعة الإجمالية لمساحة العمل', 'Total workspace capacity')} icon="crm" meter={usage.contacts} />
            <UsageCard title={t('الذكاء الاصطناعي', 'AI usage')} subtitle={t('محاولات محسوبة خلال الشهر', 'Counted attempts this calendar month')} icon="agents" meter={usage.ai} purple />
          </div>
          {(usage.tokens.limit >= 0 || usage.costLimitMicrousd != null) && <p className={styles.muted}>
            {t('التوكنز المحتسبة والمحجوزة', 'Charged and reserved tokens')} <bdi>{n.format(usage.tokens.used)}</bdi>
            {usage.tokens.limit >= 0 && <bdi> / {n.format(usage.tokens.limit)}</bdi>}
            {usage.costLimitMicrousd != null && <> · {t('حد تكلفة مستقل', 'Separate cost cap')} <bdi>{Number(usage.costLimitMicrousd)/1e6} USD</bdi></>}
          </p>}
          {!!warning.length && <div className={styles.warning} role="status">
            {warning.map(([label, meter]) => <span key={label}>{label} · {meter.remaining === 0 ? t('بلغ الحد', 'Limit reached') : <bdi>{n.format(Math.floor(meter.percent ?? 0))}%</bdi>}</span>)}
          </div>}
          <div className={styles.actions}>
            <Link className="btn btn-primary" href="/dashboard/packages">{t('عرض الباقات والترقية', 'Compare and upgrade plans')}</Link>
            <button className="btn" type="button" disabled>{t('شحن الرصيد غير متاح حاليًا', 'Top-ups currently unavailable')}</button>
          </div>
        </section>
        <div className={styles.lower}>
        <section className={styles.panel}>
          <div className={styles.sectionHeader}><h2>{t('الرسائل خلال الدورة', 'Messages this cycle')}</h2><NavIcon name="reports" /></div>
          {history.error && <p role="alert">{t('تعذّر تحميل سجل الاستخدام.', 'Unable to load usage history.')}</p>}
          {history.data && <>
            <div className={styles.chart} role="img" aria-label={t('عدد الرسائل لكل يوم من الدورة', 'Daily message count for this cycle')}>
              {history.data.days.map(({day,count}) => <div key={day} title={`${day}: ${n.format(count)}`} style={{ height: `${Math.max(2, count / max * 100)}%` }} />)}
            </div>
            <dl className={styles.history}>
              {([
                [t('اليوم', 'Today'), history.data.today], [t('آخر ٧ أيام', 'Last 7 days'), history.data.lastSeven],
                [t('الدورة الحالية', 'Current cycle'), usage.messages.used], [t('الدورة السابقة', 'Previous cycle'), history.data.previous],
                [t('محاولات AI في الدورة السابقة', 'AI attempts in previous cycle'), history.data.previousAi],
              ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{n.format(value)}</dd></div>)}
            </dl>
          </>}
        </section>
          <section className={styles.panel}>
            <div className={styles.sectionHeader}><h2>{t('مقارنة الباقات', 'Compare plans')}</h2>
              <Link href="/dashboard/packages">{t('عرض التفاصيل', 'View details')}</Link></div>
            <div className={styles.compactPlans}>
              {plans.data.map((item) => <article className={styles.plan} data-current={item.code === usage.plan.plan_code} key={item.code}>
                <h3>{item.name}</h3>
                <strong><bdi>{billingMoney(item.price_cents, item.currency)}</bdi> / {item.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}</strong>
                <dl className={styles.planLimits}>
                  {([
                    ['messages_per_month', 'رسالة / شهر', 'Messages / month'],
                    ['contacts', 'جهات اتصال', 'Contacts'],
                    ['ai_credits', 'محاولات AI / شهر', 'AI attempts / month'],
                  ] as const).map(([key, ar, en]) => <div key={key}><dt>{t(ar, en)}</dt>
                    <dd>{item.limits[key] === -1 ? t('غير محدود', 'Unlimited') : item.limits[key] == null ? '—' : n.format(item.limits[key])}</dd></div>)}
                </dl>
                {item.code === usage.plan.plan_code && <span className={styles.badge}>{t('باقتك الحالية', 'Current plan')}</span>}
              </article>)}
            </div>
          </section>
        </div>
      </div>
      <aside className={styles.content} aria-label={t('الدورة والفوترة', 'Cycle and billing')}>
        <section className={styles.panel}><h2>{t('دورة الاستخدام الحالية', 'Current usage cycle')}</h2>
          <dl className={styles.sideFacts}>
            <div><dt>{t('بدأت في', 'Started')}</dt><dd>{date(usage.cycleStart)}</dd></div>
            <div><dt>{t('تتجدد الحصص في', 'Quotas reset')}</dt><dd>{date(usage.cycleEnd)}</dd></div>
          </dl>
        </section>
        <section className={styles.panel}><h2>{t('الفوترة والدفع', 'Billing & payment')}</h2>
          <dl className={styles.sideFacts}>
            <div><dt>{t('سعر الباقة', 'Plan price')}</dt><dd>{plan ? <><bdi>{billingMoney(plan.price_cents, plan.currency)}</bdi> / {plan.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}</> : '—'}</dd></div>
            <div><dt>{t('التجديد المقبل', 'Next renewal')}</dt><dd>{date(renewal)}{days != null && <> · {n.format(days)} {t('يوم', 'days')}</>}</dd></div>
            <div><dt>{t('التجديد التلقائي', 'Automatic renewal')}</dt><dd>{renewal ? t('مفعّل', 'On') : subscription?.cancelAtPeriodEnd ? t('متوقف', 'Off') : t('غير مؤكد', 'Unconfirmed')}</dd></div>
          </dl>
          {!billing.loading && billing.data && !billing.data.configured && <p className={styles.muted}>{t('الدفع عبر المنصة غير مفعّل حاليًا.', 'Online payment is currently disabled.')}</p>}
          <Link className="btn" href="/dashboard/billing">{t('عرض سجل الفواتير', 'Invoice history')}</Link>
        </section>
        <section className={styles.panel}><h2>{t('مساعدة الاشتراك', 'Subscription support')}</h2>
          <Link className="btn" href="/dashboard/support">{t('تواصل مع الدعم', 'Contact support')}</Link>
        </section>
      </aside>
    </div>}
  </main>;
}
