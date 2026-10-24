'use client';
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
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  useEffect(()=>{api<{tenant:{settings?:{timezone?:string}}}>('/workspace').then(w=>{const zone=w.tenant.settings?.timezone || 'Africa/Cairo';const today=localDay(new Date(),zone);setTimezone(zone);setFrom(shiftDay(today,-29));setTo(today);}).catch(e=>setError(e.message));},[]);
  const sections: [keyof Omit<Report, 'range' | 'timezone'>, string][] = [
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
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('التحليلات والتقارير', 'ANALYTICS & REPORTS')}</p>
          <h1>{t('تقارير النشاط والمبيعات', 'Activity and sales reports')}</h1>
          <p>
            {t(
              'اختر أيامًا بتوقيت شركتك. يوم النهاية مشمول بالكامل؛ تُحوّل الحدود تلقائيًا للتقرير.',
              'Choose calendar days in your workspace timezone. The final day is included; report bounds are converted automatically.',
            )}
          </p>
        </div>
      </div>
      <form
        className="card form-actions"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError('');
          try {
            setReport(
              await api<Report>(
                '/reports?' +
                  new URLSearchParams(reportRange(from,to,timezone)),
              ),
            );
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
          <p className="notice">
            {t(
              'التكلفة تقديرية؛ القيم غير المسعّرة تبقى فارغة. المبالغ معروضة بالعملة الرئيسية لكل صف دون جمع العملات. الإرسال لا يعني التسليم.',
              'Costs are estimates; unpriced runs remain blank. Amounts use each row’s main currency unit; currencies remain separate. Sent does not mean delivered.',
            )}
          </p>
          <section className="card"><strong>{t('ملخص التقرير','Report summary')}</strong><p>{t('أقسام تحتوي بيانات','Sections with data')}: {sections.filter(([key])=>report[key].length>0).length} {t('من','of')} {sections.length}</p><p><bdi>{localDay(new Date(report.range.from),report.timezone || timezone)}</bdi> — <bdi>{localDay(new Date(Date.parse(report.range.to)-1),report.timezone || timezone)}</bdi> · <bdi>{report.timezone || timezone}</bdi></p><label><input type="checkbox" checked={hideEmpty} onChange={e=>setHideEmpty(e.target.checked)} /> {t('إخفاء الأقسام الفارغة','Hide empty sections')}</label><nav className="form-actions">{sections.filter(([key])=>!hideEmpty || report[key].length).map(([key,title])=><a className="btn" key={key} href={'#report-'+key}>{title}</a>)}</nav></section>
          {sections.filter(([key])=>!hideEmpty || report[key].length>0).map(([key, title]) => {
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
                          <th key={h}>{reportColumn(h,t)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h}>{h === 'id' ? <details><summary>{t('عرض المرجع','Show reference')}</summary><code>{row[h]}</code></details> : ['status','lifecycle'].includes(h) ? statusLabel(String(row[h] || ''),t) : reportValue(h,row[h],row,language,t)}</td>
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
