'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button, Dialog } from '../product/ProductUI';
import { useData } from './useData';
import { CrmNav } from './CrmNav';
import { NavIcon } from '../product/NavIcon';
import styles from './crm-workspace.module.css';

type Pipeline = { id: string; name: string; stages: string[] };
type Work = {
  id: string;
  contact_id: string;
  contact_name: string;
  title: string;
  status: string;
  updated_at: string;
  pipeline_id: string;
  stage: string;
  value_cents: string;
  currency: string;
  owner_id: string | null;
  expected_close: string | null;
  loss_reason: string | null;
  due_at: string;
  priority?: 'low' | 'normal' | 'high';
  assigned_to: string | null;
  deal_id?: string | null;
};
type Member = { user_id: string; full_name: string };
export function CrmWork({
  kind,
  contactId,
  compact = false,
  createNew = false,
}: {
  kind: 'deals' | 'tasks';
  contactId?: string;
  compact?: boolean;
  createNew?: boolean;
}) {
  const { t, language } = useLocale();
  const deals = kind === 'deals';
  const [allPipelines, setAllPipelines] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const pipelinePolicy = useData<{ staleDays: number; closingDays: number }>(
    deals ? '/crm/workspace/pipeline-policy' : null,
    { staleDays: 14, closingDays: 3 },
  );
  const [routeDates, setRouteDates] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [status, setStatus] = useState('open');
  const [owner, setOwner] = useState('');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('board');
  const [dialog, setDialog] = useState<Work | 'new' | null>(createNew ? 'new' : null);
  useEffect(() => {
    if (compact) return;
    const p = new URLSearchParams(window.location.search);
    if (p.has('ownerId')) setOwner(p.get('ownerId') || '');
    if (p.get('needsAttention') === 'true') setAttentionOnly(true);
    if (p.has('status')) setStatus(p.get('status') || '');
    if (p.has('period')) setPeriod(p.get('period') || 'all');
    if (p.get('create') === 'true') setDialog('new');
    if (p.get('view') === 'table') setView('table');
    if (p.get('allPipelines') === 'true') setAllPipelines(true);
    const dates: Record<string, string> = {};
    for (const k of ['updatedFrom', 'updatedTo', 'contactId', 'id']) {
      const v = p.get(k);
      if (v) dates[k] = v;
    }
    setRouteDates(dates);
  }, [compact]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const team = useData<{ currentUserId: string; role: string; members: Member[] }>(
    '/crm/workspace/members',
    { currentUserId: '', role: '', members: [] },
  );
  const pipelines = useData<Pipeline[]>('/crm/pipelines', []);
  const selectedPipeline = pipelines.data.find((p) => p.id === pipeline) || pipelines.data[0];
  const params = new URLSearchParams({ ...routeDates, q, status, page: String(page), limit: '50' });
  if (deals && selectedPipeline && !allPipelines) params.set('pipelineId', selectedPipeline.id);
  if (deals && attentionOnly) params.set('needsAttention', 'true');
  if (owner) params.set('ownerId', owner === 'me' ? team.data.currentUserId : owner);
  if (contactId) params.set('contactId', contactId);
  if (!deals && period !== 'all') params.set('period', period);
  const data = useData<{ items: Work[]; total: number }>(`/crm/${kind}?${params}`, {
    items: [],
    total: 0,
  });
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await data.reload();
      setNotice(t('تم الحفظ', 'Saved'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function update(row: Work, changes: Record<string, unknown>) {
    return run(() =>
      api(`/crm/${kind}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...changes, expectedUpdatedAt: row.updated_at }),
      }),
    );
  }
  const canEdit = (row: Work) =>
    team.data.role !== 'agent' ||
    (deals ? row.owner_id : row.assigned_to) === team.data.currentUserId;
  const memberName = (id: string | null) =>
    team.data.members.find((m) => m.user_id === id)?.full_name || t('غير مسند', 'Unassigned');
  const amount = (row: Work) =>
    new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', {
      style: 'currency',
      currency: row.currency,
    }).format(Number(row.value_cents) / 100);
  function card(row: Work) {
    return (
      <article
        key={row.id}
        className={styles.card}
        data-overdue={!deals && row.status === 'open' && new Date(row.due_at) < new Date()}
        data-stale={
          deals &&
          row.status === 'open' &&
          Date.now() - Date.parse(row.updated_at) > pipelinePolicy.data.staleDays * 86400000
        }
        draggable={deals && !busy && canEdit(row)}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', row.id)}
      >
        <button
          className={styles.linkButton}
          disabled={!canEdit(row)}
          onClick={() => setDialog(row)}
        >
          <h3>{row.title}</h3>
        </button>
        <p>
          <Link href={`/dashboard/crm?contact=${row.contact_id}`}>{row.contact_name}</Link>
        </p>
        {!deals && (
          <span
            className={styles.badge}
            data-tone={row.priority === 'high' ? 'red' : row.priority === 'low' ? 'blue' : 'orange'}
          >
            <NavIcon name="flag" />
            {row.priority === 'high'
              ? t('أولوية عالية', 'High priority')
              : row.priority === 'low'
                ? t('أولوية منخفضة', 'Low priority')
                : t('أولوية عادية', 'Normal priority')}
          </span>
        )}
        {deals ? (
          <strong>{amount(row)}</strong>
        ) : (
          <p
            className={
              row.status === 'open' && new Date(row.due_at) < new Date() ? styles.overdue : ''
            }
          >
            {new Date(row.due_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en')}
          </p>
        )}
        <p>
          <NavIcon name="user" />
          {memberName(deals ? row.owner_id : row.assigned_to)}
        </p>
        <p>
          <NavIcon name="stopwatch" />
          {t('آخر نشاط', 'Last activity')}:{' '}
          {new Date(row.updated_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en')}
        </p>
        {deals &&
          row.status === 'open' &&
          Date.now() - Date.parse(row.updated_at) > pipelinePolicy.data.staleDays * 86400000 && (
            <span className={styles.badge} data-tone="orange">
              <NavIcon name="userClock" />
              {t('دون تحديث منذ ', 'No update for ') +
                pipelinePolicy.data.staleDays +
                t(' يومًا', ' days')}
            </span>
          )}
        {deals && row.expected_close && (
          <p>
            {t('الإغلاق المتوقع', 'Expected close')}: {row.expected_close.slice(0, 10)}
          </p>
        )}
        {deals ? (
          <label className={styles.hint}>
            {t('المرحلة', 'Stage')}
            <select
              aria-label={t('مرحلة', 'Stage') + ': ' + row.title}
              value={row.stage}
              disabled={busy || !canEdit(row)}
              onChange={(e) => void update(row, { stage: e.target.value })}
            >
              {selectedPipeline?.stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        ) : (
          <Button
            busy={busy}
            disabled={!canEdit(row)}
            onClick={() => void update(row, { status: row.status === 'done' ? 'open' : 'done' })}
          >
            {row.status === 'done'
              ? t('إعادة فتح', 'Reopen')
              : t('إكمال المتابعة', 'Complete follow-up')}
          </Button>
        )}
      </article>
    );
  }
  const title = deals
    ? t('فرص البيع', 'Sales pipeline')
    : t('المهام والمتابعات', 'Tasks & follow-ups');
  return (
    <section className={compact ? undefined : styles.page}>
      {!compact && <CrmNav />}
      <header className={styles.heading}>
        <div>
          <h1>{title}</h1>
          {!compact && (
            <p>
              {deals
                ? t(
                    'تابع كل فرصة من أول اهتمام حتى إغلاق الصفقة.',
                    'Follow every opportunity from first interest to closing.',
                  )
                : t(
                    'ابدأ بالمتأخر، ثم المطلوب اليوم، وخطط للمتابعة القادمة.',
                    'Start with overdue work, focus on today, and plan ahead.',
                  )}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          disabled={deals && pipelines.loading}
          onClick={() => setDialog('new')}
        >
          <NavIcon name="plus" />
          {deals ? t('إضافة فرصة', 'Add opportunity') : t('إضافة متابعة', 'Add follow-up')}
        </Button>
      </header>
      {!deals && (
        <div className={styles.quickTabs}>
          {[
            ['today', t('اليوم', 'Today'), 'calendar'],
            ['overdue', t('متأخرة', 'Overdue'), 'userClock'],
            ['upcoming', t('قادمة', 'Upcoming'), 'calendar'],
            ['done', t('مكتملة', 'Completed'), 'circleCheck'],
            ['mine', t('مهامي', 'My tasks'), 'user'],
          ].map(([key, label, icon]) => (
            <button
              key={key}
              aria-pressed={
                key === 'done'
                  ? status === 'done'
                  : key === 'mine'
                    ? owner === 'me'
                    : period === key && status === 'open'
              }
              onClick={() => {
                setPage(1);
                setRouteDates({});
                if (key === 'mine') setOwner('me');
                else if (key === 'done') {
                  setStatus('done');
                  setPeriod('all');
                } else {
                  setStatus('open');
                  setPeriod(key);
                }
              }}
            >
              <NavIcon name={icon} />
              {label}
            </button>
          ))}
        </div>
      )}
      {deals && (
        <div className={styles.toolbar}>
          <button
            className={'btn ' + (attentionOnly ? 'btn-primary' : '')}
            aria-pressed={attentionOnly}
            onClick={() => {
              setAttentionOnly(!attentionOnly);
              setPage(1);
            }}
          >
            <NavIcon name="stopwatch" />
            {t('صفقات تحتاج تدخلًا', 'Deals needing attention')}
          </button>
          <span>
            {t('ركود: ', 'Inactivity: ') +
              pipelinePolicy.data.staleDays +
              t(' يوم، إغلاق خلال: ', ' days; closing within: ') +
              pipelinePolicy.data.closingDays +
              t(' أيام', ' days')}
          </span>
          {pipelinePolicy.error && <span role="alert">{pipelinePolicy.error}</span>}
        </div>
      )}
      <div className={styles.toolbar}>
        <input
          aria-label={t('بحث', 'Search work')}
          placeholder={t('ابحث بالعنوان أو العميل', 'Search title or customer')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        {deals && (
          <select
            aria-label={t('خط المبيعات', 'Pipeline')}
            value={allPipelines ? 'all' : selectedPipeline?.id || ''}
            onChange={(e) => {
              setAllPipelines(e.target.value === 'all');
              if (e.target.value === 'all') setView('table');
              setPipeline(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t('كل خطوط المبيعات', 'All pipelines')}</option>
            {pipelines.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label={t('الحالة', 'Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('كل الحالات', 'All statuses')}</option>
          <option value="open">{t('مفتوح', 'Open')}</option>
          {deals ? (
            <>
              <option value="won">{t('ناجحة', 'Won')}</option>
              <option value="lost">{t('خاسرة', 'Lost')}</option>
            </>
          ) : (
            <option value="done">{t('مكتملة', 'Done')}</option>
          )}
        </select>
        <select
          aria-label={t('الموظف', 'Assignee')}
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('كل الفريق', 'All team')}</option>
          <option value="me">{t('مهامي', 'My work')}</option>
          {team.data.members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        {!deals && (
          <select
            aria-label={t('الموعد', 'Due date filter')}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t('كل المواعيد', 'All dates')}</option>
            <option value="overdue">{t('متأخر', 'Overdue')}</option>
            <option value="today">{t('اليوم', 'Today')}</option>
            <option value="upcoming">{t('قادم', 'Upcoming')}</option>
          </select>
        )}
        {deals && (
          <Button
            onClick={() => {
              setAllPipelines(false);
              setView(view === 'board' ? 'table' : 'board');
            }}
          >
            <NavIcon name="reports" />
            {view === 'board' ? t('عرض جدولي', 'Table view') : t('لوحة المراحل', 'Board view')}
          </Button>
        )}
      </div>
      {(error || data.error || pipelines.error || team.error) && (
        <p role="alert" className="notice error">
          {error || data.error || pipelines.error || team.error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {data.loading && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
      {deals && !selectedPipeline && !pipelines.loading ? (
        <div className={styles.empty}>
          <p>
            {t(
              'أنشئ خط مبيعات وحدد مراحله للبدء.',
              'Create a pipeline and its stages to get started.',
            )}
          </p>
          <Link className="btn" href="/dashboard/crm/advanced">
            {t('إعداد خطوط المبيعات', 'Set up pipelines')}
          </Link>
        </div>
      ) : deals && view === 'board' && !allPipelines ? (
        <>
          <p className={styles.hint}>
            {t(
              'اسحب الفرصة بين المراحل أو اختر المرحلة من بطاقتها. تعرض اللوحة الصفحة الحالية فقط.',
              'Drag opportunities between stages, or use the stage selector. The board displays the current page only.',
            )}
          </p>
          <div className={styles.board}>
            {selectedPipeline?.stages.map((stage) => (
              <section
                key={stage}
                className={styles.column}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const row = data.data.items.find(
                    (x) => x.id === e.dataTransfer.getData('text/plain'),
                  );
                  if (row && row.stage !== stage) void update(row, { stage });
                }}
              >
                <h2>
                  {stage}{' '}
                  <span className={styles.badge}>
                    {data.data.items.filter((d) => d.stage === stage).length}
                  </span>
                </h2>
                <div className={styles.stageTotals}>
                  {Array.from(
                    new Set(
                      data.data.items.filter((d) => d.stage === stage).map((d) => d.currency),
                    ),
                  ).map((currency) => (
                    <span key={currency}>
                      {new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', {
                        style: 'currency',
                        currency,
                      }).format(
                        data.data.items
                          .filter((d) => d.stage === stage && d.currency === currency)
                          .reduce((sum, d) => sum + Number(d.value_cents), 0) / 100,
                      )}
                    </span>
                  ))}
                </div>
                {data.data.items.filter((d) => d.stage === stage).map(card)}
              </section>
            ))}
          </div>
        </>
      ) : deals ? (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('الفرصة', 'Opportunity')}</th>
                <th>{t('العميل', 'Customer')}</th>
                <th>{t('المرحلة', 'Stage')}</th>
                <th>{t('القيمة', 'Value')}</th>
                <th>{t('المسؤول', 'Owner')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className={styles.linkButton}
                      disabled={!canEdit(row)}
                      onClick={() => setDialog(row)}
                    >
                      {row.title}
                    </button>
                  </td>
                  <td>
                    <Link href={`/dashboard/crm?contact=${row.contact_id}`}>
                      {row.contact_name}
                    </Link>
                  </td>
                  <td>{row.stage}</td>
                  <td>{amount(row)}</td>
                  <td>{memberName(row.owner_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.grid}>{data.data.items.map(card)}</div>
      )}
      {!data.loading && !data.data.items.length && (
        <p className={styles.empty}>
          {t(
            'لا توجد نتائج. أضف سجلًا أو غيّر الفلاتر.',
            'No results. Add a record or adjust your filters.',
          )}
        </p>
      )}
      <div className={styles.row}>
        <p>
          {t('الإجمالي', 'Total')}: {data.data.total}
        </p>
        <div className={styles.actions}>
          <Button disabled={page <= 1 || data.loading} onClick={() => setPage(page - 1)}>
            {t('السابق', 'Previous')}
          </Button>
          <span>{page}</span>
          <Button
            disabled={page * 50 >= data.data.total || data.loading}
            onClick={() => setPage(page + 1)}
          >
            {t('التالي', 'Next')}
          </Button>
        </div>
      </div>
      <Dialog
        open={!!dialog}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title={
          dialog === 'new'
            ? deals
              ? t('فرصة جديدة', 'New opportunity')
              : t('متابعة جديدة', 'New follow-up')
            : t('تعديل', 'Edit')
        }
      >
        {dialog && (
          <WorkForm
            key={typeof dialog === 'string' ? 'new' : dialog.id}
            kind={kind}
            row={typeof dialog === 'string' ? undefined : dialog}
            contactId={contactId}
            pipelines={pipelines.data}
            members={
              team.data.role === 'agent'
                ? team.data.members.filter((m) => m.user_id === team.data.currentUserId)
                : team.data.members
            }
            busy={busy}
            error={error}
            onSubmit={(values) =>
              run(async () => {
                const editing = typeof dialog !== 'string';
                await api<Work>(`/crm/${kind}${editing ? '/' + dialog.id : ''}`, {
                  method: editing ? 'PATCH' : 'POST',
                  body: JSON.stringify({
                    ...values,
                    ...(editing ? { expectedUpdatedAt: dialog.updated_at } : {}),
                  }),
                });
                setDialog(null);
              })
            }
          />
        )}
      </Dialog>
    </section>
  );
}
function WorkForm({
  kind,
  row,
  contactId,
  pipelines,
  members,
  busy,
  error,
  onSubmit,
}: {
  kind: 'deals' | 'tasks';
  row?: Work;
  contactId?: string;
  pipelines: Pipeline[];
  members: Member[];
  busy: boolean;
  error: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useLocale();
  const deals = kind === 'deals';
  const [search, setSearch] = useState('');
  const [taskContact, setTaskContact] = useState(row?.contact_id || contactId || '');
  const opportunities = useData<{ items: { id: string; title: string }[] }>(
    !deals && taskContact ? '/crm/deals?contactId=' + taskContact : null,
    { items: [] },
  );
  const contacts = useData<{ items: { id: string; name: string; phone: string | null }[] }>(
    !row && !contactId ? '/crm/contacts?' + new URLSearchParams({ q: search, limit: '20' }) : null,
    { items: [] },
  );
  const [pipeline, setPipeline] = useState(row?.pipeline_id || pipelines[0]?.id || '');
  const selected = pipelines.find((p) => p.id === pipeline) || pipelines[0];
  const [stage, setStage] = useState(row?.stage || selected?.stages[0] || '');
  const localDate = (iso?: string) => {
    const d = iso ? new Date(iso) : new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values: Record<string, unknown> = { title: f.get('title') };
    if (!row) values.contactId = contactId || f.get('contactId');
    if (deals) {
      values.stage = f.get('stage');
      values.valueCents = Math.round(Number(f.get('value')) * 100);
      values.currency = String(f.get('currency')).toUpperCase();
      values.ownerId = f.get('ownerId') || null;
      values.expectedClose = f.get('expectedClose') || null;
      if (!row) values.pipelineId = selected?.id;
      else {
        values.status = f.get('status');
        values.lossReason = f.get('lossReason') || null;
      }
    } else {
      values.dueAt = new Date(String(f.get('dueAt'))).toISOString();
      values.assignedTo = f.get('ownerId') || null;
      values.priority = f.get('priority') || 'normal';
      if (!row) values.dealId = f.get('dealId') || null;
    }
    void onSubmit(values);
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      {!row && !contactId && (
        <>
          <label>
            {t('ابحث عن العميل', 'Find customer')}
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            {t('العميل', 'Customer')}
            <select
              aria-label={t('العميل', 'Customer')}
              name="contactId"
              required
              defaultValue=""
              onChange={(e) => setTaskContact(e.target.value)}
            >
              <option value="" disabled>
                {t('اختر عميلًا', 'Choose customer')}
              </option>
              {contacts.data.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone}
                </option>
              ))}
            </select>
          </label>
          {contacts.error && <p role="alert">{contacts.error}</p>}
        </>
      )}
      {!deals && !row && taskContact && (
        <label>
          {t('ربط بفرصة بيع (اختياري)', 'Link opportunity (optional)')}
          <select name="dealId" defaultValue="" key={taskContact}>
            <option value="">{t('متابعة العميل فقط', 'Customer follow-up only')}</option>
            {opportunities.data.items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('العنوان', 'Title')}
        <input name="title" required maxLength={200} defaultValue={row?.title || ''} />
      </label>
      {deals ? (
        <>
          <label>
            {t('خط المبيعات', 'Pipeline')}
            <select
              name="pipelineId"
              disabled={!!row}
              value={pipeline}
              onChange={(e) => {
                setPipeline(e.target.value);
                setStage(pipelines.find((p) => p.id === e.target.value)?.stages[0] || '');
              }}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('المرحلة', 'Stage')}
            <select
              aria-label={t('المرحلة', 'Stage')}
              name="stage"
              required
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              {selected?.stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className={styles.grid}>
            <label>
              {t('القيمة', 'Value')}
              <input
                type="number"
                name="value"
                min="0"
                max="1000000000"
                step="0.01"
                required
                defaultValue={Number(row?.value_cents || 0) / 100}
              />
            </label>
            <label>
              {t('العملة', 'Currency')}
              <input
                name="currency"
                required
                minLength={3}
                maxLength={3}
                pattern="[A-Za-z]{3}"
                defaultValue={row?.currency || 'EGP'}
              />
            </label>
          </div>
          <label>
            {t('الإغلاق المتوقع', 'Expected close')}
            <input
              type="date"
              name="expectedClose"
              defaultValue={row?.expected_close?.slice(0, 10) || ''}
            />
          </label>
          {row && (
            <>
              <label>
                {t('الحالة', 'Status')}
                <select name="status" defaultValue={row.status}>
                  <option value="open">{t('مفتوحة', 'Open')}</option>
                  <option value="won">{t('ناجحة', 'Won')}</option>
                  <option value="lost">{t('خاسرة', 'Lost')}</option>
                </select>
              </label>
              <label>
                {t('سبب الخسارة (اختياري)', 'Loss reason (optional)')}
                <textarea name="lossReason" maxLength={500} defaultValue={row.loss_reason || ''} />
              </label>
            </>
          )}
        </>
      ) : (
        <>
          <label>
            {t('الأولوية', 'Priority')}
            <select name="priority" defaultValue={row?.priority || 'normal'}>
              <option value="normal">{t('عادية', 'Normal')}</option>
              <option value="high">{t('عالية', 'High')}</option>
              <option value="low">{t('منخفضة', 'Low')}</option>
            </select>
          </label>
          <label>
            {t('موعد المتابعة', 'Follow-up date')}
            <input
              type="datetime-local"
              name="dueAt"
              required
              defaultValue={localDate(row?.due_at)}
            />
          </label>
        </>
      )}
      <label>
        {t('الموظف المسؤول', 'Assigned employee')}
        <select
          aria-label={t('الموظف المسؤول', 'Assigned employee')}
          name="ownerId"
          defaultValue={(deals ? row?.owner_id : row?.assigned_to) || ''}
        >
          <option value="">{t('غير مسند', 'Unassigned')}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {deals && row && <StageHistory contactId={row.contact_id} dealId={row.id} />}
      <Button type="submit" variant="primary" busy={busy} disabled={deals && !selected}>
        {t('حفظ', 'Save')}
      </Button>
    </form>
  );
}

function StageHistory({ contactId, dealId }: { contactId: string; dealId: string }) {
  const { t, language } = useLocale();
  const d = useData<{
    timeline: {
      stageChanges: {
        id: string;
        deal_id: string;
        created_at: string;
        details: { from: string; to: string };
      }[];
    };
  } | null>('/crm/contacts/' + contactId + '/profile', null);
  const items = d.data?.timeline.stageChanges?.filter((s) => s.deal_id === dealId) || [];
  return (
    <details className={styles.definitions}>
      <summary>{t('سجل تغييرات المرحلة', 'Stage change history')}</summary>
      {d.error && <p role="alert">{d.error}</p>}
      {items.map((s) => (
        <p key={s.id}>
          {s.details.from} ← {s.details.to} ·{' '}
          {new Date(s.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en')}
        </p>
      ))}
      {!d.loading && !items.length && (
        <p>
          {t(
            'لا تغييرات مسجلة بعد؛ يبدأ السجل من هذا الإصدار.',
            'No changes recorded yet; history begins with this release.',
          )}
        </p>
      )}
    </details>
  );
}
