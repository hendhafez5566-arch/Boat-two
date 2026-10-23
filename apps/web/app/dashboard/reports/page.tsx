'use client';
import { useState } from 'react';
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
  const { t } = useLocale();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
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
          <p className="eyebrow">ANALYTICS & REPORTS</p>
          <h1>{t('تقارير النشاط والمبيعات', 'Activity and sales reports')}</h1>
          <p>
            {t(
              'بيانات فعلية من سجلات شركتك. التواريخ بتوقيت UTC، ونهاية الفترة غير مشمولة.',
              'Actual workspace ledger data. Dates use UTC and the end date is exclusive.',
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
                  new URLSearchParams({
                    from: new Date(from).toISOString(),
                    to: new Date(to).toISOString(),
                  }),
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
          {t('إلى (غير شامل)', 'To (exclusive)')}
          <input type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={loading}>
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
              'التكلفة تقديرية؛ القيم غير المسعّرة تبقى فارغة. قيمة المبيعات بالسنت ولا تُجمع العملات. الإرسال لا يعني التسليم.',
              'Costs are estimates; unpriced runs remain blank. Sales values are in cents and currencies stay separate. Sent does not mean delivered.',
            )}
          </p>
          {sections.map(([key, title]) => {
            const rows = report[key];
            const headers = rows.length ? Object.keys(rows[0]) : [];
            return (
              <section key={key} className="card table-wrap">
                <div className="form-actions">
                  <h2>{title}</h2>
                  <button
                    className="btn"
                    disabled={!rows.length}
                    onClick={() => download(key + '.csv', exportCsv(rows, headers))}
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
                          <th key={h}>{h.replaceAll('_', ' ')}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h}>{row[h] ?? '—'}</td>
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
