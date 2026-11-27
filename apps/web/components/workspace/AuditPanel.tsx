'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

import { activityAction, resourceLabel } from '../../lib/business-events';
import { useEffect, useState } from 'react';
import {useData} from '../business/useData';
import { useLocale } from '../product/locale';
type Entry = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
  actor_name: string | null;
};
export default function Audit() {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [query,setQuery]=useState(''),[size,setSize]=useState(25);
  const path='/workspace/audit?'+new URLSearchParams({q:query,page:String(page),limit:String(size)});
  const records=useData<{items:Entry[];total:number}>(path,{items:[],total:0});
  const ready=records.loadedPath===path&&!records.loading&&!records.error;
  const data=ready?records.data:{items:[],total:0},error=records.error,loading=!ready&&!error;
  const pages=Math.max(1,Math.ceil(data.total/size));
  useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE ACTIVITY</p>
          <h1>{t('سجل النشاط', 'Activity log')}</h1>
          <p>
            {t(
              'عمليات إعداد الشركة والفريق والقنوات والسيناريوهات، دون محتوى الرسائل أو الأسرار.',
              'Workspace, team, channel and flow changes, without message contents or secrets.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error} <button className="btn" onClick={()=>void records.reload()}>{t('إعادة المحاولة','Retry')}</button>
        </p>
      )}
      <div className="form-actions"><input type="search" aria-label={t("بحث سجل النشاط","Search activity logs")} maxLength={200} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><button className="btn" disabled={!query} onClick={()=>{setQuery("");setPage(1);}}>{t("مسح البحث","Clear search")}</button><button className="btn" disabled={loading} onClick={()=>void records.reload()}>{t("تحديث","Refresh")}</button></div>
      <div className="card table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('الوقت', 'Time')}</th>
              <th>{t('الإجراء', 'Action')}</th>
              <th>{t('القسم', 'Resource')}</th>
              <th>{t('بواسطة', 'Actor')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((x) => (
              <tr key={x.id}>
                <td>{new Date(x.created_at).toLocaleString()}</td>
                <td>{activityAction(x.action, t)}</td>
                <td>
                  {resourceLabel(x.resource_type, t)}
                  <details>
                    <DisclosureSummary>{t('تفاصيل تقنية', 'Technical details')}</DisclosureSummary>
                    <code dir="ltr">
                      {x.action} · {x.resource_type} · {x.resource_id}
                    </code>
                  </details>
                </td>
                <td>
                  {x.actor_name || t('النظام / قبل تفعيل سجل المستخدم', 'System / unattributed')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
        ) : (
          !error&&!data.items.length && (
            <p className="empty">
              {t('ستظهر الأنشطة الجديدة هنا.', 'New activities will appear here.')}
            </p>
          )
        )}
        <div className="form-actions">
          <select aria-label={t('عدد الصفوف','Rows per page')} value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select>
          <button
            className="btn"
            disabled={page === 1 || !ready}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('السابق', 'Previous')}
          </button>
          <span>
            {ready?data.total+' · '+page+'/'+pages:'—'}
          </span>
          <button
            className="btn"
            disabled={page >= pages || !ready}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      </div>
    </main>
  );
}
