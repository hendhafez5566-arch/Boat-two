'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
import { api } from '../../../lib/api';
import type { BillingStatus, BillingWorkspace } from '../../../lib/billing-display';
import styles from './account.module.css';
type Profile = { phone: string; address: string; timezone: string; language: string };
type User = {
  id: string;
  email: string;
  full_name: string | null;
  account_profile: Partial<Profile>;
};
type Workspace = BillingWorkspace & {
  usage: Record<string, number>;
  aiEnabled: boolean;
  plan: BillingWorkspace['plan'] & { limits?: Record<string, number> };
};
function dateLabel(value: string, language: string, timezone: string) {
  try {
    return new Date(value).toLocaleDateString(language, { timeZone: timezone });
  } catch {
    return '—';
  }
}
export default function Account() {
  const { t, language, toggle } = useLocale();
  const me = useData<{ user: User } | null>('/auth/me', null);
  const ws = useData<Workspace | null>('/workspace', null);
  const billing = useData<BillingStatus | null>('/billing/status', null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    timezone: 'UTC',
    language: 'ar',
  });
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!me.data?.user) return;
    const user = me.data.user,
      profile = user.account_profile || {};
    setForm({
      fullName: user.full_name || '',
      phone: profile.phone || '',
      address: profile.address || '',
      timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      language: profile.language || (localStorage.getItem('boat-language') === 'en' ? 'en' : 'ar'),
    });
    setReady(true);
  }, [me.data]);
  const expiry =
    billing.data?.subscription?.currentPeriodEnd ||
    (ws.data?.plan.status === 'trialing' ? ws.data.plan.trial_ends_at : null);
  const field = (key: keyof typeof form, value: string) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api('/auth/profile', { method: 'PATCH', body: JSON.stringify(form) });
      if (form.language !== language) toggle();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <header>
        <h1>{t('الحساب', 'Account')}</h1>
        <p>{t('معلومات الحساب', 'Account Information')}</p>
      </header>
      {(me.error || ws.error || billing.error || error) && (
        <p role="alert" className="notice error">
          {me.error || ws.error || billing.error || error}
        </p>
      )}
      <section className={styles.summary} aria-label={t('ملخص الحساب', 'Account package summary')}>
        <div>
          <span className={styles.package}>
            <NavIcon name="commerce" />
          </span>
          <div>
            <small>{t('الباقة', 'Package')}</small>
            <strong>{ws.data?.plan.plan_name || '—'}</strong>
          </div>
        </div>
        <div>
          <span className={styles.expiry}>
            <NavIcon name="calendar" />
          </span>
          <div>
            <small>{t('انتهاء الحساب', 'Account Expiry')}</small>
            <strong>
              {expiry
                ? dateLabel(expiry, language, form.timezone)
                : billing.data && ws.data
                  ? t('غير محدد', 'Not specified')
                  : '—'}
            </strong>
          </div>
        </div>
        <div>
          <span className={styles.billing}>
            <NavIcon name="billing" />
          </span>
          <div>
            <small>{t('الفوترة', 'Billing')}</small>
            <Link href="/dashboard/billing">{t('الانتقال إلى الفوترة', 'Go to Billing')} →</Link>
          </div>
        </div>
      </section>
      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>{t('تحديث الحساب', 'Update Account')}</h2>
          <form onSubmit={save}>
            <fieldset disabled={!ready || busy}>
              <label>
                {t('الاسم', 'NAME')} *
                <span className={styles.input}>
                  <NavIcon name="user" />
                  <input
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={form.fullName}
                    onChange={(e) => field('fullName', e.target.value)}
                  />
                </span>
              </label>
              <div className={styles.pair}>
                <label>
                  {t('البريد الإلكتروني', 'EMAIL')} *
                  <span className={styles.input}>
                    <NavIcon name="mail" />
                    <input type="email" readOnly value={me.data?.user.email || ''} />
                  </span>
                </label>
                <label>
                  {t('رقم واتساب', 'WHATSAPP MOBILE NUMBER')}
                  <span className={styles.input}>
                    <NavIcon name="phone" />
                    <input
                      type="tel"
                      maxLength={25}
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => field('phone', e.target.value)}
                    />
                  </span>
                </label>
              </div>
              <label>
                {t('العنوان', 'ADDRESS')}
                <textarea
                  maxLength={1000}
                  rows={3}
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(e) => field('address', e.target.value)}
                />
              </label>
              <label>
                {t('المنطقة الزمنية للحساب', 'ACCOUNT TIMEZONE')}
                <input
                  required
                  maxLength={80}
                  dir="ltr"
                  list="account-timezones"
                  value={form.timezone}
                  onChange={(e) => field('timezone', e.target.value)}
                />
                <datalist id="account-timezones">
                  {[
                    'UTC',
                    'Africa/Cairo',
                    'Asia/Riyadh',
                    'Asia/Dubai',
                    'Asia/Dhaka',
                    'Europe/London',
                    'America/New_York',
                  ].map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </label>
              <label>
                {t('لغة التطبيق', 'APPLICATION LANGUAGE')}
                <select value={form.language} onChange={(e) => field('language', e.target.value)}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
              <button className="btn primary" type="submit">
                {' '}
                <NavIcon name="edit" />{' '}
                {busy ? t('جارٍ التحديث…', 'Updating…') : t('تحديث', 'Update')}
              </button>
            </fieldset>
            {saved && <p role="status">{t('تم تحديث حسابك.', 'Your account has been updated.')}</p>}
          </form>
        </section>
        <aside className={styles.logs}>
          <details className={styles.panel}>
            <summary>
              <span>
                <strong>{t('سجل الاستخدام', 'Usage Log')}</strong>
                <small>{t('الاستخدام الحالي لحسابك.', 'Current usage for your account.')}</small>
              </span>
              <NavIcon name="chevron" />
            </summary>
            <div className={styles.usage}>
              {[
                ['contacts', 'جهات الاتصال', 'Subscribers'],
                ['messages_per_month', 'الرسائل', 'Messages'],
                ['channels', 'الحسابات', 'Accounts'],
                ['agents', 'أعضاء الفريق', 'Team members'],
              ].map(([key, ar, en]) => (
                <div key={key}>
                  <span>{t(ar, en)}</span>
                  <strong>{ws.data ? (ws.data.usage[key]?.toLocaleString() ?? '—') : '—'}</strong>
                </div>
              ))}
            </div>
          </details>
          <details className={styles.panel}>
            <summary>
              <span>
                <strong>{t('استخدام رموز الذكاء الاصطناعي', 'AI Token Usage Log')}</strong>
                <small>
                  {t(
                    'استخدام رموز الذكاء الاصطناعي للشهر الحالي.',
                    'AI token usage for the current month.',
                  )}
                </small>
              </span>
              <NavIcon name="chevron" />
            </summary>
            <div className={styles.usage}>
              {ws.data?.aiEnabled ? (
                <div>
                  <span>{t('هذا الشهر', 'This month')}</span>
                  <strong>{Number(ws.data.usage.ai_tokens || 0).toLocaleString()}</strong>
                </div>
              ) : (
                <p>
                  {t(
                    'الذكاء الاصطناعي غير مفعّل لهذا الحساب.',
                    'AI is not enabled for this account.',
                  )}
                </p>
              )}
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}
