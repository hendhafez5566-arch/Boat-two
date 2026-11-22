'use client';
import product from './crm-product.module.css';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { NavIcon } from '../product/NavIcon';
import { api } from '../../lib/api';
import { useCrmEditBody } from './useCrmEditBody';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { statusLabel } from '../product/status';
import { CrmScore } from './CrmScoring';
import premium from './crm-workspace.module.css';
import { StartCrmConversation } from './StartCrmConversation';
import { CrmWork } from './CrmWork';
import { ContactActivityExport } from './ContactActivityExport';
import design from './crm-design.module.css';
import styles from './subscribers.module.css';

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  owner_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  attributes: Record<string, string | number | boolean | null>;
};
type Profile = {
  contact: Contact;
  lists: { id: string; name: string }[];
  sequences: {
    id: string;
    name: string;
    channel_id: string;
    status: string;
    next_run_at: string | null;
    step_index: number;
    stop_reason: string | null;
  }[];
  channels: { id: string; name: string; type: string }[];
  inputs: { name: string; status: string; updated_at: string; answers: Record<string, unknown> }[];
  timeline: {
    ownerChanges?: { id: string; created_at: string; full_name: string | null }[];
    stageChanges: {
      id: string;
      deal_id: string;
      title: string;
      created_at: string;
      details: { from: string; to: string };
    }[];
    tasks: { id: string; title: string; due_at: string; status: string; updated_at: string }[];
    deals: { id: string; title: string; stage: string; status: string; updated_at: string }[];
    conversations: {
      id: string;
      channel_id: string;
      channel_name: string;
      status: string;
      last_message_at: string;
    }[];
    notes: { id: string; body: string; author: string; created_at: string }[];
    consent: { channel_id: string; channel_name: string; status: string; evidence: string }[];
    events: { id: string; type: string; status: string; created_at: string }[];
  };
};
const tabs = [
  ['overview', 'نظرة عامة', 'Overview'],
  ['deals', 'فرص البيع', 'Opportunities'],
  ['tasks', 'المتابعات', 'Follow-ups'],
  ['company', 'الشركة', 'Company'],
  ['agent', 'الموظف', 'Agent'],
  ['labels', 'الوسوم', 'Labels'],
  ['lists', 'القوائم', 'Lists'],
  ['sequences', 'التسلسلات', 'Sequences'],
  ['input', 'جمع البيانات', 'Input Flows'],
  ['fields', 'الحقول المخصصة', 'Custom Fields'],
  ['notes', 'الملاحظات', 'Notes'],
  ['consent', 'موافقة التسويق', 'Marketing Consent'],
  ['activity', 'النشاط', 'Activity'],
];

