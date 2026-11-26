'use client';
import { NavIcon } from '../../../../components/product/NavIcon';
import Link from 'next/link';
import { useLocale } from '../../../../components/product/locale';
import styles from '../../../../components/business/crm-product.module.css';

export default function ToolsPage() {
  const { t } = useLocale();
  const groups = [
    {
      title: t('تنظيم العملاء', 'Organize customers'),
      links: [
        ['lists', 'قوائم العملاء', 'Customer lists', 'list', 'جمّع عملاء محددين في قوائم', 'Group selected customers into lists'],
        ['segments', 'شرائح العملاء', 'Customer segments', 'filter', 'احفظ فلاتر تتحدّث نتائجها تلقائيًا', 'Save filters with automatically updated results'],
        ['work', 'تصدير السجلات', 'Export records', 'export', 'نزّل بيانات العملاء والمتابعات وفرص البيع', 'Download customer, follow-up and deal records'],
      ],
    },
    {
      title: t('إدارة العمل', 'Manage work'),
      links: [
        ['notifications', 'الإشعارات', 'Notifications', 'bell', 'راجع تنبيهات المهام والعملاء', 'Review task and customer alerts'],
        ['sales', 'توزيع العملاء والتنبيهات', 'Assignment and alerts', 'team', 'اضبط قواعد الإسناد ومتابعة التنبيهات', 'Set assignment and alert rules'],
        ['advanced', 'إعدادات CRM', 'CRM settings', 'settings', 'اضبط الحقول ومراحل البيع وتقييم العملاء', 'Configure fields, pipeline stages and scoring'],
      ],
    },
  ];
  return (
    <main className={`${styles.page} ${styles.toolsPage}`}>
      <h1>{t('أدوات CRM', 'CRM tools')}</h1>
      <div className={styles.columns}>
        {groups.map(({ title, links }) => (
          <section key={title} className={styles.group}>
            <h2>{title}</h2>
            {links.map(([path, ar, en, icon, arDetail, enDetail]) => (
              <Link key={path} href={'/dashboard/crm/' + path}>
                <span className={styles.toolIcon}><NavIcon name={icon} /></span>
                <span className={styles.toolText}><strong>{t(ar, en)}</strong><small>{t(arDetail, enDetail)}</small></span>
                <span className={styles.toolArrow}><NavIcon name="chevron" /></span>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
