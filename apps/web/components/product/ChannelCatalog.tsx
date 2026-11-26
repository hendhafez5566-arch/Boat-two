'use client';
import Link from 'next/link';
import { useLocale } from './locale';
import { NavIcon } from './NavIcon';
import ChannelLogo from './ChannelLogo';
import styles from './channel-catalog.module.css';

const channels = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    ar: 'استخدم رقمك الحالي أو Cloud API من خلال Meta.',
    en: 'Keep your current number or connect Cloud API through Meta.',
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
        <Link href={`/dashboard/channels/connect/${c.id}`} key={c.id} className={styles.platform} data-provider={c.id}>
          <span className={styles.platformLogo}><ChannelLogo id={c.id} /></span>
          <span className={styles.platformText}>
            <strong><bdi>{c.name}</bdi></strong>
            <small>{t(c.ar, c.en)}</small>
          </span>
          <span className={styles.platformAction}>
            {c.id === 'google' ? t('إعداد التكامل', 'Set up integration') : t('خيارات الربط', 'Connection options')}
            <span className={styles.platformArrow}><NavIcon name="chevron" /></span>
          </span>
        </Link>
      ))}
    </section>
  );
}
