'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Preview = { cutoff: string; historyRows: number; jobPayloads: number };
export function CrmRetention() {
  const { t } = useLocale(),
    workspace = useData<{ role: string }>('/workspace', { role: '' });
  const [days, setDays] = useState(90),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  if (workspace.data.role !== 'owner') return null;
  async function run(apply: boolean) {
    setBusy(true);
    setError('');
    setDone(false);
    try {
      if (apply && preview) {
        await api('/crm/jobs/retention/apply', {
          method: 'POST',
          body: JSON.stringify({ ...preview, confirmed: true }),
        });
        setPreview(null);
        setDone(true);
      } else
        setPreview(
          await api('/crm/jobs/retention/preview', {
            method: 'POST',
            body: JSON.stringify({ days }),
          }),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card stack">
      <summary>
        {t('الاحتفاظ بسجل CRM وملفات المهام', 'CRM history & job payload retention')}
      </summary>
      <p>
        {t(
          'تنظيف يدوي بعد المراجعة. يحتفظ بالسجل السابق اللازم لكل عميل لإعادة بناء التاريخ بعد الحد، ويزيل الملفات القديمة للمهام المكتملة والملغاة فقط. لا يحذف العملاء أو الموافقات أو المهام النشطة.',
          'Manual reviewed cleanup retains the predecessor needed to reconstruct each contact after the cutoff. Only old completed/canceled job payloads expire. Contacts, consent and active jobs are preserved.',
        )}
      </p>
      <label className="field">
        {t('الاحتفاظ بعدد أيام', 'Days to retain')}
        <input
          type="number"
          min={7}
          max={3650}
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setPreview(null);
          }}
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice" role="status">
          {t('اكتمل التنظيف وسُجّل في التدقيق.', 'Cleanup completed and audited.')}
        </p>
      )}
      <button
        className="btn"
        disabled={busy || !Number.isInteger(days) || days < 7 || days > 3650}
        onClick={() => run(false)}
      >
        {t('معاينة التنظيف', 'Preview cleanup')}
      </button>
      {preview && (
        <div className="notice stack">
          <p>
            {t('سجلات تاريخ ستحذف: ', 'History records to remove: ')}
            {preview.historyRows} · {t('ملفات مهام ستنتهي: ', 'Job payloads to expire: ')}
            {preview.jobPayloads}
          </p>
          <p>{new Date(preview.cutoff).toLocaleString()}</p>
          <button className="btn btn-danger" disabled={busy} onClick={() => run(true)}>
            {t('تأكيد التنظيف النهائي', 'Confirm permanent cleanup')}
          </button>
        </div>
      )}
    </details>
  );
}
