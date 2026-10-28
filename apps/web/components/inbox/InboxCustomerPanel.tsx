'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  notes: any[];
  team: any[];
  departments: any[];
  acting: boolean;
  canManage: boolean;
  act: (path: string, method: string, body?: any, notice?: string) => Promise<boolean>;
  onNote: () => void;
  onFollowup: () => void;
  onEditEmail: () => void;
  refreshToken: number;
  onRefresh: () => Promise<void>;
  onError: (error: string) => void;
};
export function InboxCustomerPanel({
  detail,
  notes,
  team,
  departments,
  acting,
  canManage,
  act,
  onNote,
  onFollowup,
  onEditEmail,
  refreshToken,
  onRefresh,
  onError,
}: Props) {
  const { t, language } = useLocale();
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
  const contact = profile.data?.contact;
  const timeline = profile.data?.timeline;
  const allNotes = [...notes, ...(timeline?.notes || [])];
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
    try {
      await api(`/crm/contacts/${detail.contact_id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          tags: [...new Set([...labels, labelText.trim()].filter(Boolean))],
          expectedUpdatedAt: contact.updated_at,
        }),
      });
      setLabels([...new Set([...labels, labelText.trim()].filter(Boolean))]);
      setLabelText('');
      await profile.reload();
      await onRefresh();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside
      className={`customer-panel ${styles.panel}`}
      aria-label={t('إجراءات المحادثة وبيانات العميل', 'Chat actions and customer details')}
    >
      <header className={styles.heading}>
        <h2>{t('إجراءات المحادثة', 'Chat Actions')}</h2>
        <Link href={`/dashboard/crm?contact=${detail.contact_id}`}>
          <NavIcon name="user" />
          {t('مدير المشترك', 'Manager')}
        </Link>
      </header>
      {profile.error && <p role="alert">{profile.error}</p>}
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
          <button type="button" onClick={onFollowup}>
            <span>
              <NavIcon name="calendar" />
            </span>
            {t('متابعة', 'Follow-up')}
          </button>
          <button type="button" onClick={onNote}>
            <span>
              <NavIcon name="audit" />
            </span>
            {t('ملاحظات', 'Notes')}
          </button>
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            <span>
              <NavIcon name="more" />
            </span>
            {t('المزيد', 'See More')}
          </button>
        </div>
        {more && (
          <div className={styles.actions}>
            <button
              disabled={acting}
              onClick={() =>
                void patch(
                  { important: !detail.important },
                  t('تم تحديث الأهمية.', 'Importance updated.'),
                )
              }
            >
              <NavIcon name="star" />
              {detail.important
                ? t('إزالة الأهمية', 'Remove Important')
                : t('تمييز كمهمة', 'Mark Important')}
            </button>
            <button
              disabled={acting}
              onClick={() =>
                void patch(
                  { archived: !detail.archived_at },
                  t('تم تحديث الأرشفة.', 'Archive updated.'),
                )
              }
            >
              <NavIcon name="archive" />
              {detail.archived_at ? t('استعادة', 'Unarchive') : t('أرشفة', 'Archive')}
            </button>
            <button
              disabled={acting}
              onClick={() =>
                void patch({ blocked: !detail.blocked }, t('تم تحديث الحظر.', 'Block updated.'))
              }
            >
              <NavIcon name="blocked" />
              {detail.blocked ? t('إلغاء الحظر', 'Unblock') : t('حظر', 'Block')}
            </button>
            <button
              disabled={acting}
              onClick={() =>
                void patch(
                  { status: detail.status === 'closed' ? 'open' : 'closed' },
                  t('تم تحديث حالة المحادثة.', 'Conversation status updated.'),
                )
              }
            >
              <NavIcon name="check" />
              {detail.status === 'closed' ? t('إعادة فتح', 'Reopen') : t('حل المحادثة', 'Resolve')}
            </button>
            <button
              disabled={acting}
              onClick={() =>
                void patch(
                  { status: detail.status === 'pending' ? 'open' : 'pending' },
                  t('تم تحديث التعليق.', 'Hold updated.'),
                )
              }
            >
              {detail.status === 'pending'
                ? t('إلغاء التعليق', 'Remove hold')
                : t('تعليق', 'Put on hold')}
            </button>
            <button
              className={styles.secondary}
              disabled={acting}
              onClick={() =>
                void act(
                  `/conversations/${detail.id}/auto-assign`,
                  'POST',
                  undefined,
                  t('تم التوزيع التلقائي.', 'Auto assigned.'),
                )
              }
            >
              {t('توزيع تلقائي', 'Auto assign')}
            </button>
            <div className={styles.fields}>
              {' '}
              <label>
                {t('القسم', 'Department')}
                <select
                  disabled={acting}
                  value={detail.department_id || ''}
                  onChange={(e) =>
                    void patch(
                      { departmentId: e.target.value || null },
                      t('تم تحديث القسم.', 'Department updated.'),
                    )
                  }
                >
                  <option value="">{t('غير معيّن', 'Unassigned')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
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
        <h3>{t('ملخص العميل', 'Customer Snapshot')}</h3>
        <dl className={styles.facts}>
          {[
            [t('البريد الإلكتروني', 'Email'), detail.contact_email || t('غير محدد', 'Not set')],
            [t('الهاتف', 'Phone'), detail.contact_phone],
            [t('آخر ظهور', 'Last Seen'), time(detail.last_inbound_at)],
            [t('اسم البوت', 'Bot Name'), detail.channel_name],
            [
              t('الحالة', 'Status'),
              detail.status === 'closed'
                ? t('محلولة', 'Resolved')
                : detail.status === 'pending'
                  ? t('معلقة', 'Pending')
                  : t('مفتوحة', 'Open'),
            ],
            [
              t('نافذة الرسائل', 'Messaging Window'),
              detail.channel_type === 'whatsapp'
                ? expired
                  ? t('خارج نافذة 24 ساعة', 'Outside 24H Window')
                  : t('نافذة الرد مفتوحة', 'Reply window open')
                : t('حسب سياسة القناة', 'Channel policy'),
            ],
          ].map(([label, value], index) => (
            <div key={label}>
              <dt>
                <NavIcon name={['mail', 'phone', 'eye', 'agents', 'user', 'sessions'][index]} />
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
            <label>
              {t('الوسوم', 'Labels')}
              <div className={styles.labelEditor}>
                {labels.map((label) => (
                  <span key={label}>
                    {label}
                    <button
                      type="button"
                      disabled={!canManage || saving}
                      aria-label={`${t('إزالة الوسم', 'Remove label')} ${label}`}
                      onClick={() => setLabels(labels.filter((value) => value !== label))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  name="tags"
                  disabled={!canManage || saving || labels.length >= 30}
                  value={labelText}
                  onChange={(event) => setLabelText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (!labelText.trim() || labels.length >= 30) return;
                    setLabels([...new Set([...labels, labelText.trim()])]);
                    setLabelText('');
                  }}
                  placeholder={t(
                    'اكتب اسمًا واضغط Enter لإضافة وسم',
                    'Type a name and hit Enter to add a label',
                  )}
                  maxLength={50}
                />
              </div>
            </label>
            <button className={styles.secondary} disabled={!canManage || !contact || saving}>
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
      <details open className={styles.card}>
        <summary>
          {t('ملاحظات', 'Notes')} ({allNotes.length || 0})<NavIcon name="chevron" />
        </summary>
        <div className={styles.fields}>
          {allNotes.length ? (
            allNotes.map((note: any) => (
              <p key={note.id}>
                {note.content?.text || note.text || note.body}{' '}
                <small>{time(note.created_at)}</small>
              </p>
            ))
          ) : (
            <p>{t('لا توجد ملاحظات بعد', 'No notes yet')}</p>
          )}
          <button className={styles.secondary} onClick={onNote}>
            {t('إضافة ملاحظة داخلية', 'Add internal note')}
          </button>
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
