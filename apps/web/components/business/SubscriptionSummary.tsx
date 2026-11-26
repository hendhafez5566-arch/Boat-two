'use client';

import Link from 'next/link';
import { useLocale } from '../product/locale';
import { useSubscriptionUsage } from './SubscriptionUsageProvider';

export function SubscriptionSummary() {
  const { t } = useLocale();
  const snapshot = useSubscriptionUsage();
  return <div className="dashboard-plan" aria-label={t('الباقة الحالية', 'Current plan')}>
    {snapshot?.usage && <strong>{t('باقتك', 'Your plan')} · <bdi>{snapshot.usage.plan.plan_name}</bdi></strong>}
    <Link href="/dashboard/subscription">{t('عرض تفاصيل الاستهلاك', 'View usage details')}</Link>
  </div>;
}
