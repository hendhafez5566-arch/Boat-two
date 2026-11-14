'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import MetaConnect from './MetaConnect';
import { useLocale } from './locale';
import { useData } from '../business/useData';
import { channelConnectionState } from '../../lib/channel-overview';
import styles from './meta-connection-page.module.css';
type Account = {
  id: string;
  type: string;
  name: string;
  external_id: string;
  status: string;
  businessAccountId?: string | null;
  connectionHealth?: { state: string; checkedAt: string | null; reason: string };
};
export default function MetaConnectionPage({
  kind,
}: {
  kind: 'whatsapp' | 'facebook' | 'instagram';
}) {
  const { t, language } = useLocale();
  const name = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram' }[kind];
  const accounts = useData<Account[]>(
    kind === 'whatsapp' ? '/channels/meta/whatsapp/accounts' : '/channels',
    [],
  );
  const rows = accounts.data.filter((c) => c.type === kind);
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [saved, setSaved] = useState(false);
  const connectRef = useRef<HTMLDivElement>(null);
  const groups = [...new Set(rows.map((c) => c.businessAccountId || c.id))];
  const visible = rows.filter(
    (c) =>
      (filter === 'all' || (filter === 'active' ? c.status === 'active' : c.status !== 'active')) &&
      `${c.name} ${c.businessAccountId || ''} ${c.external_id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const title =
    kind === 'whatsapp'
      ? t('تكامل WhatsApp', 'WhatsApp Integration')
      : kind === 'facebook'
        ? t('تكامل Facebook', 'Facebook Integration')
        : t('تكامل Instagram', 'Instagram Integration');
  return (
    <main className={`stack ${styles.page}`}>
      <nav aria-label={t('مسار الصفحة', 'Breadcrumb')}>
        <Link href="/dashboard/channels">{t('ربط الحساب', 'Connect Account')}</Link> / {name}
      </nav>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>
            {kind === 'whatsapp'
              ? t(
                  'اربط حسابات WhatsApp Business وأرقام الهاتف وأدرها.',
                  'Connect and manage your WhatsApp Business Accounts and phone numbers.',
                )
              : t(
                  'أدر حسابات المراسلة والأتمتة في مكان واحد.',
                  'Manage messaging accounts and automation in one place.',
                )}
          </p>
        </div>
      </div>
      {kind === 'whatsapp' && (
        <>
          <div
            className={styles.statistics}
            role="group"
            aria-label={t('إحصاءات الحساب', 'Account statistics')}
          >
            {[
              [t('حسابات الأعمال', 'Business Accounts'), groups.length],
              [t('أرقام الهاتف', 'Phone Numbers'), rows.length],
              [
                t('ينتهي قريبًا', 'Expiring Soon'),
                rows.filter((c) => channelConnectionState(c) === 'expiring').length,
              ],
              [t('متوقف', 'Disconnected'), rows.filter((c) => c.status !== 'active').length],
            ].map(([label, count]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{accounts.loading ? '—' : count}</strong>
              </div>
            ))}
          </div>
          {!!rows.length && (
            <section className={`card ${styles.another}`}>
              <div>
                <h2>
                  {t('ربط حساب WhatsApp Business آخر', 'Connect Another WhatsApp Business Account')}
                </h2>
                <p>
                  {t(
                    'اربط حسابات أعمال إضافية لإدارة أرقام وعلامات تجارية متعددة.',
                    'You can connect more WhatsApp Business Accounts to manage multiple numbers and brands.',
                  )}
                </p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() =>
                  connectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                {t('ربط حساب جديد', 'Connect New Account')}
              </button>
            </section>
          )}
        </>
      )}
      {saved && (
        <p role="status" className="notice">
          {t('تم حفظ الحساب. راجع حالته أدناه.', 'Account saved. Review its status below.')}
        </p>
      )}
      <section ref={connectRef} className={kind === 'whatsapp' ? styles.business : ''}>
        {kind === 'whatsapp' && (
          <header>
            <h2>{t('حسابات الأعمال', 'Business Accounts')}</h2>
            <p>
              {t(
                'أدر الأرقام ومعلومات الاتصال.',
                'Manage numbers, sync info, and connection health.',
              )}
            </p>
          </header>
        )}
        <MetaConnect
          selectedKind={kind}
          onSaved={() => {
            setSaved(true);
            void accounts.reload();
          }}
        />
      </section>
      {accounts.error && (
        <p role="alert" className="notice error">
          {accounts.error}
        </p>
      )}
      {(kind === 'whatsapp' || rows.length > 0) && (
        <section className="card stack">
          <div className={styles.filters}>
            <label>
              <span>{t('بحث الحسابات', 'Search accounts')}</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>
              <span>{t('الحالة', 'Status')}</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">{t('كل الحالات', 'All Status')}</option>
                <option value="active">{t('نشط', 'Active')}</option>
                <option value="disabled">{t('متوقف', 'Disconnected')}</option>
              </select>
            </label>
          </div>
          {accounts.loading ? (
            <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>
          ) : !visible.length ? (
            <p>{t('لا توجد حسابات مطابقة.', 'No matching accounts found.')}</p>
          ) : (
            <div className={styles.table}>
              <table>
                <thead>
                  <tr>
                    <th>{t('الحساب', 'Account')}</th>
                    <th>{t('الحالة', 'Status')}</th>
                    <th>{t('آخر فحص', 'Last check')}</th>
                    <th>{t('الإجراءات', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        {c.businessAccountId && (
                          <small>Business Account ID: {c.businessAccountId}</small>
                        )}
                        <small>
                          {' '}
                          {kind === 'whatsapp' ? 'Phone Number ID: ' : ''}
                          {c.external_id}
                        </small>
                      </td>
                      <td>
                        {
                          (
                            {
                              connected: t('متصل', 'Connected'),
                              expiring: t('ينتهي قريبًا', 'Expiring soon'),
                              expired: t('تفويض منتهٍ', 'Authorization expired'),
                              disconnected: t('متوقف', 'Disconnected'),
                              needs_action: t('يحتاج إجراء', 'Needs action'),
                            } as Record<string, string>
                          )[channelConnectionState(c)]
                        }
                      </td>
                      <td>
                        {c.connectionHealth?.checkedAt
                          ? new Date(c.connectionHealth.checkedAt).toLocaleString(
                              language === 'ar' ? 'ar-EG' : 'en-GB',
                            )
                          : '—'}
                      </td>
                      <td>
                        <Link className="btn" href={`/dashboard/flows?channelId=${c.id}`}>
                          {t('إدارة', 'Manage')}
                        </Link>
                        <Link href={`/dashboard/channels?manage=${encodeURIComponent(c.id)}`}>
                          {t('إعدادات الاتصال', 'Connection settings')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
