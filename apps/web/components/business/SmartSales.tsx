'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import { NavIcon } from '../product/NavIcon';
import { CrmNav } from './CrmNav';
import { useData } from './useData';
import { noticeLabel } from './SalesNotifications';
import { CrmAutomation } from './CrmAutomation';
import styles from './crm-workspace.module.css';
import css from './sales.module.css';
type Policy = {
  enabled: boolean;
  method: 'round_robin' | 'least_loaded' | 'rules';
  memberIds: string[];
  rules: { channelId?: string; departmentId?: string; tag?: string; memberIds: string[] }[];
};
type Notifications = {
  enabled: boolean;
  kinds: string[];
  dueMinutes: number;
  replyMinutes: number;
  staleDays: number;
  closingDays: number;
  targetIds: string[];
  highPriority: string[];
};
type Settings = { assignment: Policy; notifications: Notifications };
export function SmartSales() {
  const { t } = useLocale();
  const members = useData<{ role: string; members: { user_id: string; full_name: string }[] }>(
    '/crm/workspace/members',
    { role: '', members: [] },
  );
  const settings = useData<Settings | null>(
    members.data.role && members.data.role !== 'agent' ? '/crm/sales/settings' : null,
    null,
  );
  const history = useData<
    { id: string; resource_type: string; full_name: string; created_at: string }[]
  >(
    members.data.role && members.data.role !== 'agent' ? '/crm/sales/assignment-history' : null,
    [],
  );
  const [draft, setDraft] = useState<Settings | null>(null),
    [expected, setExpected] = useState<Settings | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [test, setTest] = useState('');
  useEffect(() => {
    if (settings.data) {
      setDraft(settings.data);
      setExpected(settings.data);
    }
  }, [settings.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api<Settings>('/crm/sales/settings', {
        method: 'POST',
        body: JSON.stringify({ ...draft, expected }),
      });
      setExpected(saved);
      setDraft(saved);
      setNotice(t('تم حفظ الإعدادات.', 'Settings saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function dryRun() {
    setError('');
    try {
      const result = await api<{ employee: string | null }>('/crm/sales/assignment-test', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setTest(
        result.employee
          ? members.data.members.find((m) => m.user_id === result.employee)?.full_name ||
              result.employee
          : t(
              'لا يوجد موظف مؤهل أو لا توجد قاعدة مطابقة.',
              'No eligible employee or matching rule.',
            ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (members.data.role === 'agent')
    return (
      <main className={styles.page}>
        <CrmNav />
        <h1>{t('مساحة عملي', 'My workspace')}</h1>
        <p>
          {t(
            'ابدأ بالمهام والمحادثات والصفقات المسندة إليك.',
            'Start with your assigned tasks, conversations and deals.',
          )}
        </p>
        <div className={css.row}>
          <Link className="btn" href="/dashboard/crm/tasks?ownerId=me&period=today">
            {t('مهامي اليوم', 'My tasks today')}
          </Link>
          <Link className="btn" href="/dashboard/inbox">
            {t('محادثاتي', 'My conversations')}
          </Link>
          <Link className="btn" href="/dashboard/crm/pipeline?ownerId=me&allPipelines=true">
            {t('صفقاتي', 'My deals')}
          </Link>
        </div>
      </main>
    );
  return (
    <main className={styles.page}>
      <CrmNav />
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <NavIcon name="users" />
            {t('إدارة المبيعات', 'Sales operations')}
          </span>
          <h1>{t('الفريق المناسب، في الوقت المناسب', 'The right team, at the right time')}</h1>
          <p>
            {t(
              'وزّع العملاء واضبط التنبيهات والأتمتة من مساحة واحدة.',
              'Manage lead assignment, notifications and automation in one workspace.',
            )}
          </p>
        </div>
      </header>
      {(settings.error || members.error || error) && (
        <p role="alert" className="notice error">
          {settings.error || members.error || error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!draft ? (
        <p role="status">{t('جارٍ تحميل الإعدادات…', 'Loading settings…')}</p>
      ) : (
        <form className={styles.card} onSubmit={save}>
          <h2>
            <NavIcon name="users" />
            {t('توزيع العملاء', 'Lead assignment')}
          </h2>
          <div className={styles.form}>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={draft.assignment.enabled}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      assignment: { ...draft.assignment, enabled: e.target.checked },
                    })
                  }
                />
                {t('تشغيل التوزيع التلقائي', 'Enable automatic assignment')}
              </span>
            </label>
            <label>
              {t('طريقة التوزيع', 'Assignment method')}
              <select
                value={draft.assignment.method}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    assignment: { ...draft.assignment, method: e.target.value as Policy['method'] },
                  })
                }
              >
                <option value="round_robin">{t('بالتناوب', 'Round robin')}</option>
                <option value="least_loaded">{t('أقل عبء عمل', 'Least loaded')}</option>
                <option value="rules">
                  {t('حسب قواعد القناة والقسم والوسم', 'Channel, department and tag rules')}
                </option>
              </select>
            </label>
          </div>
          <p>
            {t(
              'يُستبعد الموظف غير المتاح بحسب حالته في الفريق. التوزيع لا يرسل رسائل.',
              'Unavailable team members are excluded. Assignment sends no messages.',
            )}
          </p>
          <div className={css.employees}>
            {members.data.members.map((m) => (
              <div key={m.user_id} className={css.member}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.assignment.memberIds.includes(m.user_id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        assignment: {
                          ...draft.assignment,
                          memberIds: e.target.checked
                            ? [...draft.assignment.memberIds, m.user_id]
                            : draft.assignment.memberIds.filter((id) => id !== m.user_id),
                        },
                      })
                    }
                  />
                  {m.full_name}
                </label>
              </div>
            ))}
          </div>
          {draft.assignment.method === 'rules' && (
            <p>
              {t(
                'قواعد القنوات والأقسام محفوظة في السياسة الحالية؛ استخدم واجهة API لإدارتها في هذه النسخة. لا تُطبّق قاعدة غير مطابقة.',
                'Channel and department rules are preserved in the current policy; manage them through the API in this version. Unmatched rules never assign.',
              )}
            </p>
          )}
          <div className={css.row}>
            <button type="button" className="btn" onClick={() => void dryRun()}>
              {t('اختبار السياسة المحفوظة دون إسناد', 'Test saved policy without assignment')}
            </button>
            {test && <output>{test}</output>}
          </div>
          <hr />
          <h2>
            <NavIcon name="bell" />
            {t('إعدادات التنبيهات الداخلية', 'Internal notification settings')}
          </h2>
          <div className={styles.form}>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={draft.notifications.enabled}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      notifications: { ...draft.notifications, enabled: e.target.checked },
                    })
                  }
                />
                {t('تفعيل التنبيهات', 'Enable notifications')}
              </span>
            </label>
            {[
              ['dueMinutes', 'التحذير قبل المهمة (دقائق)', 'Task warning (minutes)', 10080],
              ['replyMinutes', 'انتظار الرد (دقائق)', 'Reply waiting (minutes)', 10080],
              ['staleDays', 'ركود الصفقة (أيام)', 'Deal inactivity (days)', 365],
              ['closingDays', 'قبل الإغلاق (أيام)', 'Before close (days)', 90],
            ].map(([key, ar, en, max]) => (
              <label key={key}>
                {t(String(ar), String(en))}
                <input
                  type="number"
                  min={1}
                  max={Number(max)}
                  required
                  value={draft.notifications[key as keyof Notifications] as number}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      notifications: { ...draft.notifications, [key]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className={css.employees}>
            {[
              'new_lead',
              'unassigned',
              'task_due',
              'task_overdue',
              'awaiting_reply',
              'stale_deal',
              'closing_deal',
              'assigned',
              'automation',
            ].map((kind) => (
              <div key={kind} className={css.member}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.notifications.kinds.includes(kind)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        notifications: {
                          ...draft.notifications,
                          kinds: e.target.checked
                            ? [...draft.notifications.kinds, kind]
                            : draft.notifications.kinds.filter((x) => x !== kind),
                        },
                      })
                    }
                  />
                  {noticeLabel(kind, t)}
                </label>
              </div>
            ))}
          </div>
          <p>
            {t(
              'التنبيهات داخل المنصة فقط. الافتراضي: الموظف المسؤول، والمدير للعميل دون مسؤول.',
              'In-app only. Defaults to the assigned employee, or managers for unassigned leads.',
            )}
          </p>
          <Button busy={busy} type="submit">
            {t('حفظ الإعدادات', 'Save settings')}
          </Button>
        </form>
      )}
      <CrmAutomation />
      <section className={styles.card}>
        <h2>{t('آخر تغييرات المسؤول', 'Recent assignment changes')}</h2>
        {history.error && <p role="alert">{history.error}</p>}
        {!history.data.length && (
          <p>{t('لا توجد تغييرات مسجلة بعد.', 'No recorded changes yet.')}</p>
        )}
        {history.data.map((h) => (
          <div className={css.notice} key={h.id}>
            <NavIcon name="users" />
            <div>
              <strong>{h.full_name || t('دون مسؤول', 'Unassigned')}</strong>
              <p>{new Date(h.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
