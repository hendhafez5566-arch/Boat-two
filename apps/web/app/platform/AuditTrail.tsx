'use client';
import { Dialog } from '../../components/product/ProductUI';
import styles from './platform.module.css';

import { useEffect, useRef, useState } from 'react';
import { NavIcon } from '../../components/product/NavIcon';
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
  request,users,companies,
}: {
  request: (path: string) => Promise<{ items: Row[]; nextCursor: string | null }>;
  users:{id:string;full_name:string;email:string}[];companies:{id:string;name:string}[];
}) {
  const { t,language } = useLocale();
  const [selected,setSelected]=useState<Row|null>(null);
  const actions:Record<string,string>={'company.update':t('تعديل شركة','Company updated'),'subscription.override':t('تعديل استحقاق','Entitlement updated'),'plan.update':t('تعديل باقة','Plan updated'),'price.publish':t('نشر سعر','Price published'),'price.retire':t('تقاعد سعر','Price retired'),'user.update':t('تعديل مستخدم','User updated'),'user.revoke_sessions':t('إبطال الجلسات','Sessions revoked')};
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
  const lock=useRef(false);
  async function load(next?: string) {
    if(lock.current)return;lock.current=true;setBusy(true);
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
      const filters=new URLSearchParams(params);filters.delete('cursor');setApplied(filters);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
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
          <NavIcon name="filter"/>{t('تطبيق الفلاتر', 'Apply filters')}
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
                <td><span title={row.action}>{actions[row.action]??row.action}</span></td>
                <td>
                  <strong title={row.actor_id}>{users.find(u=>u.id===row.actor_id)?.full_name||row.actor_id.slice(0,8)+'…'}</strong><br/><small title={row.tenant_id??undefined}>{companies.find(c=>c.id===row.tenant_id)?.name||(row.tenant_id?row.tenant_id.slice(0,8)+'…':'—')}</small>
                </td>
                <td>
                  <button type="button" className="btn" onClick={()=>setSelected(row)}><NavIcon name="eye"/>{t('عرض التفاصيل','View details')}</button>
                </td>
                <td>{new Date(row.created_at).toLocaleString(language)}</td>
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
          <NavIcon name="export"/>{t('تصدير السجلات المحمّلة فقط', 'Export loaded records only')}
        </button>
        <span>
          {rows.length} {t('سجل محمّل', 'loaded records')}
        </span>
      </div>
      {selected&&<Dialog open title={t('تفاصيل العملية','Operation details')} onClose={()=>setSelected(null)} className={styles.editor}><dl className={styles.stateGrid}><div><dt>{t('الإجراء','Action')}</dt><dd>{actions[selected.action]??selected.action}</dd></div><div><dt>{t('المسؤول','Actor')}</dt><dd>{selected.actor_id}</dd></div><div><dt>{t('الشركة','Company')}</dt><dd>{selected.tenant_id??'—'}</dd></div></dl><pre dir="ltr">{JSON.stringify(selected.details,null,2)}</pre></Dialog>}
    </section>
  );
}
