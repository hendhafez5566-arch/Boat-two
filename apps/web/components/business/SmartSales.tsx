'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import { NavIcon } from '../product/NavIcon';
import { CrmNav } from './CrmNav';
import { useData } from './useData';
import { noticeLabel } from './SalesNotifications';
import { SalesScoringSignals } from './SalesScoringSignals';
import { TeamProductivity } from './TeamProductivity';
import { CrmAutomation } from './CrmAutomation';
import styles from './crm-workspace.module.css';
import css from './sales.module.css';
type Policy = {
  enabled: boolean;
  method: 'round_robin' | 'least_loaded' | 'rules';
  memberIds: string[];
  maxOpenPerAgent?: number;
  rules: {
    channelId?: string;
    departmentId?: string;
    tag?: string;
    fieldKey?: string;
    fieldValue?: string;
    memberIds: string[];
  }[];
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
  const channels = useData<{ id: string; name: string }[]>(
    members.data.role && members.data.role !== 'agent' ? '/channels' : null,
    [],
  );
  const departments = useData<{ id: string; name: string }[]>(
    members.data.role && members.data.role !== 'agent' ? '/departments' : null,
    [],
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
  const queue = useData<{
    total: number;
    items: {
      id: string;
      channel_id: string;
      name: string;
      reason: string | null;
      created_at: string;
    }[];
  }>(members.data.role && members.data.role !== 'agent' ? '/crm/sales/assignment-queue' : null, {
    total: 0,
    items: [],
  });
  const [scenario, setScenario] = useState({
    channelId: '',
    departmentId: '',
    tags: '',
    fieldKey: '',
    fieldValue: '',
    previousOwner: '',
  });
  const reasonLabel = (reason: string) =>
    (
      ({
        policy_disabled: t('التوزيع التلقائي متوقف', 'Automatic assignment is disabled'),
        awaiting_service: t(
          'بانتظار تحديد نوع الخدمة من العميل',
          'Waiting for the customer to choose a service',
        ),
        no_matching_rule: t('لا توجد قاعدة تخصص مطابقة', 'No matching specialty rule'),
        no_participants: t('لا يوجد موظفون مشاركون', 'No participants selected'),
        no_eligible_employee: t(
          'الموظفون غير متاحين أو خارج القسم أو عند السعة القصوى',
          'Staff are unavailable, outside the department or at capacity',
        ),
        retained_eligible_owner: t(
          'احتفاظ بالموظف السابق بعد فحص التخصص والتوفر والسعة',
          'Previous owner retained after specialty, availability and capacity checks',
        ),
        round_robin: t(
          'اختيار بالتناوب بين الموظفين المؤهلين',
          'Round robin among eligible employees',
        ),
        least_loaded: t('أقل عدد من المحادثات المفتوحة', 'Fewest open conversations'),
        matching_rule_least_loaded: t(
          'قاعدة تخصص مطابقة ثم أقل محادثات مفتوحة',
          'Matching specialty rule, then fewest open conversations',
        ),
      }) as Record<string, string>
    )[reason] || reason;
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
  useEffect(() => {
    setTest('');
  }, [scenario, draft]);
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
    setTest('');
    setBusy(true);
    try {
      const result = await api<{
        employee: string | null;
        reason: string;
        ruleIndex: number | null;
      }>('/crm/sales/assignment-test', {
        method: 'POST',
        body: JSON.stringify({
          ...(scenario.channelId ? { channelId: scenario.channelId } : {}),
          ...(scenario.departmentId ? { departmentId: scenario.departmentId } : {}),
          tags: scenario.tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          ...(scenario.fieldKey
            ? { attributes: { [scenario.fieldKey]: scenario.fieldValue } }
            : {}),
          ...(scenario.previousOwner ? { previousOwner: scenario.previousOwner } : {}),
        }),
      });
      setTest(
        (result.employee
          ? (members.data.members.find((m) => m.user_id === result.employee)?.full_name ||
              result.employee) + ' — '
          : '') +
          reasonLabel(result.reason) +
          (result.ruleIndex !== null ? t(' · القاعدة ', ' · Rule ') + (result.ruleIndex + 1) : ''),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (members.data.role === 'agent')
    return (
      <main className={styles.page}>
        <CrmNav />
        <h1>{t('مساحة عملي', 'My workspace')}</h1>
        <TeamProductivity />
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
            <NavIcon name="team" />
            {t('إدارة المبيعات', 'Sales operations')}
          </span>
          <h1>{t('الفريق المناسب، في الوقت المناسب', 'The right team, at the right time')}</h1>
          <p>
            {t(
              'وزّع العملاء واضبط التنبيهات والأتمتة من مساحة واحدة.',
              'Manage lead assignment, notifications and automation in one workspace.',
            )}
          </p>
          <div className={css.row}>
            <Link className="btn" href="/dashboard/team">
              {t('الفريق والتوفر', 'Team and availability')}
            </Link>
            <Link className="btn" href="/dashboard/departments">
              {t('الأقسام والتخصصات', 'Departments and specialties')}
            </Link>
            <Link className="btn" href="/dashboard/crm/notifications">
              {t('تنبيهات المدير', 'Manager notifications')}
            </Link>
          </div>
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
            <NavIcon name="team" />
            {t('توزيع العملاء', 'Lead assignment')}
          </h2>
          <label>
            {t(
              'الحد الأقصى للمحادثات المفتوحة لكل موظف',
              'Maximum open conversations per employee',
            )}
            <input
              type="number"
              min={1}
              max={500}
              value={draft.assignment.maxOpenPerAgent ?? ''}
              placeholder={t('فارغ = حد صندوق الوارد', 'Blank = Inbox capacity limit')}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  assignment: {
                    ...draft.assignment,
                    maxOpenPerAgent: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </label>
          <div className={`${styles.form} ${css.fields}`}>
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
            <div className={styles.card}>
              <h3>
                {t('قواعد التوزيع — تُستخدم أول قاعدة مطابقة', 'Routing rules — first match wins')}
              </h3>
              {draft.assignment.rules.map((rule, i) => (
                <div key={i} className={`${styles.form} ${css.fields}`}>
                  <label>
                    {t('القناة', 'Channel')}
                    <select
                      value={rule.channelId || ''}
                      onChange={(e) => {
                        const next = { ...rule };
                        if (e.target.value) next.channelId = e.target.value;
                        else delete next.channelId;
                        setDraft({
                          ...draft,
                          assignment: {
                            ...draft.assignment,
                            rules: draft.assignment.rules.map((r, j) => (j === i ? next : r)),
                          },
                        });
                      }}
                    >
                      <option value="">{t('كل القنوات', 'All channels')}</option>
                      {channels.data.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('القسم', 'Department')}
                    <select
                      value={rule.departmentId || ''}
                      onChange={(e) => {
                        const next = { ...rule };
                        if (e.target.value) next.departmentId = e.target.value;
                        else delete next.departmentId;
                        setDraft({
                          ...draft,
                          assignment: {
                            ...draft.assignment,
                            rules: draft.assignment.rules.map((r, j) => (j === i ? next : r)),
                          },
                        });
                      }}
                    >
                      <option value="">{t('كل الأقسام', 'All departments')}</option>
                      {departments.data.map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('الوسم (اختياري)', 'Tag (optional)')}
                    <input
                      maxLength={50}
                      value={rule.tag || ''}
                      onChange={(e) => {
                        const next = { ...rule };
                        if (e.target.value) next.tag = e.target.value;
                        else delete next.tag;
                        setDraft({
                          ...draft,
                          assignment: {
                            ...draft.assignment,
                            rules: draft.assignment.rules.map((r, j) => (j === i ? next : r)),
                          },
                        });
                      }}
                    />
                  </label>
                  <fieldset>
                    <legend>{t('الموظفون المشاركون في القاعدة', 'Rule participants')}</legend>
                    {members.data.members.map((m) => (
                      <label key={m.user_id}>
                        <span>
                          <input
                            type="checkbox"
                            checked={rule.memberIds.includes(m.user_id)}
                            onChange={(e) => {
                              const next = {
                                ...rule,
                                memberIds: e.target.checked
                                  ? [...rule.memberIds, m.user_id]
                                  : rule.memberIds.filter((id) => id !== m.user_id),
                              };
                              setDraft({
                                ...draft,
                                assignment: {
                                  ...draft.assignment,
                                  rules: draft.assignment.rules.map((r, j) => (j === i ? next : r)),
                                },
                              });
                            }}
                          />
                          {m.full_name}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    {t('حقل نوع الخدمة من البوت (اختياري)', 'Bot service field (optional)')}
                    <input
                      maxLength={100}
                      placeholder="travel_service"
                      value={rule.fieldKey || ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          assignment: {
                            ...draft.assignment,
                            rules: draft.assignment.rules.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    fieldKey: e.target.value || undefined,
                                    fieldValue: e.target.value ? r.fieldValue || '' : undefined,
                                  }
                                : r,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  {rule.fieldKey && (
                    <label>
                      {t('قيمة الخدمة المطلوبة', 'Required service value')}
                      <input
                        required
                        maxLength={200}
                        value={rule.fieldValue || ''}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            assignment: {
                              ...draft.assignment,
                              rules: draft.assignment.rules.map((r, j) =>
                                j === i ? { ...r, fieldValue: e.target.value } : r,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        assignment: {
                          ...draft.assignment,
                          rules: draft.assignment.rules.filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    {t('حذف القاعدة', 'Remove rule')}
                  </button>
                </div>
              ))}
              <button
                className="btn"
                type="button"
                disabled={draft.assignment.rules.length >= 30}
                onClick={() =>
                  setDraft({
                    ...draft,
                    assignment: {
                      ...draft.assignment,
                      rules: [...draft.assignment.rules, { memberIds: [] }],
                    },
                  })
                }
              >
                {t('إضافة قاعدة', 'Add rule')}
              </button>
            </div>
          )}
          <fieldset className={styles.card} disabled={busy}>
            <legend>{t('سيناريو اختبار دون إسناد', 'Test scenario without assignment')}</legend>
            <p className="muted">
              {t(
                'يختبر السياسة المحفوظة فقط. احفظ التعديلات أولًا. لا يغيّر الموظف أو دور التناوب أو بيانات العميل.',
                'Tests the saved policy only. Save edits first. Does not change assignments, the rotation cursor or customer records.',
              )}
            </p>
            <div className={`${styles.form} ${css.fields}`}>
              <label>
                {t('قناة الاختبار', 'Test channel')}
                <select
                  value={scenario.channelId}
                  onChange={(e) => setScenario({ ...scenario, channelId: e.target.value })}
                >
                  <option value="">{t('دون قناة', 'No channel')}</option>
                  {channels.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('قسم الاختبار', 'Test department')}
                <select
                  value={scenario.departmentId}
                  onChange={(e) => setScenario({ ...scenario, departmentId: e.target.value })}
                >
                  <option value="">{t('دون قسم', 'No department')}</option>
                  {departments.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('وسوم الاختبار مفصولة بفاصلة', 'Test tags, comma separated')}
                <input
                  value={scenario.tags}
                  onChange={(e) => setScenario({ ...scenario, tags: e.target.value })}
                />
              </label>
              <label>
                {t('حقل الخدمة للاختبار', 'Test service field')}
                <input
                  value={scenario.fieldKey}
                  onChange={(e) => setScenario({ ...scenario, fieldKey: e.target.value })}
                />
              </label>
              <label>
                {t('قيمة الخدمة للاختبار', 'Test service value')}
                <input
                  value={scenario.fieldValue}
                  onChange={(e) => setScenario({ ...scenario, fieldValue: e.target.value })}
                />
              </label>
              <label>
                {t('الموظف السابق للاختبار', 'Test previous owner')}
                <select
                  value={scenario.previousOwner}
                  onChange={(e) => setScenario({ ...scenario, previousOwner: e.target.value })}
                >
                  <option value="">{t('عميل جديد', 'New customer')}</option>
                  {members.data.members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="btn" disabled={busy} onClick={() => void dryRun()}>
              {t('اختبار السياسة المحفوظة دون إسناد', 'Test saved policy without assignment')}
            </button>
            {test && <output role="status">{test}</output>}
          </fieldset>
          <hr />
          <details>
            <DisclosureSummary>
              <h2>
                <NavIcon name="bell" />
                {t('إعدادات التنبيهات الداخلية', 'Internal notification settings')}
              </h2>
            </DisclosureSummary>
            <div className={`${styles.form} ${css.fields}`}>
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
            <fieldset>
              <legend>
                {t(
                  'المستهدفون بالتنبيهات (دون تحديد = الافتراضي)',
                  'Notification recipients (none selected = defaults)',
                )}
              </legend>
              {members.data.members.map((m) => (
                <label key={m.user_id}>
                  <span>
                    <input
                      type="checkbox"
                      checked={draft.notifications.targetIds.includes(m.user_id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          notifications: {
                            ...draft.notifications,
                            targetIds: e.target.checked
                              ? [...draft.notifications.targetIds, m.user_id]
                              : draft.notifications.targetIds.filter((id) => id !== m.user_id),
                          },
                        })
                      }
                    />
                    {m.full_name}
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{t('أنواع ذات أولوية عالية', 'High-priority alert types')}</legend>
              {draft.notifications.kinds.map((kind) => (
                <label key={kind}>
                  <span>
                    <input
                      type="checkbox"
                      checked={draft.notifications.highPriority.includes(kind)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          notifications: {
                            ...draft.notifications,
                            highPriority: e.target.checked
                              ? [...draft.notifications.highPriority, kind]
                              : draft.notifications.highPriority.filter((x) => x !== kind),
                          },
                        })
                      }
                    />
                    {noticeLabel(kind, t)}
                  </span>
                </label>
              ))}
            </fieldset>
          </details>
          <Button busy={busy} type="submit">
            {t('حفظ الإعدادات', 'Save settings')}
          </Button>
        </form>
      )}
      <CrmAutomation />
      <SalesScoringSignals />
      <section className={styles.card}>
        <h2>
          {t('محادثات تنتظر التوزيع', 'Conversations waiting for assignment')} · {queue.data.total}
        </h2>
        <button className="btn" onClick={() => void queue.reload()}>
          {t('تحديث الانتظار', 'Refresh queue')}
        </button>
        {queue.error && <p role="alert">{queue.error}</p>}
        {!queue.loading && !queue.error && queue.data.total === 0 && (
          <p>{t('لا توجد محادثات غير معيّنة.', 'No unassigned conversations.')}</p>
        )}
        {queue.data.items.map((cv) => (
          <article key={cv.id}>
            <strong>{cv.name || t('زائر', 'Visitor')}</strong>
            <p>
              {cv.reason
                ? reasonLabel(cv.reason)
                : t('لم يُنفذ توزيع تلقائي بعد', 'Automatic assignment has not run yet')}
            </p>
            <time dateTime={cv.created_at}>{new Date(cv.created_at).toLocaleString()}</time>
            <div className={css.row}>
              <Link
                className="btn"
                href={`/dashboard/inbox?conversation=${cv.id}&channelId=${cv.channel_id}`}
              >
                {t('فتح المحادثة وتعيين موظف', 'Open conversation and assign employee')}
              </Link>
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/conversations/${cv.id}/auto-assign`, { method: 'POST' });
                    await queue.reload();
                    setNotice(t('تم تعيين موظف مؤهل.', 'Eligible employee assigned.'));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('إعادة محاولة التوزيع', 'Retry assignment')}
              </button>
            </div>
          </article>
        ))}
        {queue.data.total > 100 && (
          <p>
            {t(
              'تُعرض أقدم 100 محادثة. افتح الوارد لمراجعة بقية القائمة.',
              'Showing the oldest 100 conversations. Open Inbox for the remaining queue.',
            )}
          </p>
        )}
      </section>
      <TeamProductivity />
      <section className={styles.card}>
        <h2>{t('آخر تغييرات المسؤول', 'Recent assignment changes')}</h2>
        {history.error && <p role="alert">{history.error}</p>}
        {!history.data.length && (
          <p>{t('لا توجد تغييرات مسجلة بعد.', 'No recorded changes yet.')}</p>
        )}
        {history.data.map((h) => (
          <div className={css.notice} key={h.id}>
            <NavIcon name="team" />
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
