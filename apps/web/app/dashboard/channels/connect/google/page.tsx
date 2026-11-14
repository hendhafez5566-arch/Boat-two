'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../../../../lib/api';
import { useData } from '../../../../../components/business/useData';
import { useLocale } from '../../../../../components/product/locale';
import ChannelLogo from '../../../../../components/product/ChannelLogo';
import styles from '../../../../../components/product/meta-connection-page.module.css';
type Account = {
  id: string;
  provider: string;
  name: string;
  enabled: boolean;
  status: string;
  config?: { scopes?: string[] };
};
export default function GoogleConnectionPage() {
  const { t } = useLocale();
  const capabilities = useData<{ google?: { configured: boolean; externalEnabled: boolean } }>(
    '/integrations/capabilities',
    {},
  );
  const accounts = useData<Account[]>('/integrations', []);
  const rows = accounts.data.filter((a) => a.provider === 'google');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ authorizeUrl: string }>('/integrations/google/start', {
        method: 'POST',
        body: JSON.stringify({ purposes: ['calendar', 'contacts_read'] }),
      });
      const url = new URL(result.authorizeUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com')
        throw new Error(t('عنوان تفويض غير صالح.', 'Invalid authorization address.'));
      window.location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className={`stack ${styles.page}`}>
      <nav aria-label={t('مسار الصفحة', 'Breadcrumb')}>
        <Link href="/dashboard/channels">{t('ربط الحساب', 'Connect Account')}</Link> / Google
      </nav>
      <div className="page-heading">
        <div>
          <h1>{t('تكامل Google', 'Google Integration')}</h1>
          <p>
            {t(
              'اربط حساب Google لإدارة التقويم وجهات الاتصال.',
              'Connect your Google account to manage calendar and contacts.',
            )}
          </p>
        </div>
      </div>
      <div className={styles.statistics}>
        {[
          [t('حسابات Google', 'Google Accounts'), rows.length],
          [
            t('صلاحية Sheets', 'Sheets Access'),
            rows.filter(
              (a) => a.enabled && a.config?.scopes?.some((s) => s.includes('/spreadsheets')),
            ).length,
          ],
          [
            t('صلاحية التقويم', 'Calendar Access'),
            rows.filter((a) => a.enabled && a.config?.scopes?.some((s) => s.includes('/calendar')))
              .length,
          ],
          [
            t('وصول محدود', 'Limited Access'),
            rows.filter((a) => a.enabled && !a.config?.scopes?.length).length,
          ],
        ].map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{accounts.loading ? '—' : count}</strong>
          </div>
        ))}
      </div>
      <section className="card stack">
        <h2>{t('اربط حساب Google', 'Connect Google Account')}</h2>
        <p>
          {t(
            'تابع إلى Google لاختيار حسابك ومراجعة الأذونات. صلاحية جهات الاتصال للقراءة فقط.',
            'Continue to Google to choose your account and review permissions. Contacts access is read-only.',
          )}
        </p>
        <button
          className="btn"
          onClick={connect}
          disabled={
            busy ||
            capabilities.loading ||
            !capabilities.data.google?.configured ||
            !capabilities.data.google?.externalEnabled
          }
          style={{ alignSelf: 'start', display: 'flex', gap: 10, alignItems: 'center' }}
        >
          <span style={{ width: 20, height: 20 }}>
            <ChannelLogo id="google" />
          </span>
          {busy
            ? t('جارٍ التحويل…', 'Redirecting…')
            : t('تسجيل الدخول باستخدام Google', 'Sign in with Google')}
        </button>
        {!capabilities.loading &&
          (!capabilities.data.google?.configured || !capabilities.data.google?.externalEnabled) && (
            <p className="notice">
              {t(
                'يحتاج ربط Google إلى تهيئة المشغّل وتفعيل الاتصال الخارجي.',
                'Google connection requires operator configuration and enabled external access.',
              )}
            </p>
          )}
        {!!(error || capabilities.error || accounts.error) && (
          <p role="alert" className="notice error">
            {error || capabilities.error || accounts.error}
          </p>
        )}
      </section>
      <section className="card stack">
        <h2>{t('الحسابات المتصلة', 'Connected Accounts')}</h2>
        {rows.length ? (
          rows.map((a) => (
            <div className="card" key={a.id}>
              <strong>{a.name}</strong>
              <p>
                {a.enabled && a.status === 'connected'
                  ? t('متصل', 'Connected')
                  : t('غير متصل', 'Disconnected')}
              </p>
              <Link className="btn" href="/dashboard/settings?tab=integrations">
                {t('إدارة الحساب', 'Manage account')}
              </Link>
            </div>
          ))
        ) : (
          <p>
            {accounts.loading
              ? t('جارٍ التحميل…', 'Loading…')
              : t('لا توجد حسابات Google مرتبطة.', 'No Google accounts connected.')}
          </p>
        )}
      </section>
    </main>
  );
}
