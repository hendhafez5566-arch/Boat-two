'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './crm-workspace.module.css';
import css from './sales.module.css';
type Employee = {
  user_id: string;
  full_name: string;
  contacts: number;
  unattended: number;
  conversations: number;
  waiting: number;
  overdue: number;
  completed: number;
  open_deals: number;
  won: number;
};
export function TeamProductivity() {
  const { t } = useLocale(),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const q = new URLSearchParams({ ...(from && { from }), ...(to && { to }) });
  const data = useData<{ employees: Employee[]; startAt: string; endAt: string }>(
    '/crm/workspace/analytics?' + q,
    { employees: [], startAt: '', endAt: '' },
  );
  return (
    <section className={styles.card}>
      <div className={css.row}>
        <h2>
          <NavIcon name="reports" />
          {t('عبء العمل وأداء الفريق', 'Team workload & productivity')}
        </h2>
        <Link className="btn" href="/dashboard/crm/reports">
          {t('التقارير التفصيلية', 'Detailed reports')}
        </Link>
      </div>
      <div className={styles.form}>
        <label>
          {t('من', 'From')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('إلى', 'To')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p>
        {t(
          'عبء العمل لقطة حالية. المكتمل والناجح حسب آخر تحديث والحالة الحالية خلال الفترة. متوسط الرد غير معروض حتى اعتماد بياناته.',
          'Workload is a current snapshot. Completed and won counts use current status and last update in the period. Response averages await validated data.',
        )}
      </p>
      {data.error && <p role="alert">{data.error}</p>}
      {data.loading && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
      <div className={css.employees}>
        {data.data.employees.map((m) => (
          <article key={m.user_id} className={css.member}>
            <h3>{m.full_name}</h3>
            {[
              [
                'contacts',
                t('العملاء المسندون', 'Assigned customers'),
                '/dashboard/crm?ownerId=' + m.user_id,
              ],
              [
                'unattended',
                t('دون متابعة', 'Without follow-up'),
                '/dashboard/crm?ownerId=' + m.user_id + '&preset=unattended',
              ],
              [
                'conversations',
                t('محادثات مفتوحة', 'Open conversations'),
                '/dashboard/inbox?assignee=' + m.user_id,
              ],
              [
                'waiting',
                t('تنتظر الرد', 'Awaiting reply'),
                '/dashboard/inbox?needsReply=true&assignee=' + m.user_id,
              ],
              [
                'overdue',
                t('مهام متأخرة', 'Overdue tasks'),
                '/dashboard/crm/tasks?ownerId=' + m.user_id + '&period=overdue',
              ],
              [
                'completed',
                t('مهام مكتملة', 'Completed tasks'),
                '/dashboard/crm/tasks?status=done&ownerId=' +
                  m.user_id +
                  '&updatedFrom=' +
                  data.data.startAt +
                  '&updatedTo=' +
                  data.data.endAt,
              ],
              [
                'open_deals',
                t('صفقات مفتوحة', 'Open deals'),
                '/dashboard/crm/pipeline?allPipelines=true&ownerId=' + m.user_id,
              ],
              [
                'won',
                t('صفقات ناجحة', 'Won deals'),
                '/dashboard/crm/pipeline?allPipelines=true&status=won&ownerId=' +
                  m.user_id +
                  '&updatedFrom=' +
                  data.data.startAt +
                  '&updatedTo=' +
                  data.data.endAt,
              ],
            ].map(([key, label, href]) => (
              <Link className={css.row} key={key} href={href}>
                <span>{label}</span>
                <strong>{m[key as keyof Employee]}</strong>
              </Link>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
