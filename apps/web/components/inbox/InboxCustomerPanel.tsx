'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LabelEditor } from '../product/LabelEditor';
import { collectContactLabels } from '../../lib/contact-labels';
import { InboxCrmOverview } from './InboxCrmOverview';
import { InboxFieldDialog } from './InboxFieldDialog';
import { InboxSequences } from './InboxSequences';
import { type ContactField } from '../../lib/inbox-contact-fields';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './inbox-customer-panel.module.css';
type Props = {
  detail: any;
  notesVersion: number;
  team: any[];
  acting: boolean;
  canManage: boolean;
  act: (path: string, method: string, body?: any, notice?: string) => Promise<boolean>;
  onNoteChanged: (source: string, id?: string, text?: string) => void;
  onFollowup: () => void;
  onEditEmail: () => void;
  refreshToken: number;
  onRefresh: () => Promise<void>;
  onError: (error: string) => void;
};
export function InboxCustomerPanel({
  detail,
  notesVersion,
  team,
  acting,
  canManage,
  act,
  onNoteChanged,
  onFollowup,
  onEditEmail,
  refreshToken,
  onRefresh,
  onError,
}: Props) {
  const { t, language } = useLocale();
  function formatNote(body: string) {
    const prefix = 'Catalog inquiry: ';
    if (!body.startsWith(prefix)) return body;
    try {
      const selection = JSON.parse(body.slice(prefix.length));
      const name = typeof selection?.name === 'string' ? selection.name : '';
      const category = typeof selection?.category === 'string' ? selection.category : '';
      return name
        ? [t('استفسار عن برنامج', 'Catalog inquiry'), name, category].filter(Boolean).join(' · ')
        : body;
    } catch {
      return body;
    }
  }
  const panel = useRef<HTMLElement>(null);
  function jump(target: string) {
    const element = panel.current?.querySelector<HTMLElement>(`[data-inbox-target="${target}"]`);
    if (!element) return;
    const section = element.closest('details');
    if (section) section.open = true;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element.focus({ preventScroll: true });
  }
  const profile = useData<any>(`/crm/contacts/${detail.contact_id}/profile`, null);
  const lists = useData<any[]>(canManage ? '/contact-lists' : null, []);
  useEffect(() => {
    if (refreshToken) void profile.reload();
  }, [refreshToken, profile.reload]);
  const fields = useData<ContactField[]>('/crm/fields', []);
  const [editingField, setEditingField] = useState<ContactField | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [listName, setListName] = useState('');
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<string[]>(detail.contact_tags || []);
  const [labelText, setLabelText] = useState('');
  const [labelsDirty, setLabelsDirty] = useState(false);
  const [labelsVersion, setLabelsVersion] = useState('');
  const [labelError, setLabelError] = useState('');
  const [labelNotice, setLabelNotice] = useState('');
  const contact = profile.data?.contact;
  const timeline = profile.data?.timeline;
  useEffect(() => {
    if (!contact || labelsDirty) return;
    setLabels(contact.tags || []);
    setLabelsVersion(contact.updated_at);
  }, [contact, labelsDirty]);
  const notes = useData<any[]>(`/conversations/${detail.id}/notes`, []);
  const reloadNotes = notes.reload;
  useEffect(() => {
    if (notesVersion) void reloadNotes();
  }, [notesVersion, reloadNotes]);
  const allNotes = [
    ...notes.data.map((note) => ({
      id: String(note.id),
      source: 'message',
      text: note.content?.text || note.text || note.body,
      date: note.created_at || note.createdAt,
    })),
    ...(timeline?.notes || []).map((note: any) => ({
      id: String(note.id),
      source: 'contact',
      text: note.content?.text || note.text || note.body,
      date: note.created_at || note.createdAt,
    })),
  ].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const [noteDraft, setNoteDraft] = useState<{ source: string; id: string; text: string } | null>(
    null,
  );
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState('');
  const notesSection = useRef<HTMLDetailsElement>(null);
  const addNote = () => {
    setNoteError('');
    setNoteDraft({ source: 'message', id: '', text: '' });
    if (notesSection.current) {
      notesSection.current.open = true;
      notesSection.current.scrollIntoView({ block: 'nearest' });
    }
  };

  async function changeNote(source: string, id: string, text?: string) {
    const path = `/conversations/${detail.id}/notes` + (id ? `/${source}/${id}` : '');
    setNoteBusy(true);
    setNoteError('');
    try {
      await api(path, {
        method: text === undefined ? 'DELETE' : id ? 'PATCH' : 'POST',
        body: text === undefined ? undefined : JSON.stringify({ text }),
      });
      onNoteChanged(source, id, text);
      if (text !== undefined || (noteDraft?.id === id && noteDraft.source === source)) {
        setNoteDraft(null);
      }
    } catch (error) {
      setNoteError((error as Error).message);
    } finally {
      setNoteBusy(false);
    }
  }

  const patch = (body: any, notice: string) =>
    act(`/conversations/${detail.id}`, 'PATCH', body, notice);
  const time = (value: string) =>
    value ? new Date(value).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : '—';
  const expired =
    detail.channel_type === 'whatsapp' &&
    (!detail.whatsapp_window_expires_at ||
      new Date(detail.whatsapp_window_expires_at) <= new Date());
  async function assignList(id: string) {
    if (!canManage || listBusy || !id) return;
    setListBusy(true);
    try {
      await api(`/contact-lists/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ contactId: detail.contact_id }),
      });
      await profile.reload();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setListBusy(false);
    }
  }
  async function removeList(id: string) {
    if (!canManage || listBusy) return;
    setListBusy(true);
    try {
      await api(`/contact-lists/${id}/members/${detail.contact_id}`, { method: 'DELETE' });
      await profile.reload();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setListBusy(false);
    }
  }
  async function createList() {
    if (!canManage || listBusy || !listName.trim()) return;
    setListBusy(true);
    try {
      const list = await api<any>('/contact-lists', {
        method: 'POST',
        body: JSON.stringify({ name: listName.trim() }),
      });
      await api(`/contact-lists/${list.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ contactId: detail.contact_id }),
      });
      setListName('');
      await Promise.all([profile.reload(), lists.reload()]);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setListBusy(false);
    }
  }
  async function saveTags(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !contact || saving) return;

    setSaving(true);
    setLabelError('');
    setLabelNotice('');
    try {
      const next = collectContactLabels(labels, labelText);
      await api(`/crm/contacts/${detail.contact_id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          tags: next,
          expectedUpdatedAt: labelsVersion,
        }),
      });
      setLabels(next);
      setLabelText('');
      setLabelsDirty(false);
      setLabelNotice(t('تم حفظ الوسوم.', 'Labels saved.'));
      await profile.reload();
      await onRefresh();
    } catch (error) {
      const code = (error as Error).message;
      setLabelError(
        code === 'LABEL_COUNT'
          ? t('الحد الأقصى 30 وسمًا.', 'Use up to 30 labels.')
          : code === 'LABEL_LENGTH'
            ? t('اسم الوسم لا يتجاوز 50 حرفًا.', 'Labels must be 50 characters or fewer.')
            : code.includes('changed')
              ? t(
                  'تغيّرت الوسوم منذ بدء التعديل. أعد تحميلها قبل الحفظ لحماية تعديلات الفريق.',
                  'Labels changed since you started editing. Reload them before saving to protect your teammates’ changes.',
                )
              : code,
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside
      ref={panel}
      className={`customer-panel ${styles.panel}`}
      aria-label={t('إجراءات المحادثة وبيانات العميل', 'Chat actions and customer details')}
    >
      <header className={styles.heading}>
        <h2>{t('إجراءات المحادثة', 'Chat Actions')}</h2>
        <Link
          href="/dashboard/crm/notifications"
          aria-label={t('تنبيهات CRM', 'CRM notifications')}
        >
          <NavIcon name="bell" />
        </Link>
        <Link href={`/dashboard/crm?contact=${detail.contact_id}`}>
          <NavIcon name="user" />
          {t('مدير المشترك', 'Manager')}
        </Link>
      </header>
      {profile.error && <p role="alert">{profile.error}</p>}
      <details open ref={notesSection} className={`${styles.card} ${styles.notesCard}`}>
        <summary>
          <span>
            {t('الملاحظات الداخلية', 'Internal notes')}
            <span className={styles.noteCount}>{allNotes.length}</span>
          </span>
          <NavIcon name="chevron" />
        </summary>
        <div className={styles.noteControls}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={addNote}
            disabled={noteBusy || !!noteDraft}
          >
            <NavIcon name="plus" />
            {t('إضافة ملاحظة', 'Add note')}
          </button>
        </div>
        {(notes.error || noteError) && (
          <p className={styles.noteControls} role="alert">
            {noteError || notes.error}
          </p>
        )}
        {noteDraft && (
          <form
            className={styles.noteEditor}
            onSubmit={(event) => {
              event.preventDefault();
              const text = noteDraft.text.trim();
              if (text && !noteBusy) void changeNote(noteDraft.source, noteDraft.id, text);
            }}
          >
            <label className="field">
              {noteDraft.id
                ? t('تعديل الملاحظة', 'Edit note')
                : t('ملاحظة للفريق', 'Note for your team')}
              <textarea
                autoFocus
                rows={4}
                maxLength={2000}
                value={noteDraft.text}
                onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })}
              />
            </label>
            <div className={styles.noteActions}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={noteBusy || !noteDraft.text.trim()}
              >
                {t('حفظ الملاحظة', 'Save note')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={noteBusy}
                onClick={() => {
                  setNoteDraft(null);
                  setNoteError('');
                }}
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        )}
        {allNotes.length ? (
          <ol
            className={styles.noteList}
            tabIndex={0}
            aria-label={t('سجل الملاحظات', 'Note history')}
          >
            {allNotes.map((note) => (
              <li key={note.source + note.id}>
                <time dateTime={note.date}>{time(note.date)}</time>
                <p dir="auto">{formatNote(note.text || '')}</p>
                <div className={styles.noteActions}>
                  <button
                    type="button"
                    className="btn"
                    disabled={noteBusy || !!noteDraft}
                    onClick={() => {
                      setNoteError('');
                      setNoteDraft({ source: note.source, id: note.id, text: note.text || '' });
                      notesSection.current?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {t('تعديل', 'Edit')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={noteBusy}
                    data-tone="danger"
                    onClick={() => {
                      if (window.confirm(t('حذف هذه الملاحظة؟', 'Delete this note?'))) {
                        void changeNote(note.source, note.id);
                      }
                    }}
                  >
                    {t('حذف', 'Delete')}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.notesEmpty}>
            {notes.loading
              ? t('جارٍ تحميل الملاحظات…', 'Loading notes…')
              : t('لا توجد ملاحظات بعد', 'No notes yet')}
          </p>
        )}
      </details>
      <section className={styles.card}>
        <h3>{t('إجراءات سريعة', 'Quick Actions')}</h3>
        <div className={styles.quick}>
          <button
            type="button"
            disabled={acting}
            onClick={() =>
              void act(
                `/conversations/${detail.id}/${detail.handled_by === 'bot' ? 'takeover' : 'release'}`,
                'POST',
                undefined,
                t('تم تحديث إدارة المحادثة.', 'Conversation handling updated.'),
              )
            }
          >
            <span className={styles.green}>
              <NavIcon name="agents" />
            </span>
            {detail.handled_by === 'bot'
              ? t('إيقاف البوت', 'Pause Bot')
              : t('استئناف البوت', 'Resume Bot')}
          </button>
          <button type="button" onClick={addNote} disabled={noteBusy || !!noteDraft}>
            <span>
              <NavIcon name="audit" />
            </span>
            {t('ملاحظات', 'Notes')}
          </button>
          {more && (
            <>
              <button type="button" onClick={onFollowup}>
                <span>
                  <NavIcon name="calendar" />
                </span>
                {t('متابعة', 'Follow-up')}
              </button>
              {[
                ['labels', 'star', t('إضافة وسم', 'Add Label')],
                ['agent', 'user', t('تعيين فريق', 'Assign Team')],
                ['sequence', 'sequences', t('إضافة تسلسل', 'Add Sequence')],
                ['custom', 'audit', t('حقل مخصص', 'Custom Field')],
                ['window', 'sessions', t('نافذة الرسائل', 'Messaging Window')],
              ].map(([target, icon, label]) => (
                <button type="button" key={target} onClick={() => jump(target)}>
                  <span>
                    <NavIcon name={icon} />
                  </span>
                  {label}
                </button>
              ))}
            </>
          )}
          <button type="button" aria-expanded={more} onClick={() => setMore((value) => !value)}>
            <span>
              <NavIcon name={more ? 'chevron' : 'more'} />
            </span>
            {more ? t('عرض أقل', 'See Less') : t('المزيد', 'See More')}
          </button>
        </div>
      </section>
      <InboxCrmOverview
        contact={contact}
        deals={timeline?.deals || []}
        team={team}
        canManage={canManage}
        onSaved={async () => {
          await profile.reload();
          await onRefresh();
        }}
      />
      <section className={styles.card}>
        <h3>
          {t('ملخص العميل', 'Customer Snapshot')}{' '}
          <span
            className="semantic-state"
            data-tone={
              detail.status === 'open'
                ? 'active'
                : detail.status === 'closed'
                  ? 'danger'
                  : 'pending'
            }
          >
            {detail.status === 'open'
              ? t('محادثة مفتوحة', 'Open conversation')
              : detail.status === 'closed'
                ? t('محادثة مغلقة', 'Closed conversation')
                : t('محادثة معلّقة', 'Pending conversation')}
          </span>
        </h3>
        <dl className={styles.facts}>
          {[
            [t('البريد الإلكتروني', 'Email'), detail.contact_email || t('غير محدد', 'Not set')],
            [t('آخر ظهور', 'Last Seen'), time(detail.last_inbound_at)],
            [t('اسم البوت', 'Bot Name'), detail.channel_name],
            [
              t('الحالة', 'Status'),
              timeline?.consent?.find((row: any) => row.channel_id === detail.channel_id)
                ?.status === 'opted_in'
                ? t('مشترك', 'Subscribed')
                : timeline?.consent?.find((row: any) => row.channel_id === detail.channel_id)
                      ?.status === 'opted_out'
                  ? t('غير مشترك', 'Unsubscribed')
                  : '—',
            ],
            [
              t('نافذة الرسائل', 'Messaging Window'),
              detail.channel_type === 'whatsapp'
                ? expired
                  ? t('خارج نافذة 24 ساعة', 'Outside 24H Window')
                  : t('نافذة الرد مفتوحة', 'Reply window open')
                : t('حسب سياسة القناة', 'Channel policy'),
            ],
            [t('مصدر الاشتراك', 'OPT-IN Through'), contact?.attributes?.opt_in_through || '—'],
          ].map(([label, value], index) => (
            <div
              key={label}
              data-inbox-target={index === 4 ? 'window' : undefined}
              tabIndex={index === 4 ? -1 : undefined}
            >
              <dt>
                <NavIcon name={['mail', 'eye', 'agents', 'user', 'sessions', 'logout'][index]} />
                {label}
              </dt>
              <dd>
                {value ?? '—'}
                {index === 0 && canManage && (
                  <button
                    type="button"
                    className={styles.inlineEdit}
                    aria-label={t('تعديل البريد الإلكتروني', 'Edit Email')}
                    onClick={onEditEmail}
                  >
                    <NavIcon name="edit" />
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <details open className={styles.card}>
        <summary>
          {t('الأتمتة والتدفق', 'Automation & Flow')}
          <NavIcon name="chevron" />
        </summary>
        <div className={styles.fields}>
          <label>
            {t('الموظف المسؤول', 'Assigned Agent')}
            <select
              data-inbox-target="agent"
              disabled={acting}
              value={detail.assigned_to || ''}
              onChange={(e) =>
                void patch(
                  { assignedTo: e.target.value || null },
                  t('تم تحديث الموظف.', 'Assignee updated.'),
                )
              }
            >
              <option value="">{t('اختر موظفًا', 'Select Agent')}</option>
              {team.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={saveTags}>
            <LabelEditor
              value={labels}
              pending={labelText}
              onPending={(value) => {
                setLabelText(value);
                setLabelsDirty(true);
                setLabelNotice('');
              }}
              onChange={(value) => {
                setLabels(value);
                setLabelsDirty(true);
                setLabelNotice('');
              }}
              disabled={!canManage || !contact || saving}
              target="labels"
            />
            {labelError && <p role="alert">{labelError}</p>}
            {labelNotice && <p role="status">{labelNotice}</p>}
            {labelError && (
              <button
                type="button"
                className={styles.secondary}
                disabled={saving}
                onClick={async () => {
                  await profile.reload();
                  setLabelsDirty(false);
                  setLabelText('');
                  setLabelError('');
                }}
              >
                {t('إعادة تحميل الوسوم', 'Reload labels')}
              </button>
            )}
            <button
              className={styles.secondary}
              disabled={!canManage || !contact || saving || !labelsDirty}
            >
              {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الوسوم', 'Save labels')}
            </button>
          </form>
          <div>
            <span>{t('قوائم المشتركين', 'Lists')}</span>
            <div className={styles.chips}>
              {profile.data?.lists?.length ? (
                profile.data.lists.map((list: any) => (
                  <span key={list.id}>
                    {list.name}
                    {canManage && (
                      <button
                        type="button"
                        className={styles.inlineEdit}
                        disabled={listBusy}
                        aria-label={`${t('إزالة من القائمة', 'Remove from list')} ${list.name}`}
                        onClick={() => void removeList(list.id)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))
              ) : (
                <small>{t('لا توجد قوائم', 'No lists assigned')}</small>
              )}
            </div>
            {canManage && (
              <div className={styles.listControls}>
                {lists.error && <small role="alert">{lists.error}</small>}
                <select
                  aria-label={t('إضافة إلى قائمة', 'Add to list')}
                  value=""
                  disabled={listBusy || lists.loading}
                  onChange={(event) => void assignList(event.target.value)}
                >
                  <option value="">{t('اختر قائمة', 'Select a list')}</option>
                  {(lists.data || [])
                    .filter(
                      (list) =>
                        !profile.data?.lists?.some((assigned: any) => assigned.id === list.id),
                    )
                    .map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                </select>
                <input
                  aria-label={t('قائمة جديدة', 'New list')}
                  value={listName}
                  disabled={listBusy}
                  maxLength={120}
                  placeholder={t(
                    'اكتب اسمًا واضغط Enter لإنشاء قائمة',
                    'Type a name and hit Enter to create a list',
                  )}
                  onChange={(event) => setListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void createList();
                    }
                  }}
                />
              </div>
            )}
          </div>
          <InboxSequences
            contactId={detail.contact_id}
            channelId={detail.channel_id}
            assigned={profile.data?.sequences || []}
            canManage={canManage}
            onSaved={async () => {
              await profile.reload();
            }}
          />
          <label>
            {t('تعيين حقل مخصص', 'Assign Custom Fields')}
            <select
              data-inbox-target="custom"
              value=""
              disabled={!canManage || fields.loading || !contact}
              onChange={(event) =>
                setEditingField(
                  fields.data.find((field) => field.key === event.target.value) || null,
                )
              }
            >
              <option value="">{t('اختر حقلًا مخصصًا', 'Select Custom Field')}</option>
              {fields.data.map((field) => (
                <option key={field.id} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
          {fields.error && <small role="alert">{fields.error}</small>}
        </div>
      </details>
      <details open className={styles.card}>
        <summary>
          {t('الحقول المخصصة', 'Custom Fields')}
          <NavIcon name="chevron" />
        </summary>
        <dl className={styles.facts}>
          {fields.data
            .filter((field) => contact?.attributes?.[field.key] != null)
            .map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  {typeof contact.attributes[field.key] === 'boolean'
                    ? contact.attributes[field.key]
                      ? t('نعم', 'Yes')
                      : t('لا', 'No')
                    : String(contact.attributes[field.key])}
                  {canManage && (
                    <button
                      type="button"
                      className={styles.inlineEdit}
                      aria-label={`${t('تعديل', 'Edit')} ${field.label}`}
                      onClick={() => setEditingField(field)}
                    >
                      <NavIcon name="edit" />
                    </button>
                  )}
                </dd>
              </div>
            ))}
          {!fields.data.some((field) => contact?.attributes?.[field.key] != null) && (
            <p>
              {fields.loading || profile.loading
                ? t('جارٍ التحميل…', 'Loading…')
                : t('لا توجد حقول مخصصة', 'No custom fields assigned')}
            </p>
          )}
        </dl>
      </details>
      <details open className={styles.card}>
        <summary>
          {t('سجل المتابعات', 'Follow-up History')} ({timeline?.tasks?.length || 0})
          <button
            type="button"
            className={styles.addFollowup}
            onClick={(event) => {
              event.preventDefault();
              onFollowup();
            }}
          >
            + {t('إضافة', 'Add')}
          </button>
          <NavIcon name="chevron" />
        </summary>
        <div className={styles.fields}>
          {timeline?.tasks?.length ? (
            timeline.tasks.map((task: any) => (
              <p key={task.id}>
                {task.title} · {task.due_at ? time(task.due_at) : '—'} · {task.status}
              </p>
            ))
          ) : (
            <p>{t('لا توجد متابعات', 'No follow-up history')}</p>
          )}
        </div>
      </details>
      <InboxFieldDialog
        field={editingField}
        contactId={detail.contact_id}
        onClose={() => setEditingField(null)}
        onSaved={async () => {
          await profile.reload();
          await onRefresh();
        }}
      />
    </aside>
  );
}
