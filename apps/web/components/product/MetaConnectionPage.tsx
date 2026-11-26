'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import ChannelLogo from './ChannelLogo';
import MetaConnect from './MetaConnect';
import { useLocale } from './locale';
import { useData } from '../business/useData';
import { api } from '../../lib/api';
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
  const [connectOpen, setConnectOpen] = useState(kind === 'whatsapp');
  const groups = [...new Set(rows.map((c) => c.businessAccountId || c.id))];
  const visible = rows.filter(
    (c) =>
      (filter === 'all' || (filter === 'active' ? c.status === 'active' : c.status !== 'active')) &&
      `${c.name} ${c.businessAccountId || ''} ${c.external_id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const visibleGroups =
    kind === 'whatsapp'
      ? groups
          .map((id) =>
            visible.filter((account) => (account.businessAccountId || account.id) === id),
          )
          .filter((group) => group.length)
      : [visible];
  const [checking, setChecking] = useState<string | null>(null);
  const [checkError, setCheckError] = useState('');
  async function verifyPhone(id: string) {
    setChecking(id);
    setCheckError('');
    try {
      await api(`/channels/${id}/verify`, { method: 'POST' });
      await accounts.reload();
    } catch (cause) {
      setCheckError((cause as Error).message);
    } finally {
      setChecking(null);
    }
  }
  const title =
    kind === 'whatsapp'
      ? t('تكامل WhatsApp', 'WhatsApp Integration')
      : kind === 'facebook'
        ? t('تكامل Facebook', 'Facebook Integration')
        : t('تكامل Instagram', 'Instagram Integration');
  const connectionMethods = (
      <section id="meta-connect-methods" hidden={kind === 'whatsapp' && !!rows.length && !connectOpen}>
        <MetaConnect selectedKind={kind} onSaved={() => {
          setSaved(true);
          void accounts.reload();
        }} />
      </section>
  );
  return (
    <main className={`stack ${styles.page}`}>
      <nav aria-label={t('مسار الصفحة', 'Breadcrumb')}>
        <Link href="/dashboard/channels">{t('ربط الحساب', 'Connect Account')}</Link> / {name}
      </nav>
      <header className={styles.heading}>
        <ChannelLogo id={kind} />
        <h1>{title}</h1>
        {kind === 'whatsapp' && !!rows.length && (
          <button type="button" className="btn btn-primary" aria-expanded={connectOpen}
            aria-controls="meta-connect-methods" onClick={() => setConnectOpen(!connectOpen)}>
            {connectOpen ? t('إخفاء خيارات الربط', 'Hide connection options') : t('ربط حساب جديد', 'Connect account')}
          </button>
        )}
      </header>
      {kind === 'whatsapp' && connectionMethods}
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
        </>
      )}
      {saved && (
        <p role="status" className="notice">
          {t('تم حفظ الحساب. راجع حالته أدناه.', 'Account saved. Review its status below.')}
        </p>
      )}
      {accounts.error && (
        <p role="alert" className="notice error">
          {accounts.error}
        </p>
      )}
      {(kind === 'whatsapp' || rows.length > 0) && (
        <section className={styles.accounts}>
          <h2>{t('الحسابات المتصلة', 'Connected accounts')}</h2>
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
          {checkError && (
            <p role="alert" className="notice error">
              {checkError}
            </p>
          )}
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
                  {visibleGroups.map((group) => (
                    <Fragment key={group[0].id}>
                      {kind === 'whatsapp' && (
                        <tr>
                          <th colSpan={4}>
                            <strong>{t('حساب أعمال WhatsApp', 'WhatsApp Business Account')}</strong>
                            {' · '}
                            <bdi>
                              {group[0].businessAccountId ||
                                t('المعرّف غير متاح', 'ID unavailable')}
                            </bdi>
                            <small>
                              {t('أرقام الهاتف', 'Phone numbers')} ({group.length})
                            </small>
                          </th>
                        </tr>
                      )}
                      {group.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                            <small>
                              {' '}
                              {kind === 'whatsapp' ? 'Phone Number ID: ' : ''}
                              {c.external_id}
                            </small>
                          </td>
                          <td><span className={styles.health} data-state={channelConnectionState(c)}>
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
                            }</span>
                          </td>
                          <td>
                            {c.connectionHealth?.checkedAt
                              ? new Date(c.connectionHealth.checkedAt).toLocaleString(
                                  language === 'ar' ? 'ar-EG' : 'en-GB',
                                )
                              : '—'}
                          </td>
                          <td><div className={styles.actions}>
                            {kind === 'whatsapp' && c.status === 'active' && (
                              <button
                                className="btn"
                                type="button"
                                disabled={checking !== null}
                                onClick={() => void verifyPhone(c.id)}
                              >
                                {checking === c.id
                                  ? t('جارٍ التحقق…', 'Checking…')
                                  : t('تحقق من الاتصال', 'Check connection')}
                              </button>
                            )}
                            <Link className="btn" href={`/dashboard/flows?channelId=${c.id}`}>
                              {t('إدارة', 'Manage')}
                            </Link>
                            <Link className="btn" href={`/dashboard/channels?manage=${encodeURIComponent(c.id)}`}>
                              {t('إعدادات الاتصال', 'Connection settings')}
                            </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {kind !== 'whatsapp' && connectionMethods}
    </main>
  );
}
