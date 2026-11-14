'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../../../lib/api';
import { useLocale } from '../../../../../components/product/locale';
import { channelHref } from '../../../../../lib/channel-context';
import styles from './input-report.module.css';

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

export default function InputFlowReportPage({ params }: { params: { id: string } }) {
  const { t, language } = useLocale();
  const searchParams = useSearchParams();
  const channelId = searchParams.get('channelId');
  const [report, setReport] = useState<InputFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
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
  }, [params.id, t]);

  const back = channelHref('/dashboard/flows?section=entry_points', channelId ?? '');
  const dateText = (value: string) =>
    new Date(value).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB');

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
      {error && <p role="alert" className={styles.error}>{error}</p>}
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
          <div className={styles.tableWrap}>
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
                {report.records.map((record, index) => (
                  <tr key={record.id}>
                    <td>{index + 1}</td>
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
                {!report.records.length && (
                  <tr><td colSpan={report.fields.length + 4} className={styles.empty}>
                    {t('لم تُسجل إجابات لهذا التدفق بعد.', 'No responses have been recorded for this flow yet.')}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
