'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '../../../../../lib/api';
import { useLocale } from '../../../../../components/product/locale';
import ChannelSettings from '../../../../../components/product/ChannelSettings';
import { channelHref } from '../../../../../lib/channel-context';
import styles from './telegram.module.css';
import ChannelLogo from '../../../../../components/product/ChannelLogo';

type Bot = {
  id: string;
  type: string;
  name: string;
  external_id: string;
  status: string;
  settings?: Record<string, unknown>;
  connectionHealth?: { state: string; reason: string; checkedAt: string | null };
};

export default function TelegramConnection() {
  const { t } = useLocale();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [manageError, setManageError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const reload = useCallback(async () => {
    setManageError('');
    try {
      const channels = await api<Bot[]>('/channels');
      setBots(channels.filter((channel) => channel.type === 'telegram'));
    } catch (cause) {
      setManageError((cause as Error).message);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function sync(targets: Bot[]) {
    setSyncing(true);
    setManageError('');
    setNotice('');
    try {
      let failures = 0;
      for (const bot of targets) {
        try {
          const health = await api<NonNullable<Bot['connectionHealth']>>(
            `/channels/${bot.id}/verify`,
            { method: 'POST' },
          );
          setBots(
            (rows) =>
              rows?.map((row) =>
                row.id === bot.id ? { ...row, connectionHealth: health } : row,
              ) ?? null,
          );
          if (health.reason !== 'telegram_webhook_verified') failures++;
        } catch {
          failures++;
        }
      }
      setNotice(
        t(
          `تم التحقق من ${targets.length} بوت. يحتاج ${failures} إلى مراجعة.`,
          `Checked ${targets.length} bots. ${failures} need attention.`,
        ),
      );
    } finally {
      setSyncing(false);
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string; webhookReady: boolean }>(
        '/channels/telegram/connect',
        {
          method: 'POST',
          body: JSON.stringify({ botToken: token.trim() }),
        },
      );
      setToken('');
      setSavedId(result.id);
      setNotice(
        result.webhookReady
          ? t('تم ربط البوت.', 'Bot connected.')
          : t(
              'تم حفظ البوت. أعد تسجيل Webhook من إعداداته.',
              'Bot saved. Retry webhook registration in its settings.',
            ),
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <nav aria-label={t('مسار الصفحة', 'Breadcrumb')}>
        <Link href="/dashboard/channels">{t('ربط الحساب', 'Connect Account')}</Link> / Telegram
      </nav>
      <div className="page-heading">
        <div>
          <h1>{t('ربط بوت Telegram', 'Telegram Bot Connection')}</h1>
          <p>
            {t(
              'اربط بوتات Telegram وأدرها لأتمتة المحادثات والرسائل.',
              'Connect and manage your Telegram bots for automation and messaging.',
            )}
          </p>
        </div>
      </div>
      <div className={styles.layout}>
        <section className="card stack">
          <span aria-hidden="true">
            <ChannelLogo id="telegram" />
          </span>
          <h2>{t('اربط بوت Telegram الخاص بك', 'Connect Your Telegram Bot')}</h2>
          <p>
            {t('اربط بوتك بخطوات بسيطة.', 'Connect your Telegram bot in just a few simple steps.')}
          </p>
          <ol>
            <li>
              {t(
                'أنشئ بوتًا على Telegram باستخدام @BotFather.',
                'Create a bot on Telegram using @BotFather.',
              )}
            </li>
            <li>
              {t('انسخ رمز البوت من BotFather.', 'Copy the bot token provided by BotFather.')}
            </li>
            <li>{t('أدخل الرمز ثم اضغط ربط البوت.', 'Enter the token and connect your bot.')}</li>
          </ol>
          {savedId ? (
            <div role="status" className="notice">
              <button className="btn" type="button" onClick={() => setSavedId('')}>
                {t('ربط بوت آخر', 'Connect another bot')}
              </button>
            </div>
          ) : (
            <form className="stack" onSubmit={connect}>
              <label className="field">
                {t('رمز البوت', 'Bot Token')}
                <input
                  type="password"
                  name="botToken"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  autoComplete="off"
                  dir="ltr"
                  pattern="[0-9]{5,20}:[A-Za-z0-9_\-]{20,100}"
                  disabled={busy}
                />
              </label>
              <p className="muted">
                {t(
                  'الصق الرمز الذي حصلت عليه من @BotFather.',
                  'Paste the bot token you received from @BotFather.',
                )}
              </p>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? t('جارٍ الربط…', 'Connecting…') : t('ربط البوت', 'Connect Bot')}
              </button>
            </form>
          )}
          <Link href="/dashboard/channels">
            {t('العودة إلى ربط الحساب', 'Back to Connect Account')}
          </Link>
        </section>
        <section className="card stack" aria-labelledby="telegram-connected">
          <header>
            <h2 id="telegram-connected">{t('البوتات المتصلة', 'Connected Bots')}</h2>
            <p>
              {t(
                'إدارة بوتات Telegram والتحقق من الاتصال.',
                'Manage and verify your Telegram bots.',
              )}
            </p>
          </header>
          <div className="form-actions">
            <input
              type="search"
              aria-label={t('بحث عن بوت', 'Search bots')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className="btn"
              disabled={syncing || !bots?.some((bot) => bot.status === 'active')}
              onClick={() => void sync(bots?.filter((bot) => bot.status === 'active') ?? [])}
            >
              {syncing ? t('جارٍ التحقق…', 'Checking…') : t('مزامنة كل البوتات', 'Sync all bots')}
            </button>
          </div>
          {notice && <p role="status">{notice}</p>}
          {manageError && (
            <div role="alert">
              {manageError}{' '}
              <button className="btn" onClick={() => void reload()}>
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          )}
          {!bots && !manageError && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
          {bots?.length === 0 && <p>{t('لا توجد بوتات Telegram.', 'No Telegram bots found.')}</p>}
          {bots?.length ? (
            <div className={styles.table}>
              <table>
                <thead>
                  <tr>
                    <th>{t('البوت', 'Bot')}</th>
                    <th>{t('الاتصال وWebhook', 'Connection & webhook')}</th>
                    <th>{t('الإجراءات', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bots
                    .filter((bot) =>
                      `${bot.name} ${bot.external_id}`
                        .toLowerCase()
                        .includes(search.trim().toLowerCase()),
                    )
                    .map((bot) => (
                      <tr key={bot.id}>
                        <td>
                          <strong>{bot.name}</strong>
                          <br />
                          <bdi>{bot.external_id}</bdi>
                        </td>
                        <td>
                          {bot.status !== 'active'
                            ? t('متوقف', 'Disabled')
                            : bot.connectionHealth?.reason === 'telegram_webhook_verified'
                              ? t('متصل حسب آخر تحقق', 'Connected at last check')
                              : t('يتطلب التحقق', 'Verification required')}
                          <br />
                          {bot.connectionHealth?.reason === 'telegram_webhook_not_configured'
                            ? t(
                                'Webhook غير مهيأ لهذا الحساب',
                                'Webhook does not point to this account',
                              )
                            : bot.connectionHealth?.reason === 'telegram_webhook_verified'
                              ? t('عنوان Webhook مؤكد', 'Webhook URL verified')
                              : t('زامن البوت للتحقق من Webhook', 'Sync bot to check webhook')}
                        </td>
                        <td>
                          <div className="form-actions">
                            <button
                              className="btn"
                              disabled={syncing || bot.status !== 'active'}
                              onClick={() => void sync([bot])}
                            >
                              {t('مزامنة', 'Sync')}
                            </button>
                            <Link className="btn" href={channelHref('/dashboard/flows', bot.id)}>
                              {t('مدير البوت', 'Bot Manager')}
                            </Link>
                          </div>
                          <ChannelSettings channel={bot} onSaved={() => void reload()} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
