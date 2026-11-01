'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '../product/locale';
import styles from './crm-workspace.module.css';
export function CrmNav() {
  const path = usePathname();
  const { t } = useLocale();
  return (
    <nav className={styles.nav} aria-label={t('إدارة العملاء', 'CRM navigation')}>
      {[
        ['/dashboard/crm', 'العملاء', 'Customers'],
        ['/dashboard/crm/pipeline', 'فرص البيع', 'Pipeline'],
        ['/dashboard/crm/tasks', 'المهام والمتابعات', 'Tasks & follow-ups'],
        ['/dashboard/crm/reports', 'التقارير', 'Reports'],
        ['/dashboard/crm/advanced', 'الإعدادات المتقدمة', 'Advanced settings'],
      ].map(([href, ar, en]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          {t(ar, en)}
        </Link>
      ))}
    </nav>
  );
}
