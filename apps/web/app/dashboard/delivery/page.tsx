'use client';
import { DeliveryPolicies } from '../../../components/business/DeliveryPolicies';
import { statusLabel } from '../../../components/product/status';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Job = {
  id: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  type?: string;
};
export default function Delivery() {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [kind,setKind]=useState<'outbound'|'events'>('outbound');
  const [attentionOnly,setAttentionOnly]=useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const data = useData<{ outbound: Job[]; events: Job[] }>('/delivery?page=' + page, {
    outbound: [],
    events: [],
  });
  async function retry(path: string) {
    setBusy(true);
    try {
      await api(path, { method: 'POST' });
      data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('التشغيل والتسليم', 'RELIABLE OPERATIONS')}</p>
          <h1>{t('مركز التسليم والأحداث', 'Delivery & event center')}</h1>
          <p>
            {t(
              'الفشل المؤكد قابل للإعادة. التسليم الغامض يحتاج مراجعة المزود أولًا.',
              'Confirmed failures can be retried. Ambiguous deliveries require provider reconciliation first.',
            )}
          </p>
        </div>
        <button className="btn" onClick={() => data.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      {(error || data.error) && <p className="notice error">{error || data.error}</p>}
      <nav className="workbench-tabs" aria-label={t('سجلات التسليم','Delivery records')}>{(['outbound','events'] as const).map(key=><button type="button" key={key} aria-pressed={kind===key} onClick={()=>{setKind(key);setPage(1);}}>{key==='outbound'?t('طابور الإرسال','Outbound queue'):t('سجل الأحداث','Event ledger')}</button>)}</nav>
      <label><input type="checkbox" checked={attentionOnly} onChange={e=>setAttentionOnly(e.target.checked)}/> {t('تحتاج إجراء في الصفحة الحالية','Needs attention on this page')}</label>
      {([kind]).map((kind) => (
        <section className="card table-wrap" key={kind}>
          <h2>
            {kind === 'outbound'
              ? t('طابور الإرسال', 'Outbound queue')
              : t('سجل الأحداث', 'Event ledger')}
          </h2>
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('الوقت', 'Time')}</th>
                <th>{t('النوع', 'Type')}</th>
                <th>{t('الحالة', 'Status')}</th>
                <th>{t('المحاولات', 'Attempts')}</th>
                <th>{t('التفاصيل', 'Details')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data[kind].filter(j=>!attentionOnly||['failed','blocked','ambiguous'].includes(j.status)).map((j) => (
                <tr key={j.id}>
                  <td>{new Date(j.created_at).toLocaleString()}</td>
                  <td>{j.type || 'message'}</td>
                  <td>
                    <span className="badge">{statusLabel(j.status, t)}</span>
                  </td>
                  <td>{j.attempts}</td>
                  <td>{j.error || '—'}</td>
                  <td>
                    {kind === 'outbound' && j.status === 'ambiguous' && (
                      <form
                        className="stack"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          setBusy(true);
                          setError('');
                          try {
                            await api(`/delivery/${j.id}/reconcile`, {
                              method: 'POST',
                              body: JSON.stringify({
                                result: f.get('result'),
                                externalId: f.get('externalId') || undefined,
                                evidence: f.get('evidence'),
                              }),
                            });
                            data.reload();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <label className="field">
                          {t('نتيجة مراجعة المزود', 'Provider reconciliation result')}
                          <select name="result">
                            <option value="failed">
                              {t('تأكد عدم التسليم', 'Confirmed not sent')}
                            </option>
                            <option value="sent">{t('تأكد الإرسال', 'Confirmed sent')}</option>
                          </select>
                        </label>
                        <label className="field">
                          {t('معرّف رسالة المزود إن أُرسلت', 'Provider message ID if sent')}
                          <input name="externalId" />
                        </label>
                        <label className="field">
                          {t(
                            'دليل المراجعة (يُسجّل في Audit)',
                            'Reconciliation evidence (audited)',
                          )}
                          <input name="evidence" minLength={10} required />
                        </label>
                        <button disabled={busy} className="btn">
                          {t('تسجيل نتيجة المراجعة', 'Record reconciliation')}
                        </button>
                      </form>
                    )}
                    {(j.status === 'failed' || (kind === 'outbound' && j.status === 'blocked')) && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          retry(`/${kind === 'outbound' ? 'delivery' : 'events'}/${j.id}/retry`)
                        }
                      >
                        {t('إعادة المحاولة', 'Retry')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data[kind].some(j=>!attentionOnly||['failed','blocked','ambiguous'].includes(j.status)) && (
            <p className="empty">{t('لا توجد سجلات في هذه الصفحة.', 'No records on this page.')}</p>
          )}
        </section>
      ))}
      <div className="form-actions">
        <button className="btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          {t('السابق', 'Previous')}
        </button>
        <span>{page}</span>
        <button
          className="btn"
          disabled={data.data.outbound.length < 25 && data.data.events.length < 25}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('التالي', 'Next')}
        </button>
      </div>
      <DeliveryPolicies />
    </main>
  );
}
