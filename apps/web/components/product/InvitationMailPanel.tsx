'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from './locale';
type Job = { id: string; status: string; error: string | null; created_at: string };
export function InvitationMailPanel({ refreshKey }: { refreshKey: string }) {
  const { t, language } = useLocale();
  const [jobs, setJobs] = useState<Job[]>([]),
    [html, setHtml] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setJobs(await api<Job[]>('/workspace/mail'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [refreshKey]);
  async function run(id?: string) {
    setBusy(true);
    setError('');
    try {
      if (id) {
        await api('/workspace/mail/' + id + '/resume', { method: 'POST' });
        await load();
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
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <div className="page-heading">
        <h2>{t('بريد دعوات الفريق', 'Team invitation mail')}</h2>
        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={() => run()}>
            {t('معاينة الهوية', 'Preview branding')}
          </button>
          <button className="btn" disabled={busy} onClick={load}>
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
      {html && (
        <iframe
          title={t('معاينة رسالة الدعوة', 'Invitation email preview')}
          sandbox=""
          srcDoc={html}
          style={{ width: '100%', height: 430, border: 0 }}
        />
      )}
      {!jobs.length ? (
        <p className="empty">{t('لا توجد رسائل دعوة بعد.', 'No invitation emails yet.')}</p>
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
              {jobs.map((j) => (
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
                  <td>{j.error ?? '—'}</td>
                  <td>
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
