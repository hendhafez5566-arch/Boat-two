'use client';
import Link from 'next/link';
import { useLocale } from '../../../../components/product/locale';
import { useData } from '../../../../components/business/useData';
import styles from '../../../../components/business/crm-product.module.css';

type Task = { id: string; title: string; contact_id: string; contact_name: string };
type QueueData = { items: Task[]; total: number };
function Queue({ period, title, owner }: { period: string; title: string; owner: string }) {
  const { t } = useLocale();
  const scope = new URLSearchParams({ period, status: 'open', ownerId: owner });
  const tasks = useData<QueueData>(
    owner
      ? '/crm/tasks?' + new URLSearchParams({ ...Object.fromEntries(scope), limit: '5' })
      : null,
    { items: [], total: 0 },
  );
  return (
    <section className={styles.group} aria-label={title}>
      <h2>{title}</h2>
      {tasks.error && (
        <p className="notice error" role="alert">
          {tasks.error}
        </p>
      )}
      {owner && tasks.loading && (
        <p className="empty" role="status">
          {t('جارٍ التحميل…', 'Loading…')}
        </p>
      )}
      {owner && !tasks.loading && !tasks.error && !tasks.data.total && (
        <p className="empty">{t('لا توجد متابعات', 'No follow-ups')}</p>
      )}
      {tasks.data.items.map((task) => (
        <Link key={task.id} href={'/dashboard/crm?contact=' + task.contact_id + '&section=tasks'}>
          <strong>{task.title}</strong>
          <span>{task.contact_name}</span>
        </Link>
      ))}
      <Link href={'/dashboard/crm/tasks?' + new URLSearchParams({ period, ownerId: 'me' })}>
        {t('عرض المتابعات', 'View follow-ups')}
      </Link>
    </section>
  );
}
export default function TodayPage() {
  const { t } = useLocale();
  const member = useData<{ currentUserId: string }>('/crm/workspace/members', {
    currentUserId: '',
  });
  return (
    <main className={styles.page}>
      <div className="page-heading">
        <h1>{t('يوم العمل', 'Today')}</h1>
        <Link className="btn btn-primary" href="/dashboard/crm?create=true">
          {t('إضافة عميل', 'Add customer')}
        </Link>
      </div>
      {member.error && (
        <p className="notice error" role="alert">
          {member.error}
        </p>
      )}
      <div className={styles.columns}>
        <Queue
          period="today"
          title={t('المستحقة اليوم', 'Due today')}
          owner={member.data.currentUserId}
        />
        <Queue
          period="overdue"
          title={t('المتأخرة', 'Overdue')}
          owner={member.data.currentUserId}
        />
        <Queue
          period="upcoming"
          title={t('القادمة', 'Upcoming')}
          owner={member.data.currentUserId}
        />
      </div>
    </main>
  );
}
