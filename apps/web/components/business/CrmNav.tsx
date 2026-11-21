'use client';
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
        ['/today', 'يوم العمل', 'Today'],
        ['', 'العملاء', 'Customers'],
        ['/tasks', 'المتابعات', 'Follow-ups'],
        ['/pipeline', 'فرص البيع', 'Pipeline'],
        ['/reports', 'التقارير', 'Reports'],
        ['/tools', 'الأدوات', 'Tools'],
      ].map(([suffix, ar, en]) => {
        const href = '/dashboard/crm' + suffix;
        const current =
          path === href ||
          (suffix === '/reports' && path === '/dashboard/crm/overview') ||
          (suffix === '/tools' &&
            /\/crm\/(lists|segments|work|notifications|sales|advanced)$/.test(path));
        return (
          <Link key={href} href={href} aria-current={current ? 'page' : undefined}>
            {t(ar, en)}
          </Link>
        );
      })}
    </nav>
  );
}
