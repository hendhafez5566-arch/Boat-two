'use client';

import Link from 'next/link';
import { useLocale } from '../product/locale';
import { useSubscriptionUsage } from './SubscriptionUsageProvider';
import { billingDate } from '../../lib/billing-display';
import styles from '../../app/dashboard/subscription/subscription.module.css';

export function SubscriptionSummary() {
  const { t, language } = useLocale();
  const snapshot = useSubscriptionUsage();
  const usage = snapshot?.usage;
  if (!usage) return null;
  const number = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 0 });
  const percent = (value: number | null) => value == null ? t('غير محدود', 'Unlimited') : number.format(Math.floor(value)) + '%';
  return <section className={`${styles.panel} ${styles.summary}`} aria-label={t('ملخص الاشتراك', 'Subscription summary')}>
    <strong>{usage.plan.plan_name}</strong>
    <span>{t('الرسائل', 'Messages')} <bdi>{percent(usage.messages.percent)}</bdi></span>
    <span>AI <bdi>{percent(usage.ai.percent)}</bdi></span>
    <span>{t('العملاء', 'Contacts')} <bdi>{number.format(usage.contacts.used)}</bdi></span>
    {usage.plan.current_period_end && ['active','trialing'].includes(usage.plan.status) &&
      <span>{t('نهاية فترة الاشتراك', 'Subscription period ends')} {billingDate(usage.plan.current_period_end, language, 'UTC')}</span>}
    {snapshot?.stale && <span className={styles.connection}>
      {t('آخر تحديث', 'Last updated')} · <bdi>{new Date(usage.asOf).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-GB')}</bdi>
    </span>}
    <Link href="/dashboard/subscription" className="btn">{t('عرض تفاصيل الاستهلاك', 'View usage details')}</Link>
  </section>;
}
