'use client';
import Link from 'next/link';
import { CrmNav } from '../../../../components/business/CrmNav';
import { useData } from '../../../../components/business/useData';
import { useLocale } from '../../../../components/product/locale';
import styles from '../../../../components/business/crm-workspace.module.css';
type Report = {
  contacts: { total: number; customers: number; leads: number };
  sales: { currency: string; status: string; count: number; value_cents: string }[];
  sources: { source: string; count: number }[];
  followups: { open: number; overdue: number; done: number };
  employees: {
    user_id: string;
    full_name: string;
    overdue: number;
    completed: number;
    won: number;
  }[];
  unattended: { id: string; name: string }[];
  generatedAt: string;
};
export default function CrmReports() {
  const { t, language } = useLocale();
  const workspace = useData<{ role: string }>('/workspace', { role: '' });
  const allowed = ['owner', 'admin'].includes(workspace.data.role);
  const report = useData<Report | null>(allowed ? '/crm/workspace/report' : null, null);
  const r = report.data;
  const won = r?.sales.filter((x) => x.status === 'won').reduce((a, b) => a + b.count, 0) || 0;
  const closed = r?.sales.filter((x) => x.status !== 'open').reduce((a, b) => a + b.count, 0) || 0;
  return (
    <main className={styles.page}>
      <CrmNav />
      <header className={styles.heading}>
        <div>
          <h1>{t('تقارير العملاء والمبيعات', 'CRM reports')}</h1>
          <p>
            {t(
              'بيانات فعلية تراكمية لجميع الفترات. القيم المالية منفصلة حسب العملة.',
              'Live all-time totals. Financial values are separated by currency.',
            )}
          </p>
        </div>
        <button className="btn" onClick={() => void report.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </header>
      {!workspace.loading && !allowed && (
        <p className="notice">
          {t('التقارير متاحة للمدير والمالك.', 'Reports are available to owners and admins.')}
        </p>
      )}
      {report.error && (
        <p className="notice error" role="alert">
          {report.error}
        </p>
      )}
      {allowed && report.loading && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
      {r && (
        <>
          <div className={styles.grid}>
            {[
              [t('العملاء', 'Contacts'), r.contacts.total],
              [t('عملاء محتملون', 'Leads'), r.contacts.leads],
              [t('المتابعات المتأخرة', 'Overdue follow-ups'), r.followups.overdue],
              [
                t('نسبة الفوز من الفرص المغلقة', 'Closed opportunity win rate'),
                closed ? Math.round((won / closed) * 100) + '%' : '—',
              ],
            ].map(([label, value]) => (
              <section key={label} className={styles.card}>
                <h2>{label}</h2>
                <strong className={styles.metric}>{value}</strong>
              </section>
            ))}
          </div>
          <div className={styles.grid}>
            <section className={styles.card}>
              <h2>{t('الصفقات', 'Deals')}</h2>
              {r.sales.map((x) => (
                <p key={x.currency + x.status}>
                  {x.currency} ·{' '}
                  {x.status === 'open'
                    ? t('مفتوحة', 'Open')
                    : x.status === 'won'
                      ? t('ناجحة', 'Won')
                      : t('خاسرة', 'Lost')}{' '}
                  · {x.count} ·{' '}
                  {new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', {
                    style: 'currency',
                    currency: x.currency,
                  }).format(Number(x.value_cents) / 100)}
                </p>
              ))}
            </section>
            <section className={styles.card}>
              <h2>{t('مصادر العملاء', 'Lead sources')}</h2>
              {r.sources.map((x) => (
                <p key={x.source}>
                  {x.source === 'Unknown' ? t('غير محدد', 'Unknown') : x.source}:{' '}
                  <strong>{x.count}</strong>
                </p>
              ))}
            </section>
          </div>
          <section className={styles.card}>
            <h2>{t('أداء الفريق', 'Team performance')}</h2>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('الموظف', 'Employee')}</th>
                    <th>{t('متابعات مكتملة', 'Completed tasks')}</th>
                    <th>{t('متأخرة', 'Overdue')}</th>
                    <th>{t('صفقات ناجحة', 'Won deals')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.employees.map((m) => (
                    <tr key={m.user_id}>
                      <td>{m.full_name}</td>
                      <td>{m.completed}</td>
                      <td>{m.overdue}</td>
                      <td>{m.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.card}>
            <h2>{t('عملاء محتملون دون متابعة مفتوحة', 'Leads without an open follow-up')}</h2>
            <p className={styles.hint}>
              {t('أقدم 50 ملفًا بحاجة إلى مراجعة.', 'The oldest 50 profiles requiring review.')}
            </p>
            {r.unattended.map((c) => (
              <p key={c.id}>
                <Link href={`/dashboard/crm?contact=${c.id}`}>{c.name}</Link>
              </p>
            ))}
          </section>
          <p className={styles.hint}>
            {t('وقت التقرير', 'Generated')}:{' '}
            {new Date(r.generatedAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en')}
          </p>
        </>
      )}
    </main>
  );
}
