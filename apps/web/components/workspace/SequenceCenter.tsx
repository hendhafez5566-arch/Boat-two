'use client';
import { useState } from 'react';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { statusLabel } from '../product/status';
import { Button, Dialog, EmptyState } from '../product/ProductUI';
import SequenceBulkAssign from './SequenceBulkAssign';
import styles from './sequences.module.css';
type Row = {
  id: string;
  name: string;
  status: string;
  channel_name: string;
  step_count: number;
  processed: number;
  delivered: number;
  opened: number;
  unreached: number;
  last_sent_at: string | null;
  active: number;
  completed: number;
};
export default function SequenceCenter({
  channelId,
  onOpen,
  onCreate,
  busy,
  error,
}: {
  channelId: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  busy: boolean;
  error: string;
}) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('latest');
  const [bulk, setBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const query = new URLSearchParams({ q, status, page: String(page), limit: String(limit), sort });
  if (channelId) query.set('channelId', channelId);
  const data = useData<{ items: Row[]; total: number; page: number; limit: number }>(
    `/sequence-center?${query}`,
    { items: [], total: 0, page: 1, limit: 10 },
  );
  const pages = Math.max(1, Math.ceil(data.data.total / limit));
  return (
    <section className="stack">
      <div className={styles.toolbar}>
        <div>
          <h2>{t('تسلسلات المتابعة', 'Follow-up Sequences')}</h2>
          <p className="muted">
            {t(
              'إدارة حملات المتابعة التلقائية للحساب المختار.',
              'Manage automated sequence campaigns for the selected account.',
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <Button disabled={busy} onClick={() => setBulk(true)}>
            {t('تعيين جماعي', 'Bulk Assign')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={onCreate}>
            ＋ {t('إنشاء', 'Create')}
          </Button>
        </div>
      </div>
      {(error || data.error) && (
        <p role="alert" className="notice error">
          {error || data.error}
        </p>
      )}
      <div className={styles.toolbar}>
        <input
          type="search"
          aria-label={t('بحث التسلسلات', 'Search Sequences')}
          placeholder={t('البحث باسم الحملة', 'Search Campaign Name')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <div className={styles.actions}>
          <select
            aria-label={t('الحالة', 'Status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {['all', 'draft', 'active', 'paused'].map((value) => (
              <option value={value} key={value}>
                {value === 'all' ? t('كل الحالات', 'All Statuses') : statusLabel(value, t)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('الترتيب', 'Sort')}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="latest">{t('آخر تعديل', 'Latest Updated')}</option>
            <option value="name">{t('اسم الحملة', 'Campaign Name')}</option>
            <option value="last_sent">{t('آخر إرسال', 'Last Sent')}</option>
          </select>
        </div>
      </div>
      {data.loading ? (
        <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : !data.data.items.length ? (
        <EmptyState icon="sequences" title={t('لا توجد تسلسلات مطابقة', 'No Matching Sequences')} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {[
                  '#',
                  t('اسم الحملة', 'Campaign Name'),
                  t('الإجراءات', 'Actions'),
                  t('المعالج', 'Processed'),
                  t('تم التسليم', 'Delivered'),
                  t('تمت القراءة', 'Opened'),
                  t('لم يصل', 'Unreached'),
                  t('آخر إرسال', 'Last Sent'),
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((row, index) => (
                <tr key={row.id}>
                  <td>{(page - 1) * limit + index + 1}</td>
                  <td>
                    <strong>{row.name}</strong>
                    <small>
                      {row.channel_name} · {row.step_count} {t('خطوات', 'Steps')} ·{' '}
                      {statusLabel(row.status, t)}
                    </small>
                    <small>
                      {t('نشط', 'Active')}: {row.active} · {t('مكتمل', 'Completed')}:{' '}
                      {row.completed}
                    </small>
                  </td>
                  <td>
                    <Button disabled={busy} onClick={() => onOpen(row.id)}>
                      {t('تعديل', 'Edit')}
                    </Button>
                  </td>
                  <td>{row.processed}</td>
                  <td>{row.delivered}</td>
                  <td>{row.opened}</td>
                  <td>{row.unreached}</td>
                  <td>{row.last_sent_at ? new Date(row.last_sent_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles.toolbar}>
        <span>
          {data.data.total} {t('تسلسل', 'Sequences')} · {page} / {pages}
        </span>
        <label>
          {t('عدد الصفوف', 'Rows')}{' '}
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <Button disabled={page <= 1 || data.loading} onClick={() => setPage(page - 1)}>
            {t('السابق', 'Previous')}
          </Button>
          <Button disabled={page >= pages || data.loading} onClick={() => setPage(page + 1)}>
            {t('التالي', 'Next')}
          </Button>
        </div>
      </div>
      <small className="muted">
        {t(
          'المعالج يحسب سجلات الرسائل؛ التسليم والقراءة يعتمدان على إيصالات المزود ولا يمثلان عدد مشتركين فريدين.',
          'Processed counts message records; delivery and opening use provider receipts and do not represent unique subscribers.',
        )}
      </small>
      <Dialog
        open={bulk}
        onClose={() => {
          if (!bulkBusy) setBulk(false);
        }}
        title={t('تعيين جماعي', 'Bulk Assign')}
        className={styles.drawer}
      >
        {bulk && (
          <SequenceBulkAssign
            key={channelId}
            channelId={channelId}
            onBusyChange={setBulkBusy}
            onAssigned={() => void data.reload()}
          />
        )}
      </Dialog>
    </section>
  );
}
