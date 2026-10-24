'use client';
import { useEffect, useState } from 'react';
import { useLocale } from '../../components/product/locale';
type Row = {
  id: string;
  actor_id: string;
  tenant_id: string | null;
  action: string;
  details: unknown;
  created_at: string;
};
export default function AuditTrail({
  request,
}: {
  request: (path: string) => Promise<{ items: Row[]; nextCursor: string | null }>;
}) {
  const { t } = useLocale();
  const [rows, setRows] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [from, setFrom] = useState(() =>
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [actor, setActor] = useState(''),
    [tenant, setTenant] = useState(''),
    [action, setAction] = useState('');
  const [applied, setApplied] = useState<URLSearchParams | null>(null);
  async function load(next?: string) {
    setBusy(true);
    setError('');
    try {
      const params =
        next && applied
          ? new URLSearchParams(applied)
          : new URLSearchParams({
              from: new Date(from + 'T00:00:00Z').toISOString(),
              to: new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString(),
              action,
              limit: '50',
              ...(actor ? { actor } : {}),
              ...(tenant ? { tenant } : {}),
            });
      if (next) params.set('cursor', next);
      const result = await request('/audit?' + params);
      setRows((previous) => (next ? [...previous, ...result.items] : result.items));
      setCursor(result.nextCursor);
      setApplied(params);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // Keep displayed pages pinned to the submitted filters.
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          { filters: applied ? Object.fromEntries(applied) : {}, items: rows, hasMore: !!cursor },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'platform-audit-loaded-records.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="card stack">
      <h2>{t('سجل عمليات المنصة', 'Platform audit trail')}</h2>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="field">
          {t('من — UTC', 'From — UTC')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label className="field">
          {t('إلى — UTC', 'Through — UTC')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
        <label className="field">
          {t('معرّف المسؤول', 'Actor UUID')}
          <input value={actor} onChange={(e) => setActor(e.target.value)} />
        </label>
        <label className="field">
          {t('معرّف الشركة', 'Company UUID')}
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} />
        </label>
        <label className="field">
          {t('الإجراء المطابق', 'Exact action')}
          <input maxLength={100} value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <button className="btn" disabled={busy}>
          {t('تطبيق الفلاتر', 'Apply filters')}
        </button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy && <p role="status">{t('جارٍ تحميل السجل…', 'Loading audit records…')}</p>}
      {!busy && !rows.length && !error && (
        <p>{t('لا توجد عمليات ضمن الفلاتر.', 'No operations match these filters.')}</p>
      )}
      <div className="table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              {[
                t('الإجراء', 'Action'),
                t('المسؤول / الشركة', 'Actor / company'),
                t('التفاصيل', 'Details'),
                t('التاريخ', 'Date'),
              ].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.action}</td>
                <td>
                  {row.actor_id}
                  <br />
                  {row.tenant_id}
                </td>
                <td>
                  <details>
                    <summary>{t('عرض التفاصيل', 'View details')}</summary>
                    <pre>{JSON.stringify(row.details, null, 2)}</pre>
                  </details>
                </td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button
          className="btn"
          disabled={busy || !cursor}
          onClick={() => cursor && void load(cursor)}
        >
          {t('تحميل الأقدم', 'Load older')}
        </button>
        <button className="btn" disabled={busy || !rows.length} onClick={download}>
          {t('تصدير السجلات المحمّلة فقط', 'Export loaded records only')}
        </button>
        <span>
          {rows.length} {t('سجل محمّل', 'loaded records')}
        </span>
      </div>
    </section>
  );
}
