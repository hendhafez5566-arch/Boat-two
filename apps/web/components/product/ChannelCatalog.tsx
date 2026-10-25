'use client';
import { useLocale } from './locale';

const channels = [
  { id: 'whatsapp', name: 'WhatsApp', mark: '◉', color: '#128c4a', ar: 'ربط رقم الأعمال عبر Meta', en: 'Connect your business number through Meta' },
  { id: 'facebook', name: 'Facebook Messenger', mark: 'f', color: '#0866ff', ar: 'رسائل صفحة نشاطك', en: 'Messages from your business page' },
  { id: 'instagram', name: 'Instagram', mark: '◎', color: '#c13584', ar: 'رسائل حسابك الاحترافي', en: 'Messages from your professional account' },
  { id: 'telegram', name: 'Telegram', mark: '➤', color: '#0088cc', ar: 'غير متاح — موصل Telegram غير مثبت', en: 'Unavailable — Telegram adapter is not installed' },
  { id: 'web', name: 'Webchat', mark: '▣', color: '#2563eb', ar: 'ابدأ الآن بويدجت موقعك', en: 'Start now with your website widget' },
  { id: 'google', name: 'Google Sheets', mark: 'G', color: '#188038', ar: 'تكامل بيانات: قراءة شيت عام داخل المصمم. OAuth والكتابة غير متاحين.', en: 'Data integration: read a public sheet in the builder. OAuth and writes unavailable.' },
];
export default function ChannelCatalog({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const { t } = useLocale();
  return <section aria-label={t('مكتبة القنوات والتكاملات', 'Channel and integration library')} className="channel-catalog">
    {channels.map(c => <article key={c.id} className="card stack" style={{ borderTop: `4px solid ${c.color}` }}>
      <span aria-hidden="true" style={{ color: c.color, fontSize: 32, fontWeight: 800 }}>{c.mark}</span>
      <h2 dir="ltr">{c.name}</h2><p>{t(c.ar, c.en)}</p>
      {c.id === 'google' ? <span className="notice">{t('تكامل مستقل · قراءة عامة فقط', 'Separate integration · public reads only')}</span> : <button type="button" className="btn" disabled={c.id === 'telegram'} aria-pressed={selected === c.id} onClick={() => onSelect(c.id)}>{c.id === 'telegram' ? t('غير متاح حاليًا', 'Currently unavailable') : t('إعداد الاتصال', 'Set up connection')}</button>}
    </article>)}
  </section>;
}
