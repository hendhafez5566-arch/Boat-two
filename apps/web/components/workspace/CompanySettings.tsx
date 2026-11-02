'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';

type Workspace = {
  role: string;
  tenant: {
    name: string;
    preferred_plan: string;
    settings: { industry?: string; timezone?: string; language?: string };
  };
};
export default function CompanySettings() {
  const { t } = useLocale();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError('');
    try {
      setWorkspace(await api<Workspace>('/workspace'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || busy) return;
    const form = new FormData(event.currentTarget);
    const timezone = String(form.get('timezone') || '').trim();
    setSaved(false);
    setError('');
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      setError(
        t(
          'اختر منطقة زمنية صحيحة، مثل Africa/Cairo.',
          'Choose a valid timezone, such as Africa/Cairo.',
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const tenant = await api<Workspace['tenant']>('/workspace', {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(form.get('name') || '').trim(),
          industry: String(form.get('industry') || '').trim(),
          timezone,
          language: form.get('language'),
          preferredPlan: workspace.tenant.preferred_plan,
        }),
      });
      setWorkspace({ ...workspace, tenant });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {loading && <p role="status">{t('جارٍ تحميل بيانات الشركة…', 'Loading company details…')}</p>}
      {error && (
        <div className="notice error" role="alert">
          {error}
          {!workspace && (
            <button className="btn" onClick={() => void load()}>
              {t('إعادة المحاولة', 'Retry')}
            </button>
          )}
        </div>
      )}
      {saved && (
        <div className="notice" role="status">
          {t('تم حفظ بيانات الشركة.', 'Company details saved.')}{' '}
          <Link href="/dashboard/onboarding">{t('متابعة دليل البداية', 'Continue setup')}</Link>
        </div>
      )}
      {workspace &&
        (['owner', 'admin'].includes(workspace.role) ? (
          <form className="stack" onSubmit={save}>
            <fieldset className="stack" disabled={busy}>
              <label className="field">
                {t('اسم الشركة', 'Company name')}
                <input name="name" required maxLength={120} defaultValue={workspace.tenant.name} />
              </label>
              <label className="field">
                {t('مجال العمل', 'Industry')}
                <input
                  name="industry"
                  required
                  maxLength={100}
                  defaultValue={workspace.tenant.settings.industry || ''}
                  placeholder={t('مثل السياحة والسفر', 'For example, travel and tourism')}
                />
              </label>
              <label className="field">
                {t('المنطقة الزمنية للشركة', 'Company timezone')}
                <input
                  name="timezone"
                  required
                  maxLength={60}
                  list="company-timezones"
                  dir="ltr"
                  defaultValue={workspace.tenant.settings.timezone || 'Africa/Cairo'}
                />
                <small>
                  {t(
                    'تُستخدم في التقارير ومواعيد المتابعة.',
                    'Used for reports and follow-up dates.',
                  )}
                </small>
              </label>
              <datalist id="company-timezones">
                {['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'UTC'].map(
                  (zone) => (
                    <option key={zone} value={zone} />
                  ),
                )}
              </datalist>
              <label className="field">
                {t('لغة الشركة', 'Company language')}
                <select name="language" defaultValue={workspace.tenant.settings.language || 'ar'}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" disabled={busy}>
                  {busy
                    ? t('جارٍ الحفظ…', 'Saving…')
                    : t('حفظ بيانات الشركة', 'Save company details')}
                </button>
                <Link className="btn" href="/dashboard/onboarding">
                  {t('دليل البداية', 'Getting started')}
                </Link>
              </div>
            </fieldset>
          </form>
        ) : (
          <p className="notice">
            {t(
              'اطلب من مالك الشركة أو المسؤول تعديل بيانات الشركة.',
              'Ask your workspace owner or administrator to edit company details.',
            )}
          </p>
        ))}
    </div>
  );
}
