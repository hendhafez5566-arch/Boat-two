'use client';
import Link from 'next/link';
import { NavIcon } from '../product/NavIcon';
import { usePathname } from 'next/navigation';
import { useLocale } from '../product/locale';
import styles from './crm-workspace.module.css';
import design from './crm-design.module.css';
export function CrmNav() {
  const path = usePathname();
  const { t } = useLocale();
  return (
    <nav
      className={`${styles.nav} ${design.nav}`}
      aria-label={t('إدارة العملاء', 'CRM navigation')}
    >
      {[
        ['/dashboard/crm/overview', 'لوحة العمل', 'Workspace', 'reports'],
        ['/dashboard/crm', 'العملاء', 'Customers', 'crm'],
        ['/dashboard/crm/pipeline', 'فرص البيع', 'Pipeline', 'handshake'],
        ['/dashboard/crm/tasks', 'المهام والمتابعات', 'Tasks & follow-ups', 'calendar'],
        ['/dashboard/crm/reports', 'التقارير', 'Reports', 'reports'],
      ].map(([href, ar, en, icon]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          <NavIcon name={icon} />
          {t(ar, en)}
        </Link>
      ))}
      <details className={design.moreNav}>
        <summary>
          <NavIcon name="settings" />
          {t('المزيد', 'More')}
          <NavIcon name="chevron" />
        </summary>
        <div className={design.moreLinks}>
          {[
            ['/dashboard/crm/segments', 'الشرائح الذكية', 'Smart segments', 'filter'],
            ['/dashboard/crm/notifications', 'التنبيهات', 'Notifications', 'bell'],
            ['/dashboard/crm/sales', 'المبيعات الذكية', 'Smart sales', 'team'],
            ['/dashboard/crm/advanced', 'الإعدادات المتقدمة', 'Advanced settings', 'settings'],
          ].map(([href, ar, en, icon]) => (
            <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
              <NavIcon name={icon} />
              {t(ar, en)}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
