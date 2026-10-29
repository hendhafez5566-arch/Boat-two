'use client';
import { useLocale } from './locale';
import ChannelLogo from './ChannelLogo';

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
    name: 'Facebook Messenger',
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
    ar: 'موصل Bot API للمحادثات والوسائط والمجموعات الاختيارية — يحتاج إعداد Webhook واختبارًا حيًا',
    en: 'Bot API adapter with media and opt-in groups — requires webhook setup and live validation',
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
    name: 'Google Sheets',
    mark: 'G',
    color: '#188038',
    ar: 'تفويض مستقل للقراءة وكتابة Sheets وCalendar بأقل صلاحية.',
    en: 'Separate authorization for Sheets reads, writes and Calendar with purpose-specific scopes.',
  },
];
export default function ChannelCatalog({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
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
