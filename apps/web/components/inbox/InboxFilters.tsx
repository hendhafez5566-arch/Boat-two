'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useLocale } from '../product/locale';
import { useData } from '../business/useData';
import { NavIcon } from '../product/NavIcon';
import styles from './inbox-filters.module.css';
export type InboxFilterValue = {
  channelId: string;
  tag: string;
  sequenceId: string;
  assignee: string;
  handledBy: string;
  orderBy: string;
  from: string;
  to: string;
};
export const EMPTY_INBOX_FILTERS = {
  tag: '',
  sequenceId: '',
  assignee: '',
  handledBy: '',
  orderBy: 'subscriber',
  from: '',
  to: '',
};
export function InboxFilters({
  open,
  onClose,
  value,
  onChange,
  channels,
  team,
  children,
}: {
  children?: ReactNode;
  open: boolean;
  onClose: () => void;
  value: InboxFilterValue;
  onChange: (value: InboxFilterValue) => void;
  channels: { id: string; name: string; type: string }[];
  team: { user_id: string; full_name: string; email: string }[];
}) {
  const { t } = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const options = useData<{
    labels: { name: string }[];
    sequences: { id: string; name: string }[];
  }>(open ? '/conversations/filter-options' : null, { labels: [], sequences: [] });
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (
        root.current &&
        !root.current.contains(e.target as Node) &&
        !(e.target as Element).closest('[data-inbox-filter-toggle]')
      )
        onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open, onClose]);
  if (!open) return null;
  const set = (key: keyof InboxFilterValue, next: string) => onChange({ ...value, [key]: next });
  return (
    <div
      ref={root}
      className={styles.popover}
      role="region"
      aria-label={t('فلاتر المحادثات', 'Conversation filters')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.header}>
        <strong>{t('تصفية المحادثات', 'Filter conversations')}</strong>
        <button type="button" aria-label={t('إغلاق الفلاتر', 'Close filters')} onClick={onClose}>
          <NavIcon name="close" />
        </button>
      </div>
      <label>
        {t('الحساب', 'Account')}
        <select value={value.channelId} onChange={(e) => set('channelId', e.target.value)}>
          <option value="">{t('كل الحسابات', 'All accounts')}</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('الوسم', 'Label')}
        <select
          value={value.tag}
          onChange={(e) => set('tag', e.target.value)}
          disabled={options.loading || !!options.error}
        >
          <option value="">{t('اختر وسمًا', 'Select label')}</option>
          {options.data.labels.map((x) => (
            <option key={x.name}>{x.name}</option>
          ))}
        </select>
      </label>
      <label>
        {t('التسلسل', 'Sequence')}
        <select
          value={value.sequenceId}
          onChange={(e) => set('sequenceId', e.target.value)}
          disabled={options.loading || !!options.error}
        >
          <option value="">{t('اختر تسلسلًا', 'Select Sequence')}</option>
          {options.data.sequences.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ترتيب حسب', 'Order by')}
        <select value={value.orderBy} onChange={(e) => set('orderBy', e.target.value)}>
          <option value="subscriber">{t('أحدث رد للمشترك', 'Subscriber Recent Reply')}</option>
          <option value="communication">{t('أحدث تواصل', 'Recent Communication')}</option>
        </select>
      </label>
      <label>
        {t('عضو الفريق', 'Team member')}
        <select value={value.assignee} onChange={(e) => set('assignee', e.target.value)}>
          <option value="">{t('اختر عضو الفريق', 'Select Team Member')}</option>
          <option value="unassigned">{t('غير معيّن', 'Unassigned')}</option>
          {team.map((x) => (
            <option key={x.user_id} value={x.user_id}>
              {x.full_name || x.email}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('حالة رد البوت', 'Bot Reply Status')}
        <select value={value.handledBy} onChange={(e) => set('handledBy', e.target.value)}>
          <option value="">{t('الكل', 'All')}</option>
          <option value="bot">{t('البوت يرد', 'Bot is replying')}</option>
          <option value="human">{t('رد البوت متوقف', 'Bot reply is paused')}</option>
        </select>
      </label>
      <div className={styles.dates}>
        <label>
          {t('من تاريخ', 'From date')}
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => set('from', e.target.value)}
          />
        </label>
        <label>
          {t('إلى تاريخ', 'To date')}
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => set('to', e.target.value)}
          />
        </label>
      </div>
      {options.error && <p role="alert">{options.error}</p>}
      {children}
      <button
        type="button"
        className={styles.clear}
        onClick={() => onChange({ ...EMPTY_INBOX_FILTERS, channelId: '' })}
      >
        {t('مسح الفلاتر', 'Clear filters')}
      </button>
    </div>
  );
}
