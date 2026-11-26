'use client';
import { WorkspaceHeading } from '../../../components/product/ProductUI';
import { DisclosureSummary } from '../../../components/product/DisclosureSummary';

import { reportColumn, reportValue } from '../../../lib/report-format';
import { statusLabel } from '../../../components/product/status';
import {localDay,shiftDay,reportRange} from '../../../lib/time-range';
import { useEffect, useState } from 'react';
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
  const [hideEmpty,setHideEmpty]=useState(true);
  const [activeReport,setActiveReport]=useState('response');
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  useEffect(()=>{api<{tenant:{settings?:{timezone?:string}}}>('/workspace').then(w=>{const zone=w.tenant.settings?.timezone || 'Africa/Cairo';const today=localDay(new Date(),zone);setTimezone(zone);setFrom(shiftDay(today,-29));setTo(today);}).catch(e=>setError(e.message));},[]);
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
  return (
    <main className="stack" data-workbench="reports">
      <WorkspaceHeading
        title={t('تقارير النشاط والمبيعات', 'Activity and sales reports')}
        description={t('يعرض التقرير الأيام حسب توقيت مساحة العمل، ويشمل يوم النهاية.', 'Reports use your workspace timezone and include the final day.')}
      />
      <form
        className="card form-actions"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError('');
          setReport(null);
          try {
            const result = await api<Report>(
                '/reports?' +
                  new URLSearchParams(reportRange(from,to,timezone)),
              );
            setReport(result);
            setActiveReport(result.firstResponse ? 'response' : sections.find(([key])=>result[key].length>0)?.[0] ?? 'daily');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="field">
          {t('من', 'From')}
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          {t('إلى (شامل)', 'To (inclusive)')}
          <input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <p>{t('توقيت الشركة','Workspace timezone')}: <bdi>{timezone || '…'}</bdi></p>
        <label className="field">{t('فترة جاهزة','Preset range')}<select defaultValue="" disabled={!timezone} onChange={e=>{if(!e.target.value)return;const today=localDay(new Date(),timezone);setTo(today);setFrom(shiftDay(today,-Number(e.target.value)+1));}}><option value="">{t('اختر فترة','Choose range')}</option><option value="1">{t('اليوم','Today')}</option><option value="7">{t('آخر 7 أيام','Last 7 days')}</option><option value="30">{t('آخر 30 يومًا','Last 30 days')}</option></select></label>
        <button className="btn btn-primary" disabled={loading || !timezone}>
          {loading ? t('جارٍ التحميل…', 'Loading…') : t('عرض التقارير', 'View reports')}
        </button>
        {report && (
          <button
            className="btn"
            type="button"
            onClick={() =>
              download('reports.json', JSON.stringify(report, null, 2), 'application/json')
            }
          >
            {t('تصدير كل التقارير', 'Export all reports')}
          </button>
        )}
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!report && !loading && (
        <p className="card empty">
          {t(
            'اختر الفترة لعرض إحصائيات شركتك.',
            'Choose a date range to view workspace statistics.',
          )}
        </p>
      )}
      {report && (
        <>
          <details className="card report-method"><DisclosureSummary>{t('طريقة احتساب التقارير والقيود','Report methodology and limitations')}</DisclosureSummary><p className="muted">
            {t(
              'التكلفة تقديرية؛ القيم غير المسعّرة تبقى فارغة. المبالغ معروضة بالعملة الرئيسية لكل صف دون جمع العملات. الإرسال لا يعني التسليم.',
              'Costs are estimates; unpriced runs remain blank. Amounts use each row’s main currency unit; currencies remain separate. Sent does not mean delivered.',
            )}
          </p>
          <p className="muted">{t('إجمالي القنوات يستبعد ملاحظات الفريق والأحداث الداخلية. نشاط الموظف يعرض المحاولات مع فصل المُرسل والفاشل وما في الطابور؛ المُرسل لا يعني التسليم. حالات البوت ليست دليل حل المحادثة، ولا يتوفر قياس معتمد للوقت الموفّر بعد.','Channel totals exclude team notes and internal events. Staff activity shows attempts with sent, failed and queued counts; sent does not mean delivered. Bot states do not establish conversation resolution; measured time savings are not available yet.')}</p></details>
          <section className="card report-summary"><div><h2>{t('نتائج الفترة','Period results')}</h2><p className="muted"><bdi>{localDay(new Date(report.range.from),report.timezone || timezone)}</bdi> — <bdi>{localDay(new Date(Date.parse(report.range.to)-1),report.timezone || timezone)}</bdi> · <bdi>{report.timezone || timezone}</bdi></p></div><div><strong>{sections.filter(([key])=>report[key].length>0).length} / {sections.length}</strong><small>{t('أقسام تحتوي بيانات','Sections with data')}</small></div><label><input type="checkbox" checked={hideEmpty} onChange={e=>setHideEmpty(e.target.checked)}/>{t('إخفاء الأقسام الفارغة','Hide empty sections')}</label></section>
          <nav className="workbench-tabs" aria-label={t('نوع التقرير','Report type')}>
            {report.firstResponse&&<button type="button" aria-pressed={activeReport==='response'} onClick={()=>setActiveReport('response')}>{t('سرعة الرد','Response time')}</button>}
            {sections.filter(([key])=>!hideEmpty||report[key].length).map(([key,title])=><button type="button" key={key} aria-pressed={activeReport===key} onClick={()=>setActiveReport(key)}>{title}</button>)}
          </nav>
          {!(activeReport==='response'&&report.firstResponse)&&!sections.some(([key])=>key===activeReport&&(!hideEmpty||report[key].length))&&<p className="card empty">{t('اختر تقريرًا من الأقسام المتاحة أعلاه.','Choose an available report above.')}</p>}
          {activeReport==='response' && report.firstResponse && <section className="card" aria-label={t('وقت أول رد بشري','First human response time')}>
            <h2>{t('وقت أول رد بشري','First human response time')}</h2>
            <p><strong>{report.firstResponse.average_ms === null ? t('لا توجد ردود بشرية مقاسة خلال الفترة','No measured human replies in this period') : new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en',{maximumFractionDigits:1}).format(report.firstResponse.average_ms/1000)+' '+t('ثانية','seconds')}</strong></p>
            <p>{t('محادثات رُد عليها','Answered conversations')}: {report.firstResponse.answered} · {t('لم يصلها رد بشري','Without a human reply')}: {report.firstResponse.unanswered}</p>
            <p>{t('عينة واحدة لكل محادثة: من أقدم رسالة واردة ضمن الفترة إلى أول رد موظف مُرسَل بعدها وقبل نهاية الفترة. تُستبعد ملاحظات الفريق وردود البوت والإرسال الفاشل؛ المحادثات دون رد لا تُحسب بصفر.','One sample per conversation: earliest inbound in range to its first sent staff reply before the range ends. Internal notes, bot replies and failed sends are excluded; unanswered conversations are not counted as zero.')}</p>
          </section>}
          {sections.filter(([key])=>key===activeReport && (!hideEmpty || report[key].length>0)).map(([key, title]) => {
            const rows = report[key];
            const headers = rows.length ? Object.keys(rows[0]) : [];
            return (
              <section key={key} id={'report-'+key} className="card table-wrap">
                <div className="form-actions">
                  <h2>{title}</h2>
                  <button
                    className="btn"
                    disabled={!rows.length}
                    onClick={() => download(key + '.csv', exportCsv(rows.map(row => Object.fromEntries(headers.map(h => [reportColumn(h,t), ['status','lifecycle'].includes(h) ? statusLabel(String(row[h] || ''),t) : reportValue(h,row[h],row,language,t)]))), headers.map(h=>reportColumn(h,t))))}
                  >
                    {t('تصدير CSV', 'Export CSV')}
                  </button>
                </div>
                {!rows.length ? (
                  <p className="empty">
                    {t('لا توجد بيانات ضمن الفترة.', 'No data in this range.')}
                  </p>
                ) : (
                  <table className="product-table">
                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th key={h} scope="col" role="columnheader">{reportColumn(h,t)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h}>{h === 'id' ? <details><DisclosureSummary>{t('عرض المرجع','Show reference')}</DisclosureSummary><code>{row[h]}</code></details> : ['status','lifecycle'].includes(h) ? statusLabel(String(row[h] || ''),t) : reportValue(h,row[h],row,language,t)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
