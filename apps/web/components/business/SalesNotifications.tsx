'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { NavIcon } from '../product/NavIcon';
import { useLocale } from '../product/locale';
import { useData } from './useData';
import { CrmNav } from './CrmNav';
import styles from './crm-workspace.module.css';
import css from './sales.module.css';
type Notice = {
  id: string;
  kind: string;
  resource_type: string;
  resource_id: string;
  contact_id: string;
  title: string;
  priority: string;
  read_at: string | null;
  handled_at: string | null;
  created_at: string;
};
export function noticeLabel(kind: string, t: (ar: string, en: string) => string) {
  const labels: Record<string, [string, string]> = {
    new_lead: ['عميل جديد يحتاج متابعة', 'New lead needs follow-up'],
    unassigned: ['عميل دون مسؤول', 'Unassigned lead'],
    task_due: ['اقترب موعد المتابعة', 'Follow-up due soon'],
    task_overdue: ['متابعة متأخرة', 'Overdue follow-up'],
    awaiting_reply: ['محادثة تنتظر الرد', 'Conversation awaiting reply'],
    stale_deal: ['صفقة تحتاج نشاطًا', 'Inactive deal'],
    closing_deal: ['اقترب إغلاق الصفقة', 'Deal closing soon'],
    assigned: ['تم إسناد عمل إليك', 'Work assigned to you'],
    automation: ['تنبيه من الأتمتة', 'Automation notification'],
  };
  return labels[kind] ? t(...labels[kind]) : kind;
}
function href(n: Notice) {
  if (n.resource_type === 'conversation') return '/dashboard/inbox?conversation=' + n.resource_id;
  if (n.resource_type === 'deal')
    return '/dashboard/crm/pipeline?status=&allPipelines=true&view=table&id=' + n.resource_id;
  if (n.resource_type === 'task')
    return '/dashboard/crm/tasks?status=&view=table&id=' + n.resource_id;
  return '/dashboard/crm?contact=' + n.contact_id;
}
export function SalesNotifications({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('all'),
    [page, setPage] = useState(1),
    [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const data = useData<{ unread: number; items: Notice[] }>(
    '/crm/sales/notifications?tab=' + tab + '&page=' + page,
    { unread: 0, items: [] },
  );
  const reload = data.reload;
  useEffect(() => {
    const id = setInterval(() => void reload(), 30000);
    return () => clearInterval(id);
  }, [reload]);
  useEffect(() => {
    if (!open) return;
    const click = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  async function mark(id?: string, handled = false) {
    try {
      await api('/crm/sales/notifications/' + (id || 'read-all'), {
        method: 'POST',
        body: JSON.stringify(id ? { handled } : {}),
      });
      await reload();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const panel = (
    <div className={compact ? css.dropdown : styles.card}>
      <div className={css.row}>
        <h2>
          <NavIcon name="bell" />
          {t('مركز التنبيهات', 'Notifications')}
        </h2>
        <button className="btn" onClick={() => void mark()}>
          {t('قراءة الجميع', 'Read all')}
        </button>
      </div>
      <div className={css.row}>
        {[
          ['all', 'الكل', 'All'],
          ['unread', 'غير مقروء', 'Unread'],
          ['handled', 'تم التعامل معها', 'Handled'],
        ].map(([v, ar, en]) => (
          <button
            key={v}
            className={'btn ' + (tab === v ? 'btn-primary' : '')}
            aria-pressed={tab === v}
            onClick={() => {
              setTab(v);
              setPage(1);
            }}
          >
            {t(ar, en)}
          </button>
        ))}
      </div>
      {(data.error || error) && (
        <p role="alert" className="notice error">
          {data.error || error}
        </p>
      )}
      {data.loading && <p role="status">{t('جارٍ التحديث…', 'Updating…')}</p>}
      {!data.loading && !data.error && !data.data.items.length && (
        <div className={css.empty}>
          <NavIcon name="circleCheck" />
          <p>{t('لا توجد تنبيهات في هذه القائمة.', 'No notifications in this list.')}</p>
        </div>
      )}
      <div className={css.notices}>
        {data.data.items.map((n) => (
          <article key={n.id} className={css.notice} data-priority={n.priority}>
            <NavIcon name={n.priority === 'high' ? 'stopwatch' : 'bell'} />
            <div>
              <Link
                href={href(n)}
                onClick={() => {
                  void mark(n.id);
                  setOpen(false);
                }}
              >
                <strong>{noticeLabel(n.kind, t)}</strong>
                <p>{n.title}</p>
              </Link>
              <small>{new Date(n.created_at).toLocaleString()}</small>
              <div className={css.row}>
                {!n.read_at && (
                  <button className="btn" onClick={() => void mark(n.id)}>
                    {t('قراءة', 'Read')}
                  </button>
                )}
                {!n.handled_at && (
                  <button className="btn" onClick={() => void mark(n.id, true)}>
                    {t('تم التعامل معها', 'Mark handled')}
                  </button>
                )}
              </div>
            </div>
            {!n.read_at && <span className={css.dot} aria-label={t('غير مقروء', 'Unread')} />}
          </article>
        ))}
      </div>
      {compact ? (
        <Link className="btn" href="/dashboard/crm/notifications" onClick={() => setOpen(false)}>
          {t('عرض جميع التنبيهات', 'View all notifications')}
        </Link>
      ) : (
        <div className={css.row}>
          <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t('السابق', 'Previous')}
          </button>
          <span>{page}</span>
          <button
            className="btn"
            disabled={data.data.items.length < 30}
            onClick={() => setPage(page + 1)}
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      )}
    </div>
  );
  if (compact)
    return (
      <div ref={ref} className={css.bell}>
        <button
          className="bs-iconbtn"
          aria-label={t('مركز التنبيهات', 'Notifications')}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <NavIcon name="bell" />
          {data.data.unread > 0 && (
            <span className={css.count}>{data.data.unread > 99 ? '99+' : data.data.unread}</span>
          )}
        </button>
        {open && panel}
      </div>
    );
  return (
    <main className={styles.page}>
      <CrmNav />
      <div className={styles.heading}>
        <h1>{t('تنبيهاتك ومتابعاتك', 'Your notifications & follow-ups')}</h1>
        <p>
          {t(
            'تنبيهات داخل المنصة؛ تتحدث كل ٣٠ ثانية أثناء فتح الصفحة.',
            'Internal alerts refresh every 30 seconds while this page is open.',
          )}
        </p>
      </div>
      {panel}
    </main>
  );
}
