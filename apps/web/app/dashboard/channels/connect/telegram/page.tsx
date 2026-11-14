'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '../../../../../lib/api';
import { useLocale } from '../../../../../components/product/locale';
import ChannelLogo from '../../../../../components/product/ChannelLogo';

export default function TelegramConnection() {
  const { t } = useLocale();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
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
      if (result.webhookReady) window.location.assign('/dashboard/channels?connected=telegram');
      else setSavedId(result.id);
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
          <li>{t('انسخ رمز البوت من BotFather.', 'Copy the bot token provided by BotFather.')}</li>
          <li>{t('أدخل الرمز ثم اضغط ربط البوت.', 'Enter the token and connect your bot.')}</li>
        </ol>
        {savedId ? (
          <div role="status" className="notice">
            <p>
              {t(
                'تم حفظ البوت، لكن لم يكتمل إعداد الاتصال. راجع إعدادات القناة لإعادة تهيئة Webhook.',
                'The bot was saved, but connection setup did not complete. Review channel settings to retry webhook setup.',
              )}
            </p>
            <Link href="/dashboard/channels">
              {t('إدارة الحسابات المتصلة', 'Manage Connected Accounts')}
            </Link>
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
                pattern="[0-9]{5,20}:[A-Za-z0-9_-]{20,100}"
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
    </main>
  );
}
