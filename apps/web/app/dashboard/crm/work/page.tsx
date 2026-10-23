'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { useData } from '../../../../components/business/useData';
import { useLocale } from '../../../../components/product/locale';
import { download, exportCsv } from '../../../../components/business/csv';
type Work = {
  id: string;
  title: string;
  contact_name: string;
  contact_id: string;
  status: string;
  updated_at: string;
  stage?: string;
  pipeline_stages?: string[];
  value_cents?: string;
  currency?: string;
  owner_id?: string | null;
  assigned_to?: string | null;
  due_at?: string;
};
export default function WorkPage() {
  const { t } = useLocale();
  const [kind, setKind] = useState('deals'),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [owner, setOwner] = useState(''),
    [pipeline, setPipeline] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Work | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const params = new URLSearchParams({
    q,
    page: String(page),
    ...(status ? { status } : {}),
    ...(owner ? { ownerId: owner } : {}),
    ...(kind === 'deals' && pipeline ? { pipelineId: pipeline } : {}),
    ...(kind === 'tasks' && from ? { dueFrom: new Date(from).toISOString() } : {}),
    ...(kind === 'tasks' && to ? { dueTo: new Date(to).toISOString() } : {}),
  });
  const data = useData<{ items: Work[]; total: number }>('/crm/' + kind + '?' + params, {
      items: [],
      total: 0,
    }),
    team = useData<{ members: { user_id: string; full_name: string }[] }>('/team', { members: [] }),
    pipelines = useData<{ id: string; name: string }[]>('/crm/pipelines', []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await data.reload();
      setMessage(t('تمت العملية.', 'Operation completed.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <h1>{t('المبيعات والمتابعات', 'Sales and follow-ups')}</h1>
        <Link href="/dashboard/crm" className="btn">
          {t('العودة للعملاء', 'Back to CRM')}
        </Link>
      </div>
      <div className="form-actions">
        {['deals', 'tasks'].map((value) => (
          <button
            key={value}
            className={'btn ' + (kind === value ? 'btn-primary' : '')}
            onClick={() => {
              setKind(value);
              setStatus('');
              setPage(1);
              setEdit(null);
            }}
          >
            {value === 'deals' ? t('الصفقات', 'Deals') : t('المهام', 'Tasks')}
          </button>
        ))}
      </div>
      <section className="card form-grid">
        <label className="field">
          {t('بحث في العنوان أو العميل', 'Search title or customer')}
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          {t('الحالة', 'Status')}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('الكل', 'All')}</option>
            {(kind === 'deals' ? ['open', 'won', 'lost'] : ['open', 'done']).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('المسؤول', 'Owner')}
          <select
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('الكل', 'All')}</option>
            {team.data.members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name}
              </option>
            ))}
          </select>
        </label>
        {kind === 'deals' ? (
          <label className="field">
            {t('خط المبيعات', 'Pipeline')}
            <select
              value={pipeline}
              onChange={(e) => {
                setPipeline(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('الكل', 'All')}</option>
              {pipelines.data.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="field">
              {t('استحقاق من UTC', 'Due from UTC')}
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="field">
              {t('استحقاق إلى UTC (غير شامل)', 'Due to UTC (exclusive)')}
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          </>
        )}
      </section>
      {(error || data.error) && (
        <p role="alert" className="notice error">
          {error || data.error}
        </p>
      )}
      {message && <p className="notice">{message}</p>}
      <div className="form-actions">
        <button className="btn" onClick={() => data.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await api<{ items: Record<string, unknown>[] }>(
                '/crm/' + kind + '/export?' + params,
              );
              download(
                kind + '.csv',
                exportCsv(
                  result.items,
                  kind === 'deals'
                    ? [
                        'id',
                        'title',
                        'contact_name',
                        'stage',
                        'status',
                        'value_cents',
                        'currency',
                        'owner_id',
                      ]
                    : ['id', 'title', 'contact_name', 'status', 'due_at', 'assigned_to'],
                ),
              );
            })
          }
        >
          {t('تصدير النتائج CSV', 'Export filtered CSV')}
        </button>
        <span>
          {data.data.total} {t('نتيجة', 'records')}
        </span>
      </div>
      <section className="card table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('العنوان', 'Title')}</th>
              <th>{t('العميل', 'Customer')}</th>
              <th>{t('الحالة', 'Status')}</th>
              <th>{kind === 'deals' ? t('القيمة', 'Value') : t('الاستحقاق', 'Due')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.data.items.map((row) => (
              <tr key={row.id}>
                <td>{row.title}</td>
                <td>{row.contact_name}</td>
                <td>
                  {row.status} {row.stage || ''}
                </td>
                <td>
                  {kind === 'deals'
                    ? `${Number(row.value_cents) / 100} ${row.currency}`
                    : new Date(row.due_at!).toLocaleString()}
                </td>
                <td>
                  <button className="btn" onClick={() => setEdit(row)}>
                    {t('تعديل', 'Edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.loading ? (
          <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
        ) : (
          !data.data.items.length && (
            <p className="empty">{t('لا توجد نتائج مطابقة.', 'No matching records.')}</p>
          )
        )}
      </section>
      <div className="form-actions">
        <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
          {t('السابق', 'Previous')}
        </button>
        <span>{page}</span>
        <button
          className="btn"
          disabled={page * 25 >= data.data.total}
          onClick={() => setPage(page + 1)}
        >
          {t('التالي', 'Next')}
        </button>
      </div>
      {edit && (
        <form
          key={edit.id + edit.updated_at}
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await api('/crm/' + kind + '/' + edit.id, {
                method: 'PATCH',
                body: JSON.stringify({
                  title: f.get('title'),
                  status: f.get('status'),
                  expectedUpdatedAt: edit.updated_at,
                  ...(kind === 'deals'
                    ? {
                        stage: f.get('stage'),
                        valueCents: Math.round(Number(f.get('value')) * 100),
                        currency: f.get('currency'),
                        ownerId: f.get('owner') || null,
                      }
                    : {
                        dueAt: new Date(String(f.get('due')) + 'Z').toISOString(),
                        assignedTo: f.get('owner') || null,
                      }),
                }),
              });
              setEdit(null);
            });
          }}
        >
          <h2>{t('تعديل السجل', 'Edit record')}</h2>
          <label className="field">
            {t('العنوان', 'Title')}
            <input name="title" required maxLength={200} defaultValue={edit.title} />
          </label>
          <label className="field">
            {t('الحالة', 'Status')}
            <select name="status" defaultValue={edit.status}>
              {(kind === 'deals' ? ['open', 'won', 'lost'] : ['open', 'done']).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('المسؤول', 'Owner')}
            <select name="owner" defaultValue={edit.owner_id || edit.assigned_to || ''}>
              <option value="">{t('دون تعيين', 'Unassigned')}</option>
              {team.data.members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'deals' ? (
            <div className="form-grid">
              <label className="field">
                {t('المرحلة', 'Stage')}
                <select name="stage" defaultValue={edit.stage}>
                  {edit.pipeline_stages?.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('القيمة', 'Value')}
                <input
                  name="value"
                  type="number"
                  min={0}
                  max={1000000000}
                  step="0.01"
                  required
                  defaultValue={Number(edit.value_cents) / 100}
                />
              </label>
              <label className="field">
                {t('العملة', 'Currency')}
                <input name="currency" pattern="[A-Z]{3}" required defaultValue={edit.currency} />
              </label>
            </div>
          ) : (
            <label className="field">
              {t('الاستحقاق UTC', 'Due UTC')}
              <input
                name="due"
                type="datetime-local"
                required
                defaultValue={new Date(edit.due_at!).toISOString().slice(0, 16)}
              />
            </label>
          )}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {t('حفظ', 'Save')}
            </button>
            <button className="btn" type="button" onClick={() => setEdit(null)}>
              {t('إغلاق', 'Close')}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
