'use client';
import { useLocale } from './locale';

function ChannelLogo({id}:{id:string}) {
  const shape = id==='facebook' ? <path fill="currentColor" d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.77-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z"/>
    : id==='instagram' ? <g fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/></g>
    : id==='telegram' ? <path fill="currentColor" d="m21.5 3-3.2 17.4c-.2 1-1 1.3-1.8.7l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18 6.7c.4-.4-.1-.6-.6-.3L5.8 13.7.8 12.1c-1.1-.3-1.1-1.1.2-1.6L20.5 3c.9-.3 1.6.2 1 1Z"/>
    : id==='whatsapp' ? <g fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 19 2 22l1.1-6A9.5 9.5 0 1 1 5 19Z"/><path d="M8 6c-2 1-1.5 4 1 7s5.5 4 7 2l-2-2-2 1c-1.5-1-2.5-2-3-3l1-2Z"/></g>
    : id==='google' ? <g strokeWidth="4" fill="none"><path stroke="#4285f4" d="M21 12h-9m9 0c0 3-1.3 5.5-3.5 7"/><path stroke="#34a853" d="M17.5 19A9 9 0 0 1 4 16"/><path stroke="#fbbc05" d="M4 16a9 9 0 0 1 0-8"/><path stroke="#ea4335" d="M4 8a9 9 0 0 1 14-3"/></g>
    : <g stroke="currentColor" strokeWidth="1.8" fill="none"><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/></g>;
  return <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">{shape}</svg>;
}

const channels = [
  { id: 'whatsapp', name: 'WhatsApp', mark: '◉', color: '#128c4a', ar: 'ربط رقم الأعمال عبر Meta', en: 'Connect your business number through Meta' },
  { id: 'facebook', name: 'Facebook Messenger', mark: 'f', color: '#0866ff', ar: 'رسائل صفحة نشاطك', en: 'Messages from your business page' },
  { id: 'instagram', name: 'Instagram', mark: '◎', color: '#c13584', ar: 'رسائل حسابك الاحترافي', en: 'Messages from your professional account' },
  { id: 'telegram', name: 'Telegram', mark: '➤', color: '#0088cc', ar: 'موصل Bot API للمحادثات الخاصة — يحتاج إعداد Webhook واختبارًا حيًا', en: 'Bot API adapter for private chats — requires webhook setup and live validation' },
  { id: 'web', name: 'Webchat', mark: '▣', color: '#2563eb', ar: 'ابدأ الآن بويدجت موقعك', en: 'Start now with your website widget' },
  { id: 'google', name: 'Google Sheets', mark: 'G', color: '#188038', ar: 'تكامل بيانات: قراءة شيت عام داخل المصمم. OAuth والكتابة غير متاحين.', en: 'Data integration: read a public sheet in the builder. OAuth and writes unavailable.' },
];
export default function ChannelCatalog({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const { t } = useLocale();
  return <section aria-label={t('مكتبة القنوات والتكاملات', 'Channel and integration library')} className="channel-catalog">
    {channels.map(c => <article key={c.id} className="card stack" style={{ borderTop: `4px solid ${c.color}` }}>
      <span aria-hidden="true" style={{ color: c.color }}><ChannelLogo id={c.id}/></span>
      <h2 dir="ltr">{c.name}</h2><p>{t(c.ar, c.en)}</p>
      {c.id === 'google' ? <span className="notice">{t('تكامل مستقل · قراءة عامة فقط', 'Separate integration · public reads only')}</span> : <button type="button" className="btn" aria-pressed={selected === c.id} onClick={() => onSelect(c.id)}>{t('إعداد الاتصال', 'Set up connection')}</button>}
    </article>)}
  </section>;
}
