'use client';
import Link from 'next/link';
import { NavIcon } from '../product/NavIcon';
import { usePathname } from 'next/navigation';
import { useLocale } from '../product/locale';
import styles from './crm-workspace.module.css';
export function CrmNav() {
  const path = usePathname();
  const { t } = useLocale();
  return (
    <nav className={styles.nav} aria-label={t('إدارة العملاء', 'CRM navigation')}>
      {[
        ['/dashboard/crm/overview', 'لوحة العمل', 'Workspace', 'reports'],
        ['/dashboard/crm', 'العملاء', 'Customers', 'crm'],
        ['/dashboard/crm/pipeline', 'فرص البيع', 'Pipeline', 'handshake'],
        ['/dashboard/crm/tasks', 'المهام والمتابعات', 'Tasks & follow-ups', 'calendar'],
        ['/dashboard/crm/reports', 'التقارير', 'Reports', 'reports'],
        ['/dashboard/crm/segments', 'الشرائح الذكية', 'Smart segments', 'filter'],
        ['/dashboard/crm/advanced', 'الإعدادات المتقدمة', 'Advanced settings', 'settings'],
      ].map(([href, ar, en, icon]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          <NavIcon name={icon} />
          {t(ar, en)}
        </Link>
      ))}
    </nav>
  );
}
