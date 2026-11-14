'use client';
import Link from 'next/link';
import { useLocale } from './locale';
import ChannelLogo from './ChannelLogo';
import styles from './channel-catalog.module.css';

const channels = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    ar: 'ربط رقم الأعمال عبر Meta',
    en: 'Connect your business number through Meta',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    ar: 'رسائل صفحة نشاطك',
    en: 'Messages from your business page',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    ar: 'رسائل حسابك الاحترافي',
    en: 'Messages from your professional account',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    ar: 'اربط بوت Telegram لأتمتة الرسائل وإدارة المحادثات.',
    en: 'Connect your Telegram Bot to automate messages and manage conversations.',
  },
  {
    id: 'web',
    name: 'Webchat',
    ar: 'ابدأ الآن بويدجت موقعك',
    en: 'Start now with your website widget',
  },
  {
    id: 'google',
    name: 'Google',
    ar: 'اربط حساب Google لإدارة التكاملات والخدمات.',
    en: 'Connect your Google account to manage integrations and services.',
  },
];
export default function ChannelCatalog() {
  const { t } = useLocale();
  return (
    <section
      className={styles.catalog}
      aria-label={t('مكتبة القنوات والتكاملات', 'Channel and integration library')}
    >
      {channels.map((c) => (
        <article key={c.id} className={styles.card} data-provider={c.id}>
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
          <div className={styles.hero} aria-hidden="true">
            <span className={styles.heroIcon}>
              <ChannelLogo id={c.id} />
            </span>
          </div>
          <footer>
            <p className={styles.secure}>
              <span aria-hidden="true">✓</span> {t('اتصال آمن', 'Secure connection')}
            </p>
            <Link
              className={`btn ${styles.connectButton}`}
              href={`/dashboard/channels/connect/${c.id}`}
            >
              {t('ربط ', 'Connect ')}
              {c.name}
            </Link>
          </footer>
        </article>
      ))}
    </section>
  );
}
