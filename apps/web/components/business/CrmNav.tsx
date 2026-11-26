'use client';
import { NavIcon } from '../product/NavIcon';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '../product/locale';
import styles from './crm-product.module.css';

export function CrmNav() {
  const path = usePathname();
  const { t } = useLocale();
  return (
    <nav className={styles.nav} aria-label={t('إدارة العملاء', 'CRM navigation')}>
      {[
        ['/today', 'يوم العمل', 'Today', 'calendar'],
        ['', 'العملاء', 'Customers', 'crm'],
        ['/tasks', 'المتابعات', 'Follow-ups', 'circleCheck'],
        ['/pipeline', 'فرص البيع', 'Pipeline', 'flag'],
        ['/reports', 'التقارير', 'Reports', 'reports'],
        ['/tools', 'الأدوات', 'Tools', 'integrations'],
      ].map(([suffix, ar, en, icon]) => {
        const href = '/dashboard/crm' + suffix;
        const current =
          path === href ||
          (suffix === '/reports' && path === '/dashboard/crm/overview') ||
          (suffix === '/tools' &&
            /\/crm\/(lists|segments|work|notifications|sales|advanced)$/.test(path));
        return (
          <Link key={href} href={href} aria-current={current ? 'page' : undefined}>
            <NavIcon name={icon} />{t(ar, en)}
          </Link>
        );
      })}
    </nav>
  );
}
