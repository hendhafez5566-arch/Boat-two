'use client';
import { DisclosureSummary } from './DisclosureSummary';

import { useEffect, useRef, useState } from 'react';
import { useTransientNotice } from './useTransientNotice';
import { NavIcon } from './NavIcon';
import { useData } from '../business/useData';
import { api } from '../../lib/api';
import { useLocale } from './locale';
type Job = {
  id: string;
  status: string;
  error: string | null;
  created_at: string;
  delivery_status: string | null;
  provider_id: string | null;
};
export function InvitationMailPanel({ refreshKey }: { refreshKey: string }) {
  const { t, language } = useLocale();
  const workspace = useData<{ role: string }>('/workspace', { role: '' });
  const [jobs, setJobs] = useState<Job[]>([]),
    [html, setHtml] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock=useRef(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[filter,setFilter]=useState('all');
  const visible=jobs.filter(j=>filter==='all'||j.status===filter);
  useTransientNotice(notice,()=>setNotice(''));
  async function load() {
    setLoading(true);setError('');
    try {
      setJobs(await api<Job[]>('/workspace/mail'));
    } catch (e) {
      setError((e as Error).message);
    } finally {setLoading(false);}
  }
  useEffect(() => {
    load();
  }, [refreshKey]);
  async function run(id?: string) {
    if(lock.current)return;
    if(id&&!window.confirm(t('إعادة فحص بوابة الإرسال لهذه الرسالة؟','Recheck this message’s delivery gate?')))return;
    lock.current=true;setBusy(true);
    setError('');setNotice('');
    try {
      if (id) {
        await api('/workspace/mail/' + id + '/resume', { method: 'POST' });
        await load();setNotice(t('تم تحديث حالة الرسالة.','Message status updated.'));
      } else {
        const result = await api<{ html: string }>('/workspace/mail/preview', {
          method: 'POST',
          body: JSON.stringify({ language }),
        });
        setHtml(result.html);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <div className="page-heading">
        <h2>{t('بريد دعوات الفريق', 'Team invitation mail')}</h2>
        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={() => run()}>
            <NavIcon name="eye"/>{t('معاينة الهوية', 'Preview branding')}
          </button>
          <button className="btn" disabled={busy||loading} onClick={load}>
            {t('تحديث الحالات', 'Refresh statuses')}
          </button>
        </div>
      </div>
      <p className="muted">
        {t(
          'الإرسال معطّل افتراضيًا. قبول المزود لا يثبت وصول الرسالة. النتائج الغامضة لا تُعاد تلقائيًا.',
          'Delivery is disabled by default. Provider acceptance does not confirm delivery. Ambiguous outcomes are never retried automatically.',
        )}
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice&&<p role="status" className="notice">{notice}</p>}
      {html && (<div className="stack"><div className="form-actions"><button className="btn" onClick={()=>setHtml('')}>{t('إغلاق المعاينة','Close preview')}</button></div>
        <iframe
          title={t('معاينة رسالة الدعوة', 'Invitation email preview')}
          sandbox=""
          srcDoc={html}
          style={{ width: '100%', height: 430, border: 0 }}
        /></div>
      )}
      <div className="workbench-toolbar"><label>{t('حالة الرسالة','Message status')} <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{t('كل الحالات','All states')}</option><option value="pending">{t('بالانتظار','Pending')}</option><option value="blocked">{t('محظور بالبوابة','Blocked by gate')}</option><option value="accepted">{t('قبله المزود','Provider accepted')}</option><option value="ambiguous">{t('نتيجة غامضة','Ambiguous')}</option><option value="canceled">{t('ملغى','Canceled')}</option></select></label></div>
      {loading?<p role="status">{t('جارٍ تحميل الرسائل…','Loading messages…')}</p>:error&&!jobs.length?null:!visible.length ? (
        <p className="empty">{filter==='all'?t('لا توجد رسائل دعوة بعد.', 'No invitation emails yet.'):t('لا توجد رسائل مطابقة.','No matching messages.')}</p>
      ) : (
        <div className="table-wrap">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('التاريخ', 'Date')}</th>
                <th>{t('الحالة', 'Status')}</th>
                <th>{t('التفاصيل', 'Details')}</th>
                <th>{t('الإجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr key={j.id}>
                  <td>{new Date(j.created_at).toLocaleString(language)}</td>
                  <td>
                    <span className="badge">
                      {(
                        {
                          pending: t('بالانتظار', 'Pending'),
                          blocked: t('محظور بالبوابة', 'Blocked by gate'),
                          accepted: t('قبله المزود', 'Provider accepted'),
                          ambiguous: t('نتيجة غامضة', 'Ambiguous'),
                          canceled: t('ملغى', 'Canceled'),
                        } as Record<string, string>
                      )[j.status] ?? j.status}
                    </span>
                  </td>
                  <td>
                    {j.delivery_status
                      ? (
                          {
                            delivered: t('تم التسليم', 'Delivered'),
                            bounced: t('مرتد', 'Bounced'),
                            failed: t('فشل التسليم', 'Delivery failed'),
                          } as Record<string, string>
                        )[j.delivery_status]
                      : (j.error ?? '—')}
                    {j.provider_id && (
                      <small className="block" dir="ltr">
                        {j.provider_id}
                      </small>
                    )}
                  </td>
                  <td>
                    {j.status === 'ambiguous' && workspace.data.role === 'owner' && (
                      <details>
                        <DisclosureSummary>
                          {t('مراجعة الدليل دون إعادة إرسال', 'Review evidence without resending')}
                        </DisclosureSummary>
                        <form
                          className="stack"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if(lock.current||!window.confirm(t('حفظ نتيجة المراجعة دون إعادة إرسال؟','Save the evidence review without resending?')))return;
                            lock.current=true;
                            const f = new FormData(e.currentTarget);
                            setBusy(true);
                            setError('');setNotice('');
                            try {
                              await api('/workspace/mail/' + j.id + '/reconcile', {
                                method: 'POST',
                                body: JSON.stringify({
                                  outcome: f.get('outcome'),
                                  ...(f.get('providerId')
                                    ? { providerId: f.get('providerId') }
                                    : {}),
                                  evidence: f.get('evidence'),
                                }),
                              });
                              await load();setNotice(t('تم حفظ المراجعة.','Evidence review saved.'));
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              lock.current=false;setBusy(false);
                            }
                          }}
                        >
                          <label className="field">
                            {t('نتيجة الدليل', 'Evidence outcome')}
                            <select name="outcome">
                              <option value="not_sent">
                                {t('لم تُرسل، إغلاق دون إعادة', 'Not sent; close without resend')}
                              </option>
                              <option value="accepted">
                                {t('قبول مؤكد من المزود', 'Confirmed provider acceptance')}
                              </option>
                            </select>
                          </label>
                          <label className="field">
                            {t('معرّف القبول عند تأكيده', 'Provider ID if accepted')}
                            <input name="providerId" maxLength={255} />
                          </label>
                          <label className="field">
                            {t('مرجع الدليل', 'Evidence reference')}
                            <textarea name="evidence" minLength={20} maxLength={2000} required />
                          </label>
                          <button className="btn" disabled={busy}>
                            {t('حفظ المراجعة فقط', 'Save evidence review only')}
                          </button>
                        </form>
                      </details>
                    )}
                    {j.status === 'blocked' && (
                      <button disabled={busy} className="btn" onClick={() => run(j.id)}>
                        {t('إعادة فحص بوابة الإرسال', 'Recheck delivery gate')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
