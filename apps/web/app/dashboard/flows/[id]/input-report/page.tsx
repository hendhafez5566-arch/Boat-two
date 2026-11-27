'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '../../../../../lib/api';
import { useLocale } from '../../../../../components/product/locale';
import { channelHref } from '../../../../../lib/channel-context';
import styles from './input-report.module.css';
import { NavIcon } from '../../../../../components/product/NavIcon';

type InputFlowReport = {
  flow: { id: string; name: string; status: string };
  fields: { key: string; label: string; kind: string; saveToSystem?: string }[];
  records: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    contactId: string;
    contactName: string | null;
    answers: Record<string, unknown>;
  }[];
  truncated: boolean;
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function InputFlowReportPage() {
  const params = useParams<{ id: string }>();
  const { t, language } = useLocale();
  const searchParams = useSearchParams();
  const channelId = searchParams.get('channelId');
  const [report, setReport] = useState<InputFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt,setAttempt]=useState(0);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [page,setPage]=useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReport(null);
    setQuery('');setStatus('');setPage(1);
    setError('');
    api<InputFlowReport>(`/flows/${params.id}/input-report`)
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message || t('تعذر تحميل التقرير.', 'Report could not be loaded.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.id, t, attempt]);

  const back = channelHref('/dashboard/flows?section=entry_points', channelId ?? '');
  const dateText = (value: string) =>
    new Date(value).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB');

  const filtered=(report?.records??[]).filter(record=>(!status||record.status===status)&&(!query.trim()||[record.contactId,record.contactName??'',...Object.values(record.answers).map(valueText)].some(v=>v.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))));
  const pages=Math.max(1,Math.ceil(filtered.length/50));
  const current=Math.min(page,pages);
  const statusText=(value:string)=>value==='waiting'?t('بانتظار الإجابة','Waiting for reply'):value==='handed_off'?t('تم التسليم لموظف','Handed off'):value==='expired'?t('انتهت المهلة','Expired'):value==='completed'?t('مكتمل','Completed'):value;
  return (
    <main className={styles.page} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className={styles.header}>
        <div>
          <Link href={back}>{t('تدفقات إدخال المستخدم', 'User Input Flows')}</Link>
          <h1>{report?.flow.name ?? t('تقرير إجابات التدفق', 'Input Flow Report')}</h1>
          <p>{t('الإجابات المسجلة في جلسات هذا التدفق وحقول CRM المرتبطة بها.', 'Answers recorded by this flow and their linked CRM fields.')}</p>
        </div>
        <Link className={styles.backButton} href={back}>
          {t('العودة إلى القائمة', 'Back to flows')}
        </Link>
      </header>

      {loading && <p role="status">{t('جارٍ تحميل الإجابات…', 'Loading responses…')}</p>}
      {error && <p role="alert" className={styles.error}>{error} <button className="btn" disabled={loading} onClick={()=>setAttempt(n=>n+1)}><NavIcon name="refresh" />{t('إعادة المحاولة','Retry')}</button></p>}
      {!loading && !error && report && (
        <section className={styles.report} aria-label={t('تقرير إجابات التدفق', 'Flow response report')}>
          <div className={styles.summary}>
            <span>{t('عدد الإجابات', 'Responses')}</span>
            <strong>{report.records.length}{report.truncated ? '+' : ''}</strong>
            <span>{t('حقول محفوظة في CRM', 'Fields saved to CRM')}</span>
            <strong>{report.fields.length}</strong>
          </div>
          {report.truncated && (
            <p role="status" className={styles.notice}>
              {t('يتم عرض أحدث 5000 جلسة فقط.', 'Showing the latest 5,000 sessions.')}
            </p>
          )}
          <div className="workbench-toolbar"><label className="field">{t('بحث في الإجابات المحملة','Search loaded responses')}<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label><label className="field">{t('الحالة','Status')}<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">{t('كل الحالات','All statuses')}</option>{Array.from(new Set(report.records.map(r=>r.status))).map(value=><option key={value} value={value}>{statusText(value)}</option>)}</select></label><button className="btn" onClick={()=>{setQuery('');setStatus('');setPage(1);}}>{t('مسح الفلاتر','Clear filters')}</button></div>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={t('الإجابات','Responses')}>
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t('العميل', 'Contact')}</th>
                  {report.fields.map((field) => <th scope="col" key={field.key}>{field.label}</th>)}
                  <th scope="col">{t('الحالة', 'Status')}</th>
                  <th scope="col">{t('آخر تحديث', 'Updated')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current-1)*50,current*50).map((record, index) => (
                  <tr key={record.id}>
                    <td>{(current-1)*50+index + 1}</td>
                    <td>
                      <span>{record.contactName || t('عميل', 'Contact')}</span>
                      <small>{record.contactId}</small>
                    </td>
                    {report.fields.map((field) => (
                      <td key={field.key}>{valueText(record.answers[field.key])}</td>
                    ))}
                    <td>{
                      record.status === 'waiting'
                        ? t('بانتظار الإجابة', 'Waiting for reply')
                        : record.status === 'handed_off'
                          ? t('تم التسليم لموظف', 'Handed off')
                          : record.status === 'expired'
                            ? t('انتهت المهلة', 'Expired')
                            : record.status === 'completed'
                              ? t('مكتمل', 'Completed')
                              : record.status
                    }</td>
                    <td>{dateText(record.updatedAt)}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={report.fields.length + 4} className={styles.empty}>
                    {report.records.length?t('لا توجد إجابات مطابقة للفلاتر.','No responses match these filters.'):t('لم تُسجل إجابات لهذا التدفق بعد.', 'No responses have been recorded for this flow yet.')}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="workbench-toolbar"><small>{filtered.length?t('النتائج','Results')+' '+((current-1)*50+1)+'–'+Math.min(current*50,filtered.length)+' / '+filtered.length:t('لا نتائج','No results')}</small><div className="form-actions"><button className="btn" disabled={current===1} onClick={()=>setPage(current-1)}>{t('السابق','Previous')}</button><button className="btn" disabled={current===pages} onClick={()=>setPage(current+1)}>{t('التالي','Next')}</button></div></div>
        </section>
      )}
    </main>
  );
}
