'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../../../../lib/api';
import { useData } from '../../../../../components/business/useData';
import { useLocale } from '../../../../../components/product/locale';
import ChannelLogo from '../../../../../components/product/ChannelLogo';
import { NavIcon } from '../../../../../components/product/NavIcon';
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
  const [search, setSearch] = useState('');
  const visible = rows.filter((account) =>
    account.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  async function disconnect(account: Account) {
    if (
      disconnecting ||
      !window.confirm(
        t(
          'هل تريد فصل حساب Google؟ ستتوقف التكاملات التي تستخدم هذا الحساب.',
          'Disconnect this Google account? Integrations using this account will stop.',
        ),
      )
    )
      return;
    setDisconnecting(account.id);
    setError('');
    try {
      await api(`/integrations/${account.id}/disconnect`, { method: 'POST' });
      await accounts.reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDisconnecting(null);
    }
  }
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
      <header className={styles.heading}><span className={styles.brandIcon} data-platform="google"><ChannelLogo id="google"/></span><div className={styles.headingCopy}>
          <h1>{t('تكامل Google', 'Google Integration')}</h1>
          <p>
            {t(
              'اربط حساب Google لإدارة التقويم وجهات الاتصال.',
              'Connect your Google account to manage calendar and contacts.',
            )}
          </p>
        </div>
      </header>
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
        ].map(([label, count],i) => (
          <div key={label} data-tone={i}><i><NavIcon name={['team','list','calendar','shield'][i]}/></i>
            <span>{label}</span>
            <strong>{accounts.loading ? '—' : count}</strong>
          </div>
        ))}
      </div>
      <section className="card stack">
        <div className={styles.compactIntro}><div><h2>{t('اربط حساب Google', 'Connect Google Account')}</h2>
        <p>
          {t(
            'تابع إلى Google لاختيار حسابك ومراجعة الأذونات. صلاحية جهات الاتصال للقراءة فقط.',
            'Continue to Google to choose your account and review permissions. Contacts access is read-only.',
          )}
        </p>
        </div><button
          className="btn btn-primary"
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
        </button></div>
        {!capabilities.loading &&
          (!capabilities.data.google?.configured || !capabilities.data.google?.externalEnabled) && (
            <p className={styles.warning}><NavIcon name="flag"/> {t(
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
        <div className={styles.sectionToolbar}><h2>{t('حسابات Google', 'Google Accounts')}</h2><label><NavIcon name="search"/><input type="search" aria-label={t('بحث في حسابات Google','Search Google accounts')} placeholder={t('بحث…','Search…')} value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
        {accounts.error && (
          <button className="btn" onClick={() => void accounts.reload()}>
            {t('إعادة التحميل', 'Reload')}
          </button>
        )}
        {!!rows.length && !visible.length && (
          <p>{t('لا توجد نتائج مطابقة.', 'No matching accounts.')}</p>
        )}
        {rows.length ? (
          visible.map((a) => (
            <div className={styles.accountTile} key={a.id}><div><strong>{a.name}</strong>
              <p className={styles.health} data-state={a.enabled&&a.status==='connected'?'connected':'disconnected'}>
                {a.enabled && a.status === 'connected'
                  ? t('متصل', 'Connected')
                  : t('غير متصل', 'Disconnected')}
              </p></div><ul className={styles.services}>
                  {a.config?.scopes?.some((scope) => scope.includes('/auth/calendar')) && (
                    <li>Google Calendar</li>
                  )}
                  {a.config?.scopes?.some((scope) => scope.includes('/auth/contacts')) && (
                    <li>{t('جهات اتصال Google', 'Google Contacts')}</li>
                  )}
                  {!a.config?.scopes?.length && (
                    <li>{t('لا توجد صلاحيات مسجلة.', 'No scopes recorded.')}</li>
                  )}
                {a.config?.scopes?.some(scope=>scope.includes('/spreadsheets'))&&<li>Google Sheets</li>}</ul>
              {a.status !== 'disconnected' && (
                <button
                  type="button"
                  className="btn"
                  disabled={disconnecting !== null}
                  onClick={() => void disconnect(a)}
                >
                  {disconnecting === a.id
                    ? t('جارٍ الفصل…', 'Disconnecting…')
                    : t('فصل الحساب', 'Disconnect account')}
                </button>
              )}
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
