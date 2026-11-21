'use client';
import Link from 'next/link';
import { useLocale } from '../../../../components/product/locale';
import styles from '../../../../components/business/crm-product.module.css';

export default function ToolsPage() {
  const { t } = useLocale();
  const groups = [
    {
      title: t('تنظيم العملاء', 'Organize customers'),
      links: [
        ['lists', 'قوائم العملاء', 'Customer lists'],
        ['segments', 'الشرائح الذكية', 'Smart segments'],
        ['work', 'إدارة السجلات وتصديرها', 'Manage and export records'],
      ],
    },
    {
      title: t('إدارة العمل', 'Manage work'),
      links: [
        ['notifications', 'الإشعارات', 'Notifications'],
        ['sales', 'المبيعات الذكية والإسناد', 'Smart sales and assignment'],
        ['advanced', 'الحقول والتقييم والإعدادات', 'Fields, scoring and settings'],
      ],
    },
  ];
  return (
    <main className={styles.page}>
      <h1>{t('أدوات CRM', 'CRM tools')}</h1>
      <div className={styles.columns}>
        {groups.map(({ title, links }) => (
          <section key={title} className={styles.group}>
            <h2>{title}</h2>
            {links.map(([path, ar, en]) => (
              <Link key={path} href={'/dashboard/crm/' + path}>
                {t(ar, en)}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
