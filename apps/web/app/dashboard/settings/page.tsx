'use client';
import Link from 'next/link';
import TimezonePicker from '../../../components/product/TimezonePicker';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
export default function Settings() {
  const { t } = useLocale();
  const [data, setData] = useState<{
    name: string;
    industry: string;
    timezone: string;
    language: string;
    preferredPlan: string;
    currentPlan: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{
      tenant: {
        name: string;
        settings: { industry?: string; timezone?: string; language?: string };
        preferred_plan: string;
      };
      plan?: {plan_name:string};
    }>('/workspace')
      .then(({ tenant: w, plan }) =>
        setData({
          name: w.name,
          industry: w.settings.industry || '',
          timezone: w.settings.timezone || 'Africa/Cairo',
          language: w.settings.language || 'ar',
          preferredPlan: w.preferred_plan,
          currentPlan: plan?.plan_name || '—',
        }),
      )
      .catch((e) => setError(e.message));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/workspace', { method: 'PATCH', body: JSON.stringify({name:data.name,industry:data.industry,timezone:data.timezone,language:data.language,preferredPlan:data.preferredPlan}) });
      setMessage(t('تم حفظ إعدادات الشركة.', 'Workspace settings saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('مساحة العمل', 'WORKSPACE')}</p>
          <h1>{t('إعدادات الشركة', 'Workspace settings')}</h1>
          <p>
            {t(
              'عرّف نشاطك ولغة العمل والمنطقة الزمنية.',
              'Set your business identity, language and timezone.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!data ? (
        <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : (
        <form onSubmit={save} className="card">
          <div className="form-grid">
            <label className="field">
              {t('اسم الشركة', 'Company name')}
              <input
                required
                maxLength={120}
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
            </label>
            <label className="field">
              {t('مجال النشاط', 'Industry')}
              <input
                maxLength={100}
                value={data.industry}
                onChange={(e) => setData({ ...data, industry: e.target.value })}
              />
            </label>
            <TimezonePicker value={data.timezone} onChange={timezone=>setData({...data,timezone})} />
            <label className="field">
              {t('لغة الشركة', 'Workspace language')}
              <select
                value={data.language}
                onChange={(e) => setData({ ...data, language: e.target.value })}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <div className="field"><strong>{t('الخطة الحالية','Current plan')}: {data.currentPlan}</strong><Link className="btn" href="/dashboard/billing">{t('إدارة الاشتراك وطلب ترقية','Manage subscription and request upgrade')}</Link></div>
          </div>
          <div className="form-actions">
            <button disabled={busy} className="btn btn-primary">
              {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الإعدادات', 'Save settings')}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
