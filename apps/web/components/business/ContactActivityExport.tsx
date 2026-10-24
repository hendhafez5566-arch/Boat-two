'use client';
import { useState } from 'react';
import { useLocale } from '../product/locale';
import { api } from '../../lib/api';
export function ContactActivityExport({ contactId }: { contactId: string }) {
  const { t } = useLocale();
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState(''),
    [error, setError] = useState('');
  return (
    <details className="card">
      <summary>{t('تصدير سجل العميل والموافقات', 'Export customer activity and consent')}</summary>
      <form
        className="stack mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setJob('');
          try {
            const result = await api<{ id: string }>('/crm/jobs', {
              method: 'POST',
              body: JSON.stringify({
                kind: 'activity_export',
                contactId,
                ...(from ? { from: new Date(from).toISOString() } : {}),
                ...(to ? { to: new Date(to).toISOString() } : {}),
              }),
            });
            setJob(result.id);
            window.dispatchEvent(new Event('boat:crm-jobs'));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          {t(
            'يتضمن السجل المحفوظ للملف والموافقات والملاحظات والمحادثات والأحداث، مع القيم الحالية للصفقات والمتابعات وهويات العميل المدمجة. لا يعيد إنشاء تاريخ حُذف بالاحتفاظ أو لم يسجله الدفتر بعد. حد اللقطة 50,000 سجل؛ ضيّق الفترة عند الحاجة.',
            'Includes retained profile/consent history, notes, conversation metadata and events, with current deal/task values and merged identities. It cannot reconstruct expired history or changes not yet observed by the journal. Snapshots support 50,000 records; narrow the dates if needed.',
          )}
        </p>
        <div className="form-grid">
          <label className="field">
            {t('السجل من (اختياري)', 'Activity from (optional)')}
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            {t('السجل إلى (اختياري)', 'Activity to (optional)')}
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy
            ? t('جارٍ إنشاء اللقطة…', 'Creating snapshot…')
            : t('إنشاء لقطة سجل العميل', 'Create activity snapshot')}
        </button>
        {job && (
          <p className="notice" role="status">
            {t(
              'حُفظت اللقطة وأُضيفت لطابور المعالجة. نزّل JSON من مهام الاستيراد والتصدير بعد الاكتمال.',
              'Snapshot saved and queued. Download its JSON from import/export jobs after completion.',
            )}{' '}
            <a className="underline" href="#crm-jobs">
              {t('افتح مهام التصدير', 'Open export jobs')}
            </a>
          </p>
        )}
      </form>
    </details>
  );
}
