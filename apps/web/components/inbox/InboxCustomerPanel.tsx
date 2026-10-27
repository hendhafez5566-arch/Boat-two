'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import Link from 'next/link';
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
  onRefresh,
  onError,
}: Props) {
  const { t, language } = useLocale();
  const profile = useData<any>(`/crm/contacts/${detail.contact_id}/profile`, null);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const contact = profile.data?.contact;
  const timeline = profile.data?.timeline;
  const allNotes = [...notes, ...(timeline?.notes || [])];
  const deal = timeline?.deals?.find((row: any) => !['won', 'lost'].includes(row.status));
  const patch = (body: any, notice: string) =>
    act(`/conversations/${detail.id}`, 'PATCH', body, notice);
  const time = (value: string) =>
    value ? new Date(value).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : '—';
  const expired =
    detail.channel_type === 'whatsapp' &&
    (!detail.whatsapp_window_expires_at ||
      new Date(detail.whatsapp_window_expires_at) <= new Date());
  async function saveTags(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !contact || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api(`/crm/contacts/${detail.contact_id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          tags: [
            ...new Set(
              String(form.get('tags') || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            ),
          ],
          expectedUpdatedAt: contact.updated_at,
        }),
      });
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
          </div>
        )}
      </section>
      <section className={styles.card}>
        <h3>
          {t('نظرة عامة على CRM', 'CRM Overview')}
          <Link
            href={`/dashboard/crm?contact=${detail.contact_id}`}
            aria-label={t('فتح CRM', 'Open CRM')}
          >
            <NavIcon name="edit" />
          </Link>
        </h3>
        <dl className={styles.facts}>
          {[
            [t('مسار المبيعات', 'Pipeline'), deal?.pipeline_name],
            [t('المرحلة', 'Stage'), deal?.stage],
            [
              t('الصفقة النشطة', 'Active Deal'),
              deal?.title || t('لا توجد صفقة نشطة', 'No active deal'),
            ],
            [
              t('قيمة الصفقة', 'Deal Value'),
              deal ? `${Number(deal.value_cents || 0) / 100} ${deal.currency || ''}` : '—',
            ],
            [
              t('الإغلاق المتوقع', 'Expected Close'),
              deal?.expected_close ? time(deal.expected_close) : '—',
            ],
            [
              t('مسؤول الصفقة', 'Deal Owner'),
              team.find((m) => m.user_id === deal?.owner_id)?.full_name,
            ],
            [t('درجة العميل', 'Lead Score'), detail.contact_attributes?.lead_score],
            [t('المصدر', 'Source'), detail.contact_attributes?.source],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
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
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? '—'}</dd>
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
          <form onSubmit={saveTags}>
            <label>
              {t('الوسوم', 'Labels')}
              <input
                name="tags"
                disabled={!canManage}
                key={(detail.contact_tags || []).join(',')}
                defaultValue={(detail.contact_tags || []).join(', ')}
                placeholder={t('وسوم مفصولة بفاصلة', 'Comma-separated labels')}
                maxLength={1500}
              />
            </label>
            <button className={styles.secondary} disabled={!canManage || !contact || saving}>
              {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الوسوم', 'Save labels')}
            </button>
          </form>
          <div>
            <span>{t('قوائم المشتركين', 'Lists')}</span>
            <div className={styles.chips}>
              {profile.data?.lists?.length ? (
                profile.data.lists.map((list: any) => <span key={list.id}>{list.name}</span>)
              ) : (
                <small>{t('لا توجد قوائم', 'No lists assigned')}</small>
              )}
            </div>
          </div>
          <div>
            <span>{t('تسلسل الرسائل', 'Message Sequence')}</span>
            <div className={styles.chips}>
              {profile.data?.sequences?.length ? (
                profile.data.sequences.map((seq: any) => (
                  <span key={seq.id}>
                    {seq.name} · {seq.status}
                  </span>
                ))
              ) : (
                <small>{t('لا توجد تسلسلات', 'No sequences assigned')}</small>
              )}
            </div>
          </div>
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
      </details>
      <details className={styles.card}>
        <summary>
          {t('الحقول المخصصة', 'Custom Fields')}
          <NavIcon name="chevron" />
        </summary>
        <dl className={styles.facts}>
          {Object.entries(detail.contact_attributes || {}).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
          {!Object.keys(detail.contact_attributes || {}).length && (
            <p>{t('لا توجد حقول مخصصة', 'No custom fields assigned')}</p>
          )}
        </dl>
      </details>
      <details className={styles.card}>
        <summary>
          {t('المتابعات', 'Follow-ups')} ({timeline?.tasks?.length || 0})<NavIcon name="chevron" />
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
          <Link href={`/dashboard/crm?contact=${detail.contact_id}`}>
            {t('إدارة المتابعات', 'Manage follow-ups')}
          </Link>
        </div>
      </details>
      <details className={styles.card}>
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
    </aside>
  );
}
