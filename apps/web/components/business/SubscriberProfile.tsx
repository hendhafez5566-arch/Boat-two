'use client';
import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { statusLabel } from '../product/status';
import { ContactActivityExport } from './ContactActivityExport';
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
  canManage,
  onClose,
  onChanged,
}: {
  contactId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, language } = useLocale();
  const data = useData<Profile | null>(`/crm/contacts/${contactId}/profile`, null);
  const members = useData<{ members: { user_id: string; full_name: string }[] }>(
    canManage ? '/team' : null,
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
  const [tab, setTab] = useState('overview'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const lock = useRef(false);
  const profile = data.data,
    contact = profile?.contact;
  async function run(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await data.reload();
      onChanged();
      setNotice(t('حُفظ التغيير.', 'Changes saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const patch = (change: Partial<Contact> & { ownerId?: string | null }) =>
    api(`/crm/contacts/${contactId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ ...change, expectedUpdatedAt: contact?.updated_at }),
    });
  const date = (value?: string | null) =>
    value ? new Date(value).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB') : '—';
  function saveOverview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() =>
      patch({
        name: String(form.get('name')).trim(),
        phone: String(form.get('phone') || '') || null,
        email: String(form.get('email') || '') || null,
      }),
    );
  }
  return (
    <aside className={styles.profile} aria-label={t('ملف المشترك', 'Subscriber profile')}>
      <header className={styles.profileHeader}>
        <span className={styles.avatar}>{contact?.name?.slice(0, 2) || '?'}</span>
        <div>
          <h2>{contact?.name || t('ملف المشترك', 'Subscriber profile')}</h2>
          <p dir="ltr">{contact?.phone || contact?.email || '—'}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          aria-label={t('إغلاق ملف المشترك', 'Close subscriber profile')}
        >
          ×
        </button>
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
            <span className={styles.pill}>{statusLabel(contact.lifecycle, t)}</span>
            <span>{contact.archived_at ? t('مؤرشف', 'Archived') : t('نشط', 'Retained')}</span>
            <small>
              {t('منذ', 'Since')} {date(contact.created_at)}
            </small>
          </div>
          <div className={styles.profileChannels}>
            {profile.channels.map((channel) => (
              <span key={channel.id}>
                {channel.type} · {channel.name}
              </span>
            ))}
          </div>
          <nav
            className={styles.profileTabs}
            aria-label={t('أقسام ملف المشترك', 'Subscriber profile sections')}
          >
            {tabs.map(([key, ar, en]) => (
              <button
                type="button"
                key={key}
                aria-pressed={tab === key}
                onClick={() => {
                  setTab(key);
                  setError('');
                  setNotice('');
                }}
              >
                {t(ar, en)}
              </button>
            ))}
          </nav>
          <div className={styles.profileBody}>
            {tab === 'overview' && (
              <>
                <form className={styles.form} key={contact.updated_at} onSubmit={saveOverview}>
                  <h3>{t('عن المشترك', 'About')}</h3>
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
                </form>
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
                  <p>{t('لا توجد محادثات.', 'No conversations.')}</p>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api(`/crm/contacts/${contactId}/archive`, {
                          method: 'PATCH',
                          body: JSON.stringify({ archived: !contact.archived_at }),
                        }),
                      )
                    }
                  >
                    {contact.archived_at
                      ? t('استعادة المشترك', 'Restore subscriber')
                      : t('أرشفة المشترك', 'Archive subscriber')}
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
                <h3>{t('مسؤول المشترك', 'Subscriber owner')}</h3>
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
                <h3>{t('قوائم المشترك', 'Subscriber lists')}</h3>
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
                <h3>{t('تسلسلات المشترك', 'Subscriber sequences')}</h3>
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
                            <dd>
                              {typeof value === 'object'
                                ? JSON.stringify(value)
                                : String(value ?? '—')}
                            </dd>
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
                {profile.timeline.notes.map((note) => (
                  <article className={styles.note} key={note.id}>
                    <p>{note.body}</p>
                    <small>
                      {note.author} · {date(note.created_at)}
                    </small>
                  </article>
                ))}
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
                    <textarea name="text" required maxLength={4000} rows={3} />
                  </label>
                  <button className="btn" disabled={busy}>
                    {t('إضافة الملاحظة', 'Add Note')}
                  </button>
                </form>
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
                        {profile.channels.map((channel) => (
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
                    <button className="btn" disabled={busy || !profile.channels.length}>
                      {t('حفظ الموافقة', 'Record Consent')}
                    </button>
                  </form>
                )}
              </>
            )}
            {tab === 'activity' && (
              <>
                <ContactActivityExport key={contactId} contactId={contactId} />
                {profile.timeline.events.map((event) => (
                  <div className={styles.profileRow} key={event.id}>
                    <time>{date(event.created_at)}</time>
                    <span>{event.type}</span>
                    <small>{statusLabel(event.status, t)}</small>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
