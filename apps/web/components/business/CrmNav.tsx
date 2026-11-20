'use client';
import Link from 'next/link';
import { NavIcon } from '../product/NavIcon';
import { usePathname } from 'next/navigation';
import { useLocale } from '../product/locale';
import design from './crm-design.module.css';
import bench from './crm-workbench.module.css';
export function CrmNav() {
  const path = usePathname();
  const { t } = useLocale();
  return (
    <nav className={bench.nav} aria-label={t('إدارة العملاء', 'CRM navigation')}>
      {[
        ['/dashboard/crm', 'العملاء', 'Customers', 'crm'],
        ['/dashboard/crm/pipeline', 'فرص البيع', 'Pipeline', 'handshake'],
        ['/dashboard/crm/tasks', 'المهام والمتابعات', 'Tasks & follow-ups', 'calendar'],
        ['/dashboard/crm/overview', 'نظرة عامة', 'Overview', 'grid'],
      ].map(([href, ar, en, icon]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
          <NavIcon name={icon} />
          {t(ar, en)}
        </Link>
      ))}
      <details className={design.moreNav}>
        <summary>
          <NavIcon name="settings" />
          {t('أدوات CRM', 'CRM tools')}
          <NavIcon name="chevron" />
        </summary>
        <div className={design.moreLinks}>
          {[
            ['/dashboard/crm/lists', 'قوائم العملاء', 'Customer lists', 'list'],
            ['/dashboard/crm/reports', 'التقارير', 'Reports', 'reports'],
            ['/dashboard/crm/work', 'إدارة وتصدير السجلات', 'Manage and export work', 'export'],
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
