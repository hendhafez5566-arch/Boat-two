'use client';
import { useLocale } from './locale';
import ChannelLogo from './ChannelLogo';
import styles from './channel-catalog.module.css';

const channels = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    mark: '◉',
    color: '#128c4a',
    ar: 'ربط رقم الأعمال عبر Meta',
    en: 'Connect your business number through Meta',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    mark: 'f',
    color: '#0866ff',
    ar: 'رسائل صفحة نشاطك',
    en: 'Messages from your business page',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    mark: '◎',
    color: '#c13584',
    ar: 'رسائل حسابك الاحترافي',
    en: 'Messages from your professional account',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    mark: '➤',
    color: '#0088cc',
    ar: 'اربط بوت Telegram لأتمتة الرسائل وإدارة المحادثات.',
    en: 'Connect your Telegram Bot to automate messages and manage conversations.',
  },
  {
    id: 'web',
    name: 'Webchat',
    mark: '▣',
    color: '#2563eb',
    ar: 'ابدأ الآن بويدجت موقعك',
    en: 'Start now with your website widget',
  },
  {
    id: 'google',
    name: 'Google',
    mark: 'G',
    color: '#188038',
    ar: 'اربط حساب Google لإدارة التكاملات والخدمات.',
    en: 'Connect your Google account to manage integrations and services.',
  },
];
export default function ChannelCatalog({
  selected,
  onSelect,
  mode = 'default',
}: {
  mode?: 'default' | 'connections';
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
  if (mode === 'connections')
    return (
      <section
        className={styles.catalog}
        aria-label={t('مكتبة القنوات والتكاملات', 'Channel and integration library')}
      >
        {channels.map((c) => (
          <article key={c.id} className={styles.card}>
            <header>
              <span aria-hidden="true">
                <ChannelLogo id={c.id} />
              </span>
              <div>
                <h3 dir="ltr">
                  {c.name}{' '}
                  {c.id === 'whatsapp' && (
                    <small className={styles.recommended}>{t('موصى به', 'Recommended')}</small>
                  )}
                </h3>
                <p>{t(c.ar, c.en)}</p>
              </div>
            </header>
            <footer>
              <p className={styles.secure}>{t('اتصال آمن', 'Secure connection')}</p>
              {c.id === 'google' ? (
                <a className="btn" href="/dashboard/channels/connect/google">
                  {t('ربط Google', 'Connect Google')}
                </a>
              ) : (
                <button type="button" className="btn" onClick={() => onSelect(c.id)}>
                  {t('ربط ', 'Connect ')}
                  {c.name}
                </button>
              )}
            </footer>
          </article>
        ))}
      </section>
    );
  return (
    <section
      aria-label={t('مكتبة القنوات والتكاملات', 'Channel and integration library')}
      className="channel-catalog"
    >
      {channels.map((c) => (
        <article key={c.id} className="card stack" style={{ borderTop: `4px solid ${c.color}` }}>
          <span aria-hidden="true" style={{ color: c.color }}>
            <ChannelLogo id={c.id} />
          </span>
          <h2 dir="ltr">{c.name}</h2>
          <p>{t(c.ar, c.en)}</p>
          {c.id === 'google' ? (
            <a className="btn" href="/dashboard/integrations">
              {t('إدارة تفويض Google', 'Manage Google authorization')}
            </a>
          ) : (
            <button
              type="button"
              className="btn"
              aria-pressed={selected === c.id}
              onClick={() => onSelect(c.id)}
            >
              {t('إعداد الاتصال', 'Set up connection')}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
