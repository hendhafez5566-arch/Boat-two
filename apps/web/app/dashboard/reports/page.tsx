'use client';
import { Button, EmptyState, WorkspaceHeading } from '../../../components/product/ProductUI';
import { DisclosureSummary } from '../../../components/product/DisclosureSummary';

import { reportColumn, reportValue } from '../../../lib/report-format';
import { statusLabel } from '../../../components/product/status';
import {localDay,shiftDay,reportRange} from '../../../lib/time-range';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NavIcon } from '../../../components/product/NavIcon';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { download, exportCsv } from '../../../components/business/csv';
type Row = Record<string, string | number | null>;
type Report = {
  range: { from: string; to: string };
  timezone: string;
  firstResponse?: { answered:number; unanswered:number; average_ms:number|null };
  daily: Row[];
  channels: Row[];
  employees: Row[];
  conversations: Row[];
  sales: Row[];
  lifecycle: Row[];
  campaigns: Row[];
  ai: Row[];
  bots: Row[];
  automation: Row[];
  followups: Row[];
};
export default function Reports() {
  const { t, language } = useLocale();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timezone,setTimezone]=useState('');
  const [hideEmpty,setHideEmpty]=useState(false);
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);
  const [selectedDay,setSelectedDay]=useState('');
  const busy=useRef(false);
  const [workspaceAttempt,setWorkspaceAttempt]=useState(0);
  const [activeReport,setActiveReport]=useState('response');
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  useEffect(()=>{api<{tenant:{settings?:{timezone?:string}}}>('/workspace').then(w=>{let zone=w.tenant.settings?.timezone || 'Africa/Cairo';try {new Intl.DateTimeFormat('en',{timeZone:zone});} catch {zone='Africa/Cairo';}const today=localDay(new Date(),zone);setTimezone(zone);setFrom(shiftDay(today,-29));setTo(today);}).catch(e=>setError(e.message));},[workspaceAttempt]);
  const sections: [keyof Omit<Report, 'range' | 'timezone' | 'firstResponse'>, string][] = [
    ['daily', t('الرسائل اليومية', 'Daily messages')],
    ['channels', t('القنوات', 'Channels')],
    ['employees', t('نشاط الموظفين', 'Employee activity')],
    ['conversations', t('المحادثات', 'Conversations')],
    [
      'sales',
      t('المبيعات حسب العملة (آخر تحديث ضمن الفترة)', 'Sales by currency (last updated in range)'),
    ],
    ['lifecycle', t('العملاء الجدد', 'New contacts')],
    ['followups', t('المتابعات المستحقة ضمن الفترة', 'Follow-ups due in range')],
    ['campaigns', t('الحملات المنشأة ضمن الفترة', 'Campaigns created in range')],
    ['ai', t('استهلاك AI والتكلفة التقديرية', 'AI usage and estimated cost')],
    ['bots', t('جلسات البوت', 'Bot sessions')],
    ['automation', t('تشغيل الأتمتة', 'Automation runs')],
  ];
  const visibleSections=sections.filter(([key])=>!hideEmpty||!!report?.[key].length);
  const shownReport=report && (activeReport==='response'&&report.firstResponse || visibleSections.some(([key])=>key===activeReport)) ? activeReport : report?.firstResponse ? 'response' : visibleSections[0]?.[0];
  const chooseReport=(key:string)=>{setActiveReport(key);setSearch('');setSelectedDay('');setPage(1);};
  const stale=!!report && (from!==localDay(new Date(report.range.from),report.timezone||timezone)||to!==localDay(new Date(Date.parse(report.range.to)-1),report.timezone||timezone));
  const format=(key:string,row:Row)=>['status','lifecycle'].includes(key)?statusLabel(String(row[key]||''),t):reportValue(key,row[key],row,language,t);
  const fmt=(n:number)=>new Intl.NumberFormat(language==='ar'?'ar-EG':'en').format(n);
  const total=(key:'inbound'|'outbound'|'failed')=>report?.daily.reduce((sum,row)=>sum+Number(row[key]??0),0)??0;
  return (
    <main className="stack" data-workbench="reports">
      <WorkspaceHeading
        title={t('تقارير النشاط والمبيعات', 'Activity and sales reports')}
        actions={<Link className="btn" href="/dashboard/crm/reports"><NavIcon name="reports" />{t('تقارير العملاء','CRM reports')}</Link>}
      />
      <form
        className="card report-filters"
        onSubmit={async (e) => {
          e.preventDefault();
          if(busy.current || !timezone) return;
          busy.current=true;
          setLoading(true);
          setError('');
          setReport(null);
          setSearch('');setSelectedDay('');setPage(1);
          try {
            const bounds=reportRange(from,to,timezone);
            if(Date.parse(bounds.to)-Date.parse(bounds.from)>366*86400000) throw new Error(t('اختر فترة لا تتجاوز 366 يومًا.','Choose a date range of at most 366 days.'));
            const result = await api<Report>(
                '/reports?' +
                  new URLSearchParams(bounds),
              );
            setReport(result);
            setActiveReport(result.firstResponse ? 'response' : sections.find(([key])=>result[key].length>0)?.[0] ?? 'daily');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            busy.current=false;
            setLoading(false);
          }
        }}
      >
        <label className="field">
          {t('من', 'From')}
          <input type="date" required disabled={loading} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          {t('إلى (شامل)', 'To (inclusive)')}
          <input type="date" required disabled={loading} min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <small className="muted">{t('توقيت الشركة','Workspace timezone')}: <bdi>{timezone || '…'}</bdi></small>
        <label className="field">{t('فترة جاهزة','Preset range')}<select value="" disabled={!timezone||loading} onChange={e=>{if(!e.target.value)return;const today=localDay(new Date(),timezone);setTo(today);setFrom(shiftDay(today,-Number(e.target.value)+1));}}><option value="">{t('اختر فترة','Choose range')}</option><option value="1">{t('اليوم','Today')}</option><option value="7">{t('آخر 7 أيام','Last 7 days')}</option><option value="30">{t('آخر 30 يومًا','Last 30 days')}</option></select></label>
        <Button variant="primary" busy={loading} disabled={!timezone || !from || !to || from>to}><NavIcon name="reports" />
          {loading ? t('جارٍ التحميل…', 'Loading…') : t('عرض التقارير', 'View reports')}
        </Button>
        {report && (
          <button
            className="btn"
            disabled={stale||loading}
            type="button"
            onClick={() =>
              download('reports.json', JSON.stringify(report, null, 2), 'application/json')
            }
          >
            <NavIcon name="export" />{t('تصدير كل التقارير', 'Export all reports')} (JSON)
          </button>
        )}
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error} {!timezone && <button type="button" className="btn" onClick={()=>{setError('');setWorkspaceAttempt(n=>n+1);}}>{t('إعادة المحاولة','Retry')}</button>}
        </p>
      )}
      {loading && <div className="card" role="status"><span className="spinner" aria-hidden="true" /> {t('جارٍ تحميل بيانات الفترة…','Loading period data…')}</div>}
      {stale && <p className="notice" role="status">{t('الفترة تغيرت. اضغط عرض التقارير لتحديث النتائج قبل التصدير.','Dates changed. View reports to refresh results before exporting.')}</p>}
      {!report && !loading && !error && (
        <p className="card empty">
          {t(
            'اختر الفترة لعرض إحصائيات شركتك.',
            'Choose a date range to view workspace statistics.',
          )}
        </p>
      )}
      {report && (
        <>
          <div className="workbench-metrics report-metrics">{([['inbound',t('رسائل واردة','Inbound messages'),'chat'],['outbound',t('رسائل صادرة','Outbound messages'),'send'],['failed',t('رسائل فاشلة','Failed messages'),'reports']] as const).map(([key,label,icon])=><div key={key} data-tone={key==='failed'?'danger':key==='inbound'?'success':'info'}><small><NavIcon name={icon} /> {label}</small><strong>{fmt(total(key))}</strong></div>)}</div>
          <details className="card report-method"><DisclosureSummary>{t('طريقة احتساب التقارير والقيود','Report methodology and limitations')}</DisclosureSummary><p className="muted">
            {t(
              'التكلفة تقديرية؛ القيم غير المسعّرة تبقى فارغة. المبالغ معروضة بالعملة الرئيسية لكل صف دون جمع العملات. الإرسال لا يعني التسليم.',
              'Costs are estimates; unpriced runs remain blank. Amounts use each row’s main currency unit; currencies remain separate. Sent does not mean delivered.',
            )}
          </p>
          <p className="muted">{t('إجمالي القنوات يستبعد ملاحظات الفريق والأحداث الداخلية. نشاط الموظف يعرض المحاولات مع فصل المُرسل والفاشل وما في الطابور؛ المُرسل لا يعني التسليم. حالات البوت ليست دليل حل المحادثة، ولا يتوفر قياس معتمد للوقت الموفّر بعد.','Channel totals exclude team notes and internal events. Staff activity shows attempts with sent, failed and queued counts; sent does not mean delivered. Bot states do not establish conversation resolution; measured time savings are not available yet.')}</p></details>
          <section className="card report-summary"><div><h2>{t('نتائج الفترة','Period results')}</h2><p className="muted"><bdi>{localDay(new Date(report.range.from),report.timezone || timezone)}</bdi> — <bdi>{localDay(new Date(Date.parse(report.range.to)-1),report.timezone || timezone)}</bdi> · <bdi>{report.timezone || timezone}</bdi></p></div><div><strong>{sections.filter(([key])=>report[key].length>0).length} / {sections.length}</strong><small>{t('أقسام تحتوي بيانات','Sections with data')}</small></div><label><input type="checkbox" checked={hideEmpty} onChange={e=>{setHideEmpty(e.target.checked);setSearch('');setSelectedDay('');setPage(1);}}/>{t('إخفاء الأقسام الفارغة','Hide empty sections')}</label></section>
          <nav className="workbench-tabs" aria-label={t('نوع التقرير','Report type')}>
            {report.firstResponse&&<button type="button" aria-pressed={shownReport==='response'} onClick={()=>chooseReport('response')}>{t('سرعة الرد','Response time')}</button>}
            {visibleSections.map(([key,title])=><button type="button" key={key} aria-pressed={shownReport===key} onClick={()=>chooseReport(key)}>{title}</button>)}
          </nav>
          {!shownReport&&<p className="card empty">{t('اختر تقريرًا من الأقسام المتاحة أعلاه.','Choose an available report above.')}</p>}
          {shownReport==='response' && report.firstResponse && <section className="card" aria-label={t('وقت أول رد بشري','First human response time')}>
            <h2>{t('وقت أول رد بشري','First human response time')}</h2>
            <p><strong>{report.firstResponse.average_ms === null ? t('لا توجد ردود بشرية مقاسة خلال الفترة','No measured human replies in this period') : new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en',{maximumFractionDigits:1}).format(report.firstResponse.average_ms/1000)+' '+t('ثانية','seconds')}</strong></p>
            <div className="workbench-metrics"><div><small>{t('محادثات رُد عليها','Answered conversations')}</small><strong>{fmt(report.firstResponse.answered)}</strong></div><div><small>{t('لم يصلها رد بشري','Without a human reply')}</small><strong>{fmt(report.firstResponse.unanswered)}</strong></div></div>
            <p>{t('عينة واحدة لكل محادثة: من أقدم رسالة واردة ضمن الفترة إلى أول رد موظف مُرسَل بعدها وقبل نهاية الفترة. تُستبعد ملاحظات الفريق وردود البوت والإرسال الفاشل؛ المحادثات دون رد لا تُحسب بصفر.','One sample per conversation: earliest inbound in range to its first sent staff reply before the range ends. Internal notes, bot replies and failed sends are excluded; unanswered conversations are not counted as zero.')}</p>
          </section>}
          {visibleSections.filter(([key])=>key===shownReport).map(([key, title]) => {
            const rows = report[key];
            const headers = rows.length ? Array.from(new Set(rows.flatMap(row=>Object.keys(row)))) : [];
            const query=search.trim().toLocaleLowerCase();
            const filtered=rows.filter(row=>(!selectedDay||key!=='daily'||row.day===selectedDay)&&(!query||headers.some(h=>(String(row[h]??'')+' '+format(h,row)).toLocaleLowerCase().includes(query))));
            const pages=Math.max(1,Math.ceil(filtered.length/pageSize)), current=Math.min(page,pages);
            const pageRows=filtered.slice((current-1)*pageSize,current*pageSize);
            const peak=Math.max(1,...rows.flatMap(row=>[Number(row.inbound??0),Number(row.outbound??0)]));
            return (
              <section key={key} id={'report-'+key} className="card report-detail">
                <div className="workbench-toolbar">
                  <h2>{title}</h2>
                  <label className="field">{t('بحث في النتائج المحملة','Search loaded results')}<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} /></label>
                  <button
                    className="btn"
                    disabled={!filtered.length||stale||loading}
                    onClick={() => download(key + '.csv', exportCsv(filtered.map(row => Object.fromEntries(headers.map(h => [reportColumn(h,t), format(h,row)]))), headers.map(h=>reportColumn(h,t))))}
                  >
                    <NavIcon name="export" />{t('تصدير CSV', 'Export CSV')}
                  </button>
                </div>
                {key==='campaigns' && rows.length>=1000 && <p className="muted">{t('يعرض الخادم أحدث 1000 حملة كحد أقصى؛ ضيّق الفترة لعرض نتائج أدق.','The server returns at most the latest 1,000 campaigns; narrow the range for more specific results.')}</p>}
                {key==='daily' && rows.length>0 && <><div className="report-chart" aria-label={t('الرسائل اليومية الواردة والصادرة','Daily inbound and outbound messages')}><div className="report-chart-bars">{rows.map(row=><button type="button" key={String(row.day)} aria-pressed={selectedDay===row.day} onClick={()=>{setSelectedDay(selectedDay===row.day?'':String(row.day));setPage(1);}} title={format('day',row)+' · '+format('inbound',row)+' / '+format('outbound',row)} aria-label={format('day',row)+' · '+t('واردة','Inbound')+': '+format('inbound',row)+' · '+t('صادرة','Outbound')+': '+format('outbound',row)}><span style={{height:(Number(row.inbound??0)/peak*100)+'%'}}/><span style={{height:(Number(row.outbound??0)/peak*100)+'%'}}/></button>)}</div><small>{t('أخضر: واردة · أزرق: صادرة · اختر يومًا للتفاصيل','Green: inbound · Blue: outbound · Select a day for details')}</small></div>{selectedDay&&<button className="btn" onClick={()=>{setSelectedDay('');setPage(1);}}>{t('عرض كل الأيام','Show all days')} · {selectedDay}</button>}</>}
                {!filtered.length ? (
                  <EmptyState icon="reports" title={rows.length?t('لا توجد نتائج مطابقة','No matching results'):t('لا توجد بيانات ضمن الفترة.','No data in this range.')} action={rows.length?<button className="btn" onClick={()=>{setSearch('');setSelectedDay('');setPage(1);}}>{t('مسح البحث','Clear search')}</button>:undefined}/>
                ) : (
                  <><div className="table-wrap" tabIndex={0} role="region" aria-label={title}><table className="product-table">
                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th key={h} scope="col" role="columnheader">{reportColumn(h,t)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, i) => (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h}>{h === 'id' ? <details><DisclosureSummary>{t('عرض المرجع','Show reference')}</DisclosureSummary><code>{row[h]}</code></details> : ['status','lifecycle'].includes(h) ? statusLabel(String(row[h] || ''),t) : reportValue(h,row[h],row,language,t)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table></div><div className="report-pagination"><small>{fmt((current-1)*pageSize+1)}–{fmt(Math.min(current*pageSize,filtered.length))} / {fmt(filtered.length)}</small><label>{t('صفوف','Rows')} <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[25,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label><button type="button" className="btn" disabled={current===1} onClick={()=>setPage(current-1)}>{t('السابق','Previous')}</button><button type="button" className="btn" disabled={current===pages} onClick={()=>setPage(current+1)}>{t('التالي','Next')}</button></div></>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
