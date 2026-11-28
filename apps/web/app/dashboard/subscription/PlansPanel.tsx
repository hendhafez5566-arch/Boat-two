'use client';
import { useRef, useState } from 'react';
import styles from './subscription.module.css';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { Dialog } from '../../../components/product/ProductUI';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
import {
  billingDocument,
  billingMoney,
  BillingPlan,
  BillingStatus,
} from '../../../lib/billing-display';
export default function PlansPanel({
  plans,
  currentPlan,
  status,
  role,
  loading,
  requestError,
}: {
  plans: BillingPlan[];
  currentPlan?: string;
  status: BillingStatus | null;
  role?: string;
  loading: boolean;
  requestError: string;
}) {
  const { t, language } = useLocale();
  const format = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB');
  const lock = useRef(false);
  const [selected, setSelected] = useState<BillingPlan | null>(null);
  const current = plans.find((plan) => plan.code === currentPlan);
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
      const url = billingDocument(result.url);
      if (!url) throw new Error(t('رابط بوابة الدفع غير صالح.', 'Invalid billing portal URL.'));
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      lock.current = false;
      setBusy(false);
    }
  }
  const linked =
    status?.subscription?.linked &&
    ['active', 'trialing', 'past_due'].includes(status.subscription.status);
  const labels:Record<string,string>={messages_per_month:t('رسائل صادرة شهريًا','Monthly outbound messages'),contacts:t('جهات الاتصال','Total contacts'),ai_credits:t('محاولات AI شهريًا','Monthly AI attempts'),channels:t('القنوات','Channels'),agents:t('الموظفون','Staff'),flows:t('التدفقات','Flows'),bots:t('البوتات','Bots'),knowledge_sources:t('مصادر المعرفة','Knowledge sources'),ai_agents:t('وكلاء الذكاء الاصطناعي','AI agents'),automation_rules:t('قواعد الأتمتة','Automation rules'),campaigns_per_month:t('الحملات شهريًا','Monthly campaigns'),generation_token_budget:t('حد توكنز التوليد','Generation token budget'),embedding_token_budget:t('حد توكنز المعرفة','Knowledge token budget')};
  const featureLabels:Record<string,string>={broadcasts:t('الحملات','Campaigns'),api_access:t('الوصول إلى API','API access'),white_label:t('العلامة التجارية الخاصة','White-label branding'),automations:t('الأتمتة','Automation'),reports:t('التقارير','Reports')};
  const quoteCurrent=selected&&plans.some(p=>p.code===selected.code&&p.checkout_available===true&&p.price_cents===selected.price_cents&&p.currency===selected.currency&&p.interval===selected.interval);
  return (
    <section className={styles.content}>
      {(error || requestError) && (
        <p role="alert" className="notice error">
          {error || requestError}
        </p>
      )}
      {loading && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
      {status && !status.configured && (
        <p>
          {t('الاشتراك المدفوع غير متاح حاليًا.', 'Paid subscriptions are currently unavailable.')}
        </p>
      )}
      {!loading&&!requestError&&!plans.length&&<p role="status">{t('لا توجد باقات متاحة حاليًا.','No plans available.')}</p>}
      {role&&role!=='owner'&&<p className={styles.muted}>{t('مالك مساحة العمل فقط يمكنه تغيير الباقة.','Only the workspace owner can change the plan.')}</p>}
      <div className={styles.sectionHeader}><h2>{t('الباقات المتاحة','Available plans')}</h2><span className={styles.muted}>{t('الأسعار والحدود من كتالوج المنصة','Prices and limits from platform catalog')}</span></div>
      {linked&&role==='owner'&&status?.portalAvailable&&!requestError&&<section className={styles.panel}><h2>{t('تغيير الاشتراك الحالي','Change existing subscription')}</h2><p className={styles.muted}>{t('تحدد البوابة خيارات التغيير والسعر الفعلي لعقدك.','The billing portal determines available changes and your actual contract price.')}</p><button className="btn btn-primary" disabled={busy||loading} onClick={()=>void pay('/billing/portal')}>{t('إدارة الاشتراك في بوابة الدفع','Manage subscription in billing portal')}</button></section>}
      <div className={styles.plans}>
        {plans.map((p) => (
          <section className={styles.plan} data-current={currentPlan === p.code} key={p.code}>
            <div className={styles.cardHeader}>
              <h2>{p.name}</h2>
              {currentPlan === p.code && (
                <span className={styles.badge}>{!linked&&status?.subscription?.status==='trialing'?t('باقتك التجريبية','Trial plan'):t('باقتك الحالية', 'Current plan')}</span>
              )}
            </div>
            <div className={styles.price}>
              <bdi>{billingMoney(p.price_cents, p.currency)}</bdi>
              <small> / {p.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}</small>
            </div>
            <dl className={styles.planLimits}>
              {Object.keys(labels).filter(key=>typeof p.limits[key]==='number').map(key=> (
                <div key={key}>
                  <dt>{labels[key]}</dt>
                  <dd>
                    {p.limits[key] === -1
                      ? t('غير محدود', 'Unlimited')
                      : p.limits[key] == null
                        ? '—'
                        : format.format(p.limits[key])}
                  </dd>
                </div>
              ))}
            </dl>
            {p.features&&Object.entries(p.features).some(([key,value])=>value&&featureLabels[key])&&<ul className={styles.features}>{Object.entries(p.features).filter(([key,value])=>value&&featureLabels[key]).map(([key])=><li key={key}><NavIcon name="circleCheck"/>{featureLabels[key]}</li>)}</ul>}
            {p.price_cents>0&&p.checkout_available!==true&&<p className={styles.muted}>{t('السعر غير متاح للاشتراكات الجديدة حاليًا.','This price is not available for new subscriptions.')}</p>}
            {!linked&&role==='owner'&&status?.configured&&p.price_cents>0&&p.checkout_available===true&&(
              <button
                className="btn btn-primary"
                disabled={
                  busy || loading || !!requestError ||
                  role !== 'owner' ||
                  !status?.configured ||
                  !p.price_cents ||
                  p.checkout_available!==true ||
                  (linked ? !status.portalAvailable : false)
                }
                onClick={() => {
                  setError('');
                  setSelected(p);
                }}
              >
                <NavIcon name="upgrade"/>{currentPlan===p.code?t('تفعيل الاشتراك المدفوع','Activate paid subscription'):t('اشتراك','Subscribe')}
              </button>
            )}
          </section>
        ))}
      </div>
      <Dialog className={styles.reviewDialog}
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title={t('مراجعة تغيير الباقة', 'Review plan change')}
      >
        {selected && (
          <div className="stack">
            <dl className={styles.sideFacts}>
              {current && (
                <div>
                  <dt>{t('الباقة الحالية', 'Current plan')}</dt>
                  <dd>
                    {current.name} ·{' '}
                    <bdi>{billingMoney(current.price_cents, current.currency)}</bdi>
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('الباقة المختارة', 'Selected plan')}</dt>
                <dd>
                  {selected.name} ·{' '}
                  <bdi>{billingMoney(selected.price_cents, selected.currency)}</bdi> /{' '}
                  {selected.interval === 'year' ? t('سنة', 'year') : t('شهر', 'month')}
                </dd>
              </div>
            </dl>
            {!quoteCurrent&&<p role="alert" className="notice error">{t('تغير السعر أو التوفر. أغلق النافذة واختر الباقة من جديد.','Price or availability changed. Close and select the plan again.')}</p>}
            <p className={styles.muted}>
              {linked
                ? t(
                    'اختر الباقة داخل بوابة الدفع. تعرض البوابة أي فرق في السعر وموعد التفعيل قبل تأكيد التغيير.',
                    'Select the plan in the billing portal. The portal shows any price difference and effective date before confirmation.',
                  )
                : t(
                    'راجع التكلفة النهائية في صفحة الدفع. يتغير اشتراكك بعد تأكيد العملية.',
                    'Review the final cost in checkout. Your subscription changes after confirmation.',
                  )}
            </p>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy||loading||!!requestError||role!=='owner'||!status?.configured||!quoteCurrent||Boolean(linked)}
              onClick={() =>
                void pay(
                  linked ? '/billing/portal' : '/billing/checkout',
                  linked ? undefined : { planCode: selected.code },
                )
              }
            >
              <NavIcon name="billing"/>{busy?t('جارٍ فتح البوابة…','Opening portal…'):t('المتابعة إلى بوابة الدفع', 'Continue to billing provider')}
            </button>
          </div>
        )}
      </Dialog>
      {status?.configured===false&&<Link className="btn" href="/dashboard/support"><NavIcon name="support"/>{t('استفسر عن الاشتراك من الدعم','Ask support about subscriptions')}</Link>}
    </section>
  );
}
