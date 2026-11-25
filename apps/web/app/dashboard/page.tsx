'use client';
import { SubscriptionSummary } from '../../components/business/SubscriptionSummary';
import { OrdersAttention } from '../../components/business/OrdersAttention';
import Link from 'next/link';
import { useState } from 'react';
import { useData } from '../../components/business/useData';
import { useLocale } from '../../components/product/locale';
import { NavIcon } from '../../components/product/NavIcon';
import styles from './dashboard.module.css';
type Summary = {
  channel: string;
  userName: string;
  timezone: string;
  growth: { day: string; gain: number; drop: number }[];
  ai: { enabled: boolean; sources: number; last_training: string | null };
};
const quick = [
  [
    '/dashboard/campaigns',
    'بث جديد',
    'New Broadcast',
    'campaigns',
    'أرسل إلى جمهورك',
    'Send to your audience',
    'purple',
  ],
  [
    '/dashboard/inbox',
    'فتح الوارد',
    'Open Inbox',
    'inbox',
    'عرض كل المحادثات',
    'View all conversations',
    'blue',
  ],
  [
    '/dashboard/flows',
    'مدير البوت',
    'Bot manager',
    'flows',
    'أنشئ سيناريو أو جرّب بوتًا موجودًا',
    'Create a flow or preview an existing bot',
    'green',
  ],
  [
    '/dashboard/knowledge',
    'قاعدة المعرفة',
    'Knowledge base',
    'agents',
    'أضف وراجع مصادر إجابات المساعد',
    'Add and review sources for assistant answers',
    'purple',
  ],
  [
    '/dashboard/channels',
    'ربط قناة',
    'Connect Channel',
    'channels',
    'أضف قناة جديدة',
    'Add new channel',
    'amber',
  ],
];
export default function Dashboard() {
  const { t } = useLocale();
  const [selected, setSelected] = useState('all');
  const [channel, setChannel] = useState('all');
  const summary = useData<Summary | null>('/workspace/dashboard?channel=' + channel, null);
  // Do not present the previous platform's values while the next filter is loading or failed.
  const data =
    summary.data?.channel === channel && !summary.loading && !summary.error ? summary.data : null;
  const growth = data?.growth || [];
  const gain = growth.reduce((n, d) => n + d.gain, 0);
  const drop = growth.reduce((n, d) => n + d.drop, 0);
  const total = gain + drop;
  const maximum = Math.max(1, ...growth.map((d) => d.gain));
  const points = growth
    .map((d, i) => `${40 + (i * 600) / 29},${190 - (d.gain / maximum) * 170}`)
    .join(' ');
  const filter = () => {
    if (selected === channel) void summary.reload();
    else setChannel(selected);
  };
  return (
    <main className={styles.page}>
      <header className={`${styles.heading} workspace-heading`}>
        <div>
          <h1>{t('الرئيسية', 'Home')}</h1>
        </div>
        <button
          type="button"
          className={styles.refresh}
          disabled={summary.loading}
          aria-label={t('تحديث', 'Refresh')}
          onClick={() => void summary.reload()}
        >
          <NavIcon name="refresh" />
        </button>
      </header>
      <SubscriptionSummary />
      <section className={styles.hero} aria-labelledby="dashboard-welcome">
        <div>
          <h2 id="dashboard-welcome">
            {t('أهلًا بعودتك', 'Welcome back')}
            {summary.data?.userName ? `, ${summary.data.userName}` : ''}
          </h2>
          <p>{t('إليك ما يحدث في مساحة عملك اليوم.', "Here's what's happening with your workspace today.")}</p>
          <Link href="/dashboard/inbox">
            <NavIcon name="inbox" />
            {t('فتح صندوق الوارد', 'Open Inbox')}
          </Link>
        </div>
        <span className={styles.heroMark} aria-hidden="true"><NavIcon name="bolt" /></span>
      </section>
      <OrdersAttention />
      <div className={styles.filter}>
        <select
          aria-label={t('المنصة', 'Platform')}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="all">{t('جميع القنوات', 'All channels')}</option>
          <option value="web">Webchat</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
        <button type="button" disabled={summary.loading} onClick={filter}>
          <NavIcon name="filter" />
          {t('تصفية', 'Filter')}
        </button>
      </div>
      {summary.error && (
        <p className="notice error" role="alert">
          {summary.error}
        </p>
      )}
      <nav className={styles.quick} aria-label={t('اختصارات لوحة المعلومات', 'Dashboard actions')}>
        {quick.map(([href, ar, en, icon, dAr, dEn, tone]) => (
          <Link key={href} href={href}>
            <span className={`${styles.quickIcon} ${styles[tone]}`}>
              <NavIcon name={icon} />
            </span>
            <span>
              <strong>{t(ar, en)}</strong>
              <small>{t(dAr, dEn)}</small>
            </span>
            <span className={styles.arrow}>›</span>
          </Link>
        ))}
      </nav>
      <section className={styles.card} aria-busy={summary.loading}>
        <h2>
          {t('نمو جهات الاتصال', 'Contact growth')} <span>{t('(30 يومًا)', '(30 days)')}</span>
        </h2>
        <div className={styles.growth}>
          <div className={styles.distribution}>
            <small>{t('آخر 30 يومًا — UTC', 'LAST 30 DAYS — UTC')}</small>
            <p>{t('جهات اتصال جديدة مقابل إلغاء التسويق', 'New contacts vs marketing opt-outs')}</p>
            {data ? (
              <>
                <div
                  className={styles.donut}
                  role="img"
                  aria-label={`${t('عملاء جدد', 'New contacts')}: ${gain}, ${t('إلغاء التسويق', 'Opt-outs')}: ${drop}`}
                  style={{
                    background: total
                      ? `conic-gradient(#22c55e 0 ${(gain / total) * 100}%, #ef6c83 ${(gain / total) * 100}% 100%)`
                      : '#edf0f4',
                  }}
                >
                  <span>
                    <strong>{total}</strong>
                    <small>{t('إجمالي النشاط', 'TOTAL ACTIVITY')}</small>
                  </span>
                </div>
                <ul className={styles.legend}>
                  <li>
                    <i />
                    {t('عملاء جدد', 'New contacts')} {gain}
                  </li>
                  <li>
                    <i />
                    {t('إلغاء التسويق', 'Opt-outs')} {drop}
                  </li>
                </ul>
              </>
            ) : (
              <p role="status">{summary.loading ? t('جارٍ التحميل…', 'Loading…') : '—'}</p>
            )}
          </div>
          <div className={styles.trend}>
            <small>{t('الاتجاه اليومي', 'DAILY TREND')}</small>
            <p>{t('جهات الاتصال الجديدة للقنوات المحددة خلال آخر 30 يومًا', 'New contacts for selected channels in the last 30 days')}</p>
            <div className={styles.plot}>
              {data ? (
                <svg
                  viewBox="0 0 660 230"
                  role="img"
                  aria-label={t('جهات الاتصال الجديدة يوميًا', 'Daily new contacts')}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <g key={n}>
                      <line
                        x1="40"
                        y1={20 + n * 42.5}
                        x2="640"
                        y2={20 + n * 42.5}
                        stroke="#edf0f3"
                      />
                      <text x="32" y={24 + n * 42.5} textAnchor="end">
                        {Number((maximum * (1 - n / 4)).toFixed(2))}
                      </text>
                    </g>
                  ))}
                  <polygon points={`40,190 ${points} 640,190`} fill="#22c55e14" />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#28a655"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  {growth.map((d, i) => (
                    <g key={d.day}>
                      <circle
                        cx={40 + (i * 600) / 29}
                        cy={190 - (d.gain / maximum) * 170}
                        r="4"
                        fill="transparent"
                      >
                        <title>
                          {d.day}: {d.gain}
                        </title>
                      </circle>
                      {(i % 5 === 0 || i === 29) && (
                        <text x={40 + (i * 600) / 29} y="215" textAnchor="middle">
                          {d.day.slice(5)}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              ) : (
                <p role="status">{summary.loading ? t('جارٍ التحميل…', 'Loading…') : '—'}</p>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className={`${styles.card} ${styles.ai}`} aria-busy={summary.loading}>
        <header>
          <h2>
            <NavIcon name="agents" />
            {t('حالة مساعد AI', 'AI Assistant Status')}
          </h2>
          <Link href="/dashboard/knowledge">{t('عرض', 'View')}</Link>
        </header>
        <dl>
          <div>
            <dt>{t('مساعد AI', 'AI Assistant')}</dt>
            <dd className={data?.ai.enabled ? styles.active : styles.inactive}>
              {data ? (data.ai.enabled ? t('نشط', 'Active') : t('غير نشط', 'Inactive')) : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('مصادر المعرفة', 'Knowledge Sources')}</dt>
            <dd>{data?.ai.sources ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('آخر تدريب', 'Last Training')}</dt>
            <dd>
              {data
                ? data.ai.last_training
                  ? new Date(data.ai.last_training).toLocaleString()
                  : t('لم يحدث', 'Never')
                : '—'}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