export default function SubscriberProfile({
  contactId,
  initialTab = 'overview',
  canManage,
  onChanged,
  onDraftChange,
  onDeleted,
}: {
  contactId: string;
  initialTab?: string;
  canManage: boolean;
  onChanged: () => void;
  onDraftChange: (dirty: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t, language } = useLocale();
  const data = useData<Profile | null>(`/crm/contacts/${contactId}/profile`, null);
  const members = useData<{ members: { user_id: string; full_name: string }[] }>(
    '/crm/workspace/members',
    { members: [] },
  );
  const lists = useData<{ id: string; name: string }[]>(canManage ? '/contact-lists' : null, []);
  const sequences = useData<{ id: string; name: string; channel_id: string; status: string }[]>(
    canManage ? '/sequences' : null,
    [],
  );
  const fields = useData<{ id: string; key: string; label: string; type: string }[]>(
    '/crm/fields',
    [],
  );
  const [quickCreate, setQuickCreate] = useState('');
  const [overviewEditing, setOverviewEditing] = useState(false);
  const [tab, updateTab] = useState(initialTab),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const lock = useRef(false);
  const editBody = useCrmEditBody();
  const overviewDirty = useRef(false);
  function setDraft(dirty: boolean) {
    overviewDirty.current = dirty;
    onDraftChange(dirty);
  }
  function leaveOverview() {
    if (lock.current) return false;
    if (overviewDirty.current && !window.confirm(t('تجاهل التعديلات غير المحفوظة؟', 'Discard unsaved changes?'))) return false;
    setDraft(false);
    setOverviewEditing(false);
    return true;
  }
  function setTab(next: string) {
    if (next !== tab && !leaveOverview()) return false;
    updateTab(next);
    return true;
  }
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const profile = data.data,
    contact = profile?.contact;
  const availableChannels = useData<{ id: string; name: string; type: string; status: string }[]>(
    canManage && tab === 'consent' && !contact?.archived_at && /^\+[1-9][0-9]{7,14}$/.test(contact?.phone ?? '')
      ? '/channels'
      : null,
    [],
  );
  const consentChannels = [
    ...(profile?.channels ?? []),
    ...availableChannels.data.filter((channel) =>
      channel.type === 'whatsapp' && channel.status === 'active' &&
      !profile?.channels.some((linked) => linked.id === channel.id),
    ),
  ];
  async function run(fn: () => Promise<unknown>, afterDelete?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (afterDelete) {
        afterDelete();
        return;
      }
      await data.reload();
      onChanged();
      setNotice(t('حُفظ التغيير.', 'Changes saved.'));
    } catch (e) {
      setError(e instanceof TypeError
        ? t(
            'تعذّر الاتصال. تحقق من اتصالك وأعد المحاولة.',
            'Unable to connect. Check your connection and try again.',
          )
        : (e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const patch = (change: Partial<Contact> & { ownerId?: string | null }) =>
    api(`/crm/contacts/${contactId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(editBody(contactId, { ...change, expectedUpdatedAt: contact?.updated_at })),
    });
  const date = (value?: string | null) =>
    value ? new Date(value).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB') : '—';
  const nextTask = profile?.timeline.tasks
    .filter((task) => task.status === 'open')
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  const activity =
    profile && contact
      ? [
          {
            id: 'created:' + contact.id,
            at: contact.created_at,
            title: t('أُنشئ ملف العميل', 'Customer profile created'),
            body: contact.name,
          },
          ...profile.timeline.notes.map((n) => ({
            id: 'note:' + n.id,
            at: n.created_at,
            title: t('ملاحظة داخلية', 'Internal note'),
            body: n.body,
          })),
          ...profile.timeline.conversations.map((c) => ({
            id: 'conversation:' + c.id,
            at: c.last_message_at,
            title: t('آخر تواصل في المحادثة', 'Latest conversation activity'),
            body: c.channel_name,
          })),
          ...profile.timeline.tasks.map((task) => ({
            id: 'task:' + task.id,
            at: task.updated_at,
            title:
              task.status === 'done'
                ? t('متابعة مكتملة', 'Follow-up completed')
                : t('متابعة مفتوحة', 'Open follow-up'),
            body: task.title,
          })),
          ...profile.timeline.deals
            .filter((d) => !profile.timeline.stageChanges?.some((s) => s.deal_id === d.id))
            .map((d) => ({
              id: 'deal:' + d.id,
              at: d.updated_at,
              title: t('آخر تحديث لفرصة البيع', 'Latest opportunity update'),
              body: d.title + ' · ' + d.stage,
            })),
          ...(profile.timeline.ownerChanges || []).map((s) => ({
            id: 'owner:' + s.id,
            at: s.created_at,
            title: t('تغيّر الموظف المسؤول', 'Owner changed'),
            body: s.full_name || t('دون مسؤول', 'Unassigned'),
          })),
          ...profile.timeline.events
            .filter((e) => e.type === 'crm.bot.answer' || e.type === 'crm.conversation.taken')
            .map((e) => ({
              id: 'sales:' + e.id,
              at: e.created_at,
              title:
                e.type === 'crm.bot.answer'
                  ? t('حفظ البوت بيانات العميل', 'Bot saved customer data')
                  : t('استلم الموظف المحادثة', 'Employee took conversation'),
              body: t('حُفظ الحدث داخل الشركة', 'Event recorded in workspace'),
            })),
          ...(profile.timeline.stageChanges || []).map((s) => ({
            id: 'stage:' + s.id,
            at: s.created_at,
            title: t('تغيّرت مرحلة فرصة البيع', 'Opportunity stage changed'),
            body: s.title + ' · ' + s.details.from + ' ← ' + s.details.to,
          })),
          ...profile.timeline.events
            .filter((e) => e.type.includes('contacts') && e.type.endsWith('.update'))
            .map((e) => ({
              id: 'event:' + e.id,
              at: e.created_at,
              title: t('تحديث بيانات العميل', 'Customer data updated'),
              body: t('حُفظ تحديث في ملف العميل', 'An update was recorded in this profile'),
            })),
        ]
          .filter((e) => e.at)
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      : [];
  const latestActivity = activity[0];

  function saveOverview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await patch({
        name: String(form.get('name')).trim(),
        phone: String(form.get('phone') || '') || null,
        email: String(form.get('email') || '') || null,
      });
      setDraft(false);
      setOverviewEditing(false);
    });
  }
  return (
    <aside
      className={`${styles.profile} ${design.profile}`}
      aria-label={t('ملف العميل', 'Customer profile')}
    >
      <header className={styles.profileHeader}>
        <span className={styles.avatar}>{contact?.name?.slice(0, 2) || '?'}</span>
        <div>
          <h2>{contact?.name || t('ملف العميل', 'Customer profile')}</h2>
          <div>
            {contact?.phone && (
              <a href={'tel:' + contact.phone}>
                <bdi>{contact.phone}</bdi>
              </a>
            )}
            {contact?.phone && contact?.email && <span aria-hidden="true"> · </span>}
            {contact?.email && (
              <a href={'mailto:' + contact.email}>
                <bdi>{contact.email}</bdi>
              </a>
            )}
          </div>
        </div>
      </header>
      {data.loading && <p role="status">{t('جارٍ تحميل الملف…', 'Loading profile…')}</p>}
      {(error || data.error) && (
        <p role="alert" className="notice error">
          {error || data.error}
          <button type="button" className="btn" onClick={() => void data.reload()}>
            {t('إعادة تحميل الملف', 'Reload profile')}
          </button>
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {profile && contact && (
        <>
          <div className={styles.profileMeta}>
            {canManage ? (
              <label className={design.lifecycleControl}>
                {t('مرحلة العميل', 'Lifecycle')}
                <select
                  aria-label={t('مرحلة العميل', 'Lifecycle')}
                  disabled={busy}
                  value={contact.lifecycle}
                  onChange={(event) => {
                    const lifecycle = event.target.value;
                    void run(() => patch({ lifecycle }));
                  }}
                >
                  {['lead', 'qualified', 'customer', 'inactive'].map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value, t)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className={styles.pill}>{statusLabel(contact.lifecycle, t)}</span>
            )}
            <span>{contact.archived_at ? t('مؤرشف', 'Archived') : t('نشط', 'Retained')}</span>
            <small>
              {t('منذ', 'Since')} {date(contact.created_at)}
            </small>
          </div>
          <div className={styles.quickActions}>
            {profile.timeline.conversations[0] && (
              <Link
                href={
                  '/dashboard/inbox?conversation=' +
                  profile.timeline.conversations[0].id +
                  '&channelId=' +
                  profile.timeline.conversations[0].channel_id
                }
              >
                <NavIcon name="chat" />
                {t('فتح المحادثة', 'Open conversation')}
              </Link>
            )}
            {tab !== 'deals' && (
              <button
                onClick={() => {
                  if (setTab('deals')) setQuickCreate('deals');
                }}
              >
                <NavIcon name="handshake" />
                {t('إضافة فرصة', 'Add opportunity')}
              </button>
            )}
            {tab !== 'tasks' && (
              <button
                onClick={() => {
                  if (setTab('tasks')) setQuickCreate('tasks');
                }}
              >
                <NavIcon name="calendar" />
                {t('إضافة متابعة', 'Add follow-up')}
              </button>
            )}
            <button
              onClick={() => {
                setTab('notes');
                requestAnimationFrame(() => noteInput.current?.focus());
              }}
            >
              <NavIcon name="edit" />
              {t('إضافة ملاحظة', 'Add note')}
            </button>
            {canManage && (
              <button
                onClick={() => {
                  setTab('overview');
                  setOverviewEditing(true);
                }}
              >
                <NavIcon name="edit" />
                {t('تعديل البيانات', 'Edit details')}
              </button>
            )}
          </div>
          <div className={styles.profileSummary}>
            <div className={premium.actions}>
              <span className={premium.badge}>
                <NavIcon name="user" />
                {members.data.members.find((m) => m.user_id === contact.owner_id)?.full_name ||
                  t('دون مسؤول', 'Unassigned')}
              </span>
              <span className={premium.badge} data-tone="blue">
                <NavIcon name="globe" />
                {String(contact.attributes.source || t('المصدر غير محدد', 'Source not recorded'))}
              </span>
            </div>

            {nextTask && (
              <button
                type="button"
                className={`btn ${design.summaryAction}`}
                onClick={() => {
                  setQuickCreate('');
                  setTab('tasks');
                }}
              >
                <NavIcon name="calendar" />
                <span>
                  {(new Date(nextTask.due_at).getTime() < Date.now()
                    ? t('متابعة متأخرة', 'Overdue follow-up')
                    : t('أقرب متابعة', 'Next follow-up'))} · {nextTask.title}
                </span>
                <time dateTime={nextTask.due_at}>{date(nextTask.due_at)}</time>
              </button>
            )}
            {latestActivity && (
              <button
                type="button"
                className={`btn ${design.summaryAction}`}
                onClick={() => setTab('activity')}
              >
                <NavIcon name="stopwatch" />
                <span>
                  {t('آخر نشاط', 'Latest activity')} · {latestActivity.title}
                </span>
                <time dateTime={latestActivity.at}>{date(latestActivity.at)}</time>
              </button>
            )}
          </div>
          <nav
            className={styles.profileTabs}
            aria-label={t('أقسام ملف العميل', 'Customer profile sections')}
          >
            {tabs
              .filter(([key]) => ['overview', 'deals', 'tasks', 'notes', 'activity'].includes(key))
              .map(([key, ar, en]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={tab === key}
                  onClick={() => {
                    setQuickCreate('');
                    setTab(key);
                    setError('');
                    setNotice('');
                  }}
                >
                  {t(ar, en)}
                </button>
              ))}
          </nav>
          <details className={styles.profileMore}>
            <DisclosureSummary>
              {t('بيانات وإعدادات إضافية', 'More details and settings')}
            </DisclosureSummary>
            <div className={styles.profileChannels}>
              {profile.channels.map((channel) => (
                <span key={channel.id}>
                  {channel.type} · {channel.name}
                </span>
              ))}
            </div>
            <div className={product.columns}>
              {[
                {
                  title: t('بيانات العميل', 'Customer details'),
                  keys: ['company', 'agent', 'labels', 'fields', 'input'],
                },
                {
                  title: t('التواصل والتسويق', 'Communication and marketing'),
                  keys: ['lists', 'sequences', 'consent'],
                },
              ].map(({ title, keys }) => (
                <section key={title} className={product.group}>
                  <h2>{title}</h2>
                  <div className={product.profileTools}>
                    {tabs
                      .filter(([key]) => keys.includes(key))
                      .map(([key, ar, en]) => (
                        <button
                          className="btn"
                          type="button"
                          key={key}
                          aria-pressed={tab === key}
                          onClick={() => {
                            setTab(key);
                            setQuickCreate('');
                          }}
                        >
                          {t(ar, en)}
                        </button>
                      ))}
                  </div>
                </section>
              ))}
            </div>
            <details>
              <summary>{t('التقييم ومرجع الدعم', 'Score and support reference')}</summary>
              <CrmScore contactId={contactId} version={contact.updated_at} />
              <small>
                {t('مرجع العميل', 'Customer reference')} <bdi>{contact.id}</bdi>
              </small>
            </details>
          </details>
          <div className={styles.profileBody}>
            {tab === 'deals' && (
              <CrmWork
                kind="deals"
                compact
                contactId={contactId}
                createNew={quickCreate === 'deals'}
                onChanged={() => void data.reload()}
              />
            )}
            {tab === 'tasks' && (
              <CrmWork
                kind="tasks"
                compact
                contactId={contactId}
                createNew={quickCreate === 'tasks'}
                onChanged={() => void data.reload()}
              />
            )}
            {tab === 'company' && (
              <CompanyContacts
                contact={contact}
                canManage={canManage}
                save={(company) =>
                  run(() =>
                    api(`/crm/contacts/${contactId}/profile`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        attributes: { ...contact.attributes, company },
                        expectedUpdatedAt: contact.updated_at,
                      }),
                    }),
                  )
                }
              />
            )}
            {tab === 'overview' && (
              <>
                {overviewEditing && (
                  <section className={design.inlineEditor}>
                    <form className={styles.form} key={contact.updated_at} onSubmit={saveOverview} onChange={() => setDraft(true)}>
                      <h3>{t('تعديل البيانات', 'Edit details')}</h3>
                      <label>
                        {t('الاسم', 'Name')}
                        <input
                          name="name"
                          defaultValue={contact.name}
                          required
                          maxLength={120}
                          disabled={!canManage}
                        />
                      </label>
                      <label>
                        {t('الهاتف', 'Phone')}
                        <input
                          name="phone"
                          type="tel"
                          dir="ltr"
                          defaultValue={contact.phone ?? ''}
                          maxLength={30}
                          disabled={!canManage}
                        />
                      </label>
                      <label>
                        {t('البريد الإلكتروني', 'Email')}
                        <input
                          name="email"
                          type="email"
                          dir="ltr"
                          defaultValue={contact.email ?? ''}
                          disabled={!canManage}
                        />
                      </label>
                      {canManage && (
                        <button className="btn btn-primary" disabled={busy}>
                          {t('حفظ التغييرات', 'Save Changes')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn"
                        onClick={leaveOverview}
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    </form>
                  </section>
                )}
                <h3>{t('المحادثات', 'Conversations')}</h3>
                {profile.timeline.conversations.map((row) => (
                  <Link
                    className={styles.profileRow}
                    key={row.id}
                    href={`/dashboard/inbox?conversation=${row.id}&channelId=${row.channel_id}`}
                  >
                    <strong>{row.channel_name}</strong>
                    <span>
                      {statusLabel(row.status, t)} · {date(row.last_message_at)}
                    </span>
                  </Link>
                ))}
                {!profile.timeline.conversations.length && (
                  <div>
                    <p>{t('لا توجد محادثات.', 'No conversations.')}</p>
                    {canManage && !contact.archived_at && <StartCrmConversation contactId={contactId} />}
                  </div>
                )}
                <details>
                  <summary>{t('بيانات السجل', 'Record details')}</summary>
                  <dl className={styles.overviewGrid}>
                    <div>
                      <dt>{t('تاريخ الإضافة', 'Added')}</dt>
                      <dd>{date(contact.created_at)}</dd>
                    </div>
                    <div>
                      <dt>{t('آخر تحديث للملف', 'Profile updated')}</dt>
                      <dd>{date(contact.updated_at)}</dd>
                    </div>
                    <div>
                      <dt>{t('آخر تواصل', 'Last communication')}</dt>
                      <dd>
                        {date(
                          profile.timeline.conversations
                            .map((row) => row.last_message_at)
                            .filter(Boolean)
                            .sort()
                            .at(-1),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('المحادثات', 'Conversations')}</dt>
                      <dd>{profile.timeline.conversations.length}</dd>
                    </div>
                  </dl>
                </details>
                {canManage && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      if (!contact.archived_at && !window.confirm(t(
                        'أرشفة هذا العميل؟ يمكنك استعادته من الأرشيف.',
                        'Archive this customer? You can restore them from the archive.',
                      ))) return;
                      void run(() =>
                        api(`/crm/contacts/${contactId}/archive`, {
                          method: 'PATCH',
                          body: JSON.stringify({ archived: !contact.archived_at }),
                        }),
                      );
                    }}
                  >
                    {contact.archived_at
                      ? t('استعادة العميل', 'Restore customer')
                      : t('أرشفة العميل', 'Archive customer')}
                  </button>
                )}
                {contact.archived_at && onDeleted && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || overviewEditing}
                    onClick={() => {
                      if (!window.confirm(t(
                        'حذف هذا العميل نهائيًا؟ لا يمكن استعادته بعد الحذف.',
                        'Permanently delete this customer? This cannot be undone.',
                      ))) return;
                      void run(async () => {
                        try {
                          await api(`/crm/contacts/${contactId}`, { method: 'DELETE' });
                        } catch (error) {
                          if (error instanceof Error && error.message.includes('linked history'))
                            throw new Error(t(
                              'العميل له سجلات مرتبطة. يمكنك إبقاؤه في الأرشيف.',
                              'This customer has linked history. Keep the customer archived.',
                            ));
                          throw error;
                        }
                      }, onDeleted);
                    }}
                  >
                    {t('حذف العميل نهائيًا', 'Permanently delete customer')}
                  </button>
                )}
              </>
            )}
            {tab === 'agent' && (
              <form
                className={styles.form}
                key={contact.updated_at}
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get('owner');
                  void run(() => patch({ ownerId: String(value || '') || null }));
                }}
              >
                <h3>{t('مسؤول العميل', 'Customer owner')}</h3>
                {members.error && <p role="alert">{members.error}</p>}
                <label>
                  {t('الموظف', 'Agent')}
                  <select name="owner" defaultValue={contact.owner_id ?? ''} disabled={!canManage}>
                    <option value="">{t('غير معيّن', 'Unassigned')}</option>
                    {members.data.members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {t(
                    'هذا مسؤول ملف العميل؛ استلام المحادثة وتوزيعها يتمان من الوارد.',
                    'This owns the customer profile. Conversation takeover and assignment are managed in Inbox.',
                  )}
                </p>
                {canManage && (
                  <button className="btn btn-primary" disabled={busy}>
                    {t('حفظ الموظف', 'Save Agent')}
                  </button>
                )}
              </form>
            )}
            {tab === 'labels' && (
              <>
                <h3>{t('الوسوم', 'Labels')}</h3>
                <div className={styles.tags}>
                  {contact.tags.map((tag) => (
                    <span key={tag}>
                      {tag}
                      {canManage && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`${t('إزالة', 'Remove')} ${tag}`}
                          onClick={() =>
                            void run(() =>
                              patch({ tags: contact.tags.filter((value) => value !== tag) }),
                            )
                          }
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canManage && (
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const value = String(new FormData(form).get('tag') || '').trim();
                      if (value)
                        void run(async () => {
                          await patch({ tags: [...new Set([...contact.tags, value])] });
                          form.reset();
                        });
                    }}
                  >
                    <label>
                      {t('وسم جديد', 'New label')}
                      <input name="tag" required maxLength={50} />
                    </label>
                    <button className="btn" disabled={busy}>
                      {t('إضافة الوسم', 'Add Label')}
                    </button>
                  </form>
                )}
              </>
            )}
            {tab === 'lists' && (
              <>
                <h3>{t('قوائم العميل', 'Customer lists')}</h3>
                {lists.error && <p role="alert">{lists.error}</p>}
                {profile.lists.map((list) => (
                  <div className={styles.profileRow} key={list.id}>
                    <strong>{list.name}</strong>
                    {canManage && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            api(`/contact-lists/${list.id}/members/${contactId}`, {
                              method: 'DELETE',
                            }),
                          )
                        }
                      >
                        {t('إزالة', 'Remove')}
                      </button>
                    )}
                  </div>
                ))}
                {canManage && (
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const id = new FormData(event.currentTarget).get('list');
                      void run(() =>
                        api(`/contact-lists/${id}/members`, {
                          method: 'POST',
                          body: JSON.stringify({ contactId }),
                        }),
                      );
                    }}
                  >
                    <label>
                      {t('إضافة لقائمة', 'Add to list')}
                      <select name="list" required>
                        <option value="">{t('اختر قائمة', 'Select list')}</option>
                        {lists.data
                          .filter(
                            (list) => !profile.lists.some((current) => current.id === list.id),
                          )
                          .map((list) => (
                            <option key={list.id} value={list.id}>
                              {list.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="btn" disabled={busy}>
                      {t('إضافة للقائمة', 'Add to List')}
                    </button>
                  </form>
                )}
                <p>
                  {t(
                    'عضوية القائمة منفصلة عن موافقة التسويق.',
                    'List membership is separate from marketing consent.',
                  )}
                </p>
              </>
            )}
            {tab === 'sequences' && (
              <>
                <h3>{t('تسلسلات العميل', 'Customer sequences')}</h3>
                {sequences.error && <p role="alert">{sequences.error}</p>}
                {profile.sequences.map((sequence) => (
                  <div className={styles.profileRow} key={sequence.id}>
                    <div>
                      <strong>{sequence.name}</strong>
                      <p>
                        {statusLabel(sequence.status, t)} · {t('الخطوة', 'Step')}{' '}
                        {sequence.step_index + 1}
                      </p>
                      <small>
                        {date(sequence.next_run_at)}
                        {sequence.stop_reason ? ` · ${sequence.stop_reason}` : ''}
                      </small>
                    </div>
                    {canManage && sequence.status === 'active' && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            api(`/sequences/${sequence.id}/enrollments/${contactId}`, {
                              method: 'DELETE',
                            }),
                          )
                        }
                      >
                        {t('إيقاف للمشترك', 'Stop for subscriber')}
                      </button>
                    )}
                  </div>
                ))}
                {canManage && (
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const id = new FormData(event.currentTarget).get('sequence');
                      void run(() =>
                        api(`/sequences/${id}/enroll`, {
                          method: 'POST',
                          body: JSON.stringify({ contactId }),
                        }),
                      );
                    }}
                  >
                    <label>
                      {t('إضافة إلى تسلسل', 'Enroll in sequence')}
                      <select name="sequence" required>
                        <option value="">{t('اختر تسلسلًا', 'Select sequence')}</option>
                        {sequences.data
                          .filter(
                            (sequence) =>
                              sequence.status === 'active' &&
                              profile.channels.some(
                                (channel) => channel.id === sequence.channel_id,
                              ) &&
                              !profile.sequences.some(
                                (current) =>
                                  current.id === sequence.id && current.status === 'active',
                              ),
                          )
                          .map((sequence) => (
                            <option key={sequence.id} value={sequence.id}>
                              {sequence.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="btn" disabled={busy}>
                      {t('إضافة للتسلسل', 'Enroll')}
                    </button>
                  </form>
                )}
              </>
            )}
            {tab === 'input' && (
              <>
                <h3>{t('جلسات جمع البيانات', 'Input flow sessions')}</h3>
                {profile.inputs.map((input, index) => (
                  <article className={styles.profileRow} key={index}>
                    <div>
                      <strong>{input.name}</strong>
                      <small>
                        {statusLabel(input.status, t)} · {date(input.updated_at)}
                      </small>
                      <dl>
                        {Object.entries(input.answers ?? {}).map(([key, value]) => (
                          <div key={key}>
                            <dt>{fields.data.find((field) => field.key === key)?.label ?? key}</dt>
                            <dd>{renderAnswer(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </article>
                ))}
                {!profile.inputs.length && (
                  <p>{t('لا توجد جلسات مسجلة.', 'No recorded sessions.')}</p>
                )}
              </>
            )}
            {tab === 'fields' && (
              <form
                className={styles.form}
                key={contact.updated_at}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const attributes: Contact['attributes'] = {};
                  for (const field of fields.data) {
                    const value = form.get(field.key);
                    attributes[field.key] =
                      field.type === 'boolean'
                        ? value === 'on'
                        : value === ''
                          ? null
                          : field.type === 'number'
                            ? Number(value)
                            : String(value ?? '');
                  }
                  void run(() => patch({ attributes }));
                }}
              >
                <h3>{t('الحقول المخصصة', 'Custom Fields')}</h3>
                {fields.error && <p role="alert">{fields.error}</p>}
                {fields.data.map((field) => (
                  <label key={field.id}>
                    {field.label}
                    {field.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        name={field.key}
                        defaultChecked={contact.attributes[field.key] === true}
                        disabled={!canManage}
                      />
                    ) : (
                      <input
                        name={field.key}
                        type={
                          field.type === 'number'
                            ? 'number'
                            : field.type === 'date'
                              ? 'date'
                              : 'text'
                        }
                        defaultValue={String(contact.attributes[field.key] ?? '')}
                        disabled={!canManage}
                      />
                    )}
                  </label>
                ))}
                {!fields.data.length && (
                  <p>{t('لا توجد تعريفات حقول.', 'No custom field definitions.')}</p>
                )}
                {canManage && fields.data.length > 0 && (
                  <button className="btn btn-primary" disabled={busy}>
                    {t('حفظ الحقول', 'Save Fields')}
                  </button>
                )}
              </form>
            )}
            {tab === 'notes' && (
              <>
                <h3>{t('ملاحظات الفريق', 'Team Notes')}</h3>
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const text = new FormData(form).get('text');
                    void run(async () => {
                      await api(`/crm/contacts/${contactId}/notes`, {
                        method: 'POST',
                        body: JSON.stringify({ text }),
                      });
                      form.reset();
                    });
                  }}
                >
                  <label>
                    {t('ملاحظة داخلية', 'Internal note')}
                    <textarea ref={noteInput} name="text" required maxLength={4000} rows={3} />
                  </label>
                  <button className="btn" disabled={busy}>
                    {t('إضافة الملاحظة', 'Add Note')}
                  </button>
                </form>
                {profile.timeline.notes.map((note) => (
                  <article className={styles.note} key={note.id}>
                    <p>{note.body}</p>
                    <small>
                      {note.author} · {date(note.created_at)}
                    </small>
                  </article>
                ))}
              </>
            )}
            {tab === 'consent' && (
              <>
                <h3>{t('موافقة التسويق', 'Marketing Consent')}</h3>
                {profile.timeline.consent.map((consent) => (
                  <div className={styles.profileRow} key={consent.channel_id}>
                    <strong>{consent.channel_name}</strong>
                    <span>{statusLabel(consent.status, t)}</span>
                    <small>{consent.evidence}</small>
                  </div>
                ))}
                {canManage && (
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void run(() =>
                        api(`/crm/contacts/${contactId}/consent`, {
                          method: 'PUT',
                          body: JSON.stringify(Object.fromEntries(form)),
                        }),
                      );
                    }}
                  >
                    <label>
                      {t('الحساب', 'Account')}
                      <select name="channelId" required>
                        {consentChannels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('الحالة', 'Status')}
                      <select name="status">
                        <option value="opted_out">{t('إلغاء الموافقة', 'Opt out')}</option>
                        <option value="opted_in">{t('موافقة موثقة', 'Documented opt in')}</option>
                      </select>
                    </label>
                    <label>
                      {t('دليل الموافقة', 'Consent evidence')}
                      <input name="evidence" minLength={5} maxLength={1000} required />
                    </label>
                    <button className="btn" disabled={busy || !consentChannels.length}>
                      {t('حفظ الموافقة', 'Record Consent')}
                    </button>
                  </form>
                )}
              </>
            )}
            {tab === 'activity' && (
              <>
                <ContactActivityExport key={contactId} contactId={contactId} />
                <div className={premium.timeline}>
                  {activity.map((e) => (
                    <article key={e.id}>
                      <time>{date(e.at)}</time>
                      <strong>{e.title}</strong>
                      <span>{e.body}</span>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function CompanyContacts({
  contact,
  canManage,
  save,
}: {
  contact: Contact;
  canManage: boolean;
  save: (company: string) => Promise<void>;
}) {
  const { t } = useLocale();
  const company = typeof contact.attributes.company === 'string' ? contact.attributes.company : '';
  const related = useData<{ id: string; name: string }[]>(
    company ? '/crm/workspace/company-contacts?' + new URLSearchParams({ company }) : null,
    [],
  );
  return (
    <section>
      <p>
        {t(
          'اختياري للشركات التي تتعامل مع شركات أخرى.',
          'Optional for businesses selling to other companies.',
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(String(new FormData(e.currentTarget).get('company') || '').trim());
        }}
      >
        <label>
          {t('اسم الشركة', 'Company name')}
          <input
            key={company}
            name="company"
            defaultValue={company}
            maxLength={200}
            disabled={!canManage}
          />
        </label>
        {canManage && (
          <button className="btn" type="submit">
            {t('حفظ الشركة', 'Save company')}
          </button>
        )}
      </form>
      <h3>{t('عملاء الشركة', 'Company contacts')}</h3>
      {related.error && <p role="alert">{related.error}</p>}
      {related.data.map((c) => (
        <p key={c.id}>
          <a href={`/dashboard/crm?contact=${c.id}`}>{c.name}</a>
        </p>
      ))}
    </section>
  );
}

function renderAnswer(value: unknown): React.ReactNode {
  if (Array.isArray(value))
    return (
      <ul>
        {value.map((item, index) => (
          <li key={index}>{renderAnswer(item)}</li>
        ))}
      </ul>
    );
  if (value && typeof value === 'object')
    return (
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{renderAnswer(item)}</dd>
          </div>
        ))}
      </dl>
    );
  return String(value ?? '—');
}
