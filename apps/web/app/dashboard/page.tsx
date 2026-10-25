'use client';
import {statusLabel} from '../../components/product/status';
import Link from 'next/link';
import {useData} from '../../components/business/useData';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../../components/product/locale';
import { NavIcon } from '../../components/product/NavIcon';
type Workspace = {
  tenant: { name: string; settings?: { industry?: string }; onboarding_completed_at: string | null };
  plan: { plan_name: string; status: string; trial_ends_at: string | null };
  usage: Record<string, number>;
};
export default function Dashboard() {
  const { t } = useLocale();
  const overview=useData<{channels:{id:string;name:string;type:string;status:string;health:{state:string;reason:string}}[];growth:{day:string;contacts:number;messages:number}[];delivery:{status:string;count:number}[];drafts:{id:string;name:string;status:string}[]}>('/workspace/overview',{channels:[],growth:[],delivery:[],drafts:[]});
  const [w, setW] = useState<Workspace | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      api<Workspace>('/workspace'),
      api<Record<string, number>>('/conversations/counts'),
    ])
      .then(([w, c]) => {
        setW(w);
        setCounts(c);
      })
      .catch((e) => setError(e.message));
  }, []);
  const metrics = [
    [t('محادثات مفتوحة', 'Active conversations'), counts.active, '/dashboard/inbox?tab=active', 'inbox', 'blue'],
    [t('بانتظار التعيين', 'Unassigned'), counts.unassigned, '/dashboard/inbox?tab=unassigned', 'team', 'amber'],
    [t('محادثات عند البوت', 'Handled by bot'), counts.bot, '/dashboard/inbox?tab=bot', 'agents', 'green'],
    [t('جهات الاتصال', 'Contacts'), w?.usage.contacts, '/dashboard/crm', 'crm', 'violet'],
  ];
  const quick = [
    ['/dashboard/channels', 'ربط قناة', 'Connect channel', 'channels', 'واتساب، ماسنجر، الموقع', 'WhatsApp, Messenger, web'],
    ['/dashboard/flows/new', 'إنشاء بوت', 'Create bot', 'flows', 'ابدأ من قالب جاهز', 'Start from a template'],
    ['/dashboard/inbox', 'فتح الوارد', 'Open inbox', 'inbox', 'رد على العملاء', 'Reply to customers'],
    ['/dashboard/campaigns', 'حملة جديدة', 'New broadcast', 'campaigns', 'أرسل لشريحة عملاء', 'Message a segment'],
  ];
  const hasActiveChannel = overview.data.channels.some((channel) => channel.status === 'active');
  const steps = w ? [!!w.tenant.settings?.industry, hasActiveChannel, !!w.usage.flows] : [];
  const done = steps.filter(Boolean).length;
  const growth = overview.data.growth;
  const maxC = Math.max(1, ...growth.map((d) => d.contacts));
  const attention = overview.data.channels.filter((ch) => ch.health.state !== 'connected');
  return (
    <main className="dash">
      <header className="dash-hero">
        <div>
          <p className="eyebrow">{t('مساحة عملك', 'Your workspace')}</p>
          <h1>{t('لوحة التحكم —', 'Dashboard —')} {w?.tenant.name || ''}</h1>
          <p>{t('المحادثات والفريق والبوت في مساحة عمل واحدة.', 'Your conversations, team and bot in one workspace.')}</p>
        </div>
        <Link className="btn btn-primary" href="/dashboard/inbox">{t('فتح صندوق الوارد', 'Open inbox')} ↗</Link>
      </header>
      {error && <p className="notice error" role="alert">{error}</p>}
      {overview.error && <p className="notice error" role="alert">{overview.error}</p>}
      {w && !w.tenant.onboarding_completed_at && !overview.loading && !overview.error && (
        <section className="dash-card dash-setup">
          <div className="dash-setup-main">
            <h2>{t('تقدم الإعداد', 'Setup progress')}</h2>
            <p>{t(`اكتملت ${done} من 3 خطوات أساسية`, `${done} of 3 essential steps completed`)} — {t('جهّز شركتك، أضف قناة، واختر قالبًا لبوتك.', 'Set up your company, connect a channel and choose a bot template.')}</p>
            <div className="dash-progress" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done}><span style={{ width: `${(done / 3) * 100}%` }} /></div>
          </div>
          <Link href="/dashboard/onboarding" className="btn btn-primary">
            {!w.tenant.settings?.industry ? t('التالي: تعريف الشركة','Next: company details') : !hasActiveChannel ? t('التالي: تفعيل قناة','Next: activate a channel') : !w.usage.flows ? t('التالي: إنشاء مسودة بوت','Next: create a bot draft') : t('التالي: تجربة المسودة ومراجعة النشر','Next: test draft and review publication')}
          </Link>
        </section>
      )}
      <section className="dash-stats" aria-label={t('المؤشرات', 'Key metrics')}>
        {metrics.map(([label, value, href, icon, tone]) => (
          <Link className={`dash-stat tone-${tone}`} key={String(label)} href={String(href)}>
            <span className="dash-stat-icon"><NavIcon name={String(icon)} /></span>
            <span className="dash-stat-body">
              <small>{label}</small>
              <strong>{value ?? '—'}</strong>
            </span>
          </Link>
        ))}
      </section>
      <section aria-label={t('مهامك الأساسية', 'Your main tasks')}>
        <h2 className="dash-h">{t('وصول سريع', 'Quick actions')}</h2>
        <div className="dash-quick">
          {quick.map(([href, ar, en, icon, dAr, dEn]) => (
            <Link className="dash-quick-item" key={href} href={href}>
              <span className="dash-quick-icon"><NavIcon name={icon} /></span>
              <span><strong>{t(ar, en)}</strong><small>{t(dAr, dEn)}</small></span>
            </Link>
          ))}
        </div>
      </section>
      <div className="dash-cols">
        <section className="dash-card dash-growth">
          <h2>{t('نمو العملاء والرسائل خلال 14 يومًا (UTC)', 'Contacts and messages over 14 days (UTC)')}</h2>
          {growth.length > 0 ? (
            <div className="dash-bars">
              {growth.map((day) => (
                <div key={day.day} title={`${day.day}: ${day.contacts} / ${day.messages}`}>
                  <strong>{day.contacts}</strong>
                  <i style={{ height: Math.max(4, (day.contacts / maxC) * 100) }} />
                  <small>{day.day.slice(5)}</small>
                  <small>{day.messages} {t('رسالة', 'msg')}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{overview.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد بيانات بعد.', 'No data yet.')}</p>
          )}
          <p className="muted dash-note">{t('المصدر: جهات الاتصال والرسائل المحفوظة. الأرقام لا تثبت التسليم.', 'Source: persisted contacts and messages. Counts do not establish delivery.')}</p>
        </section>
        <div className="dash-side">
          <section className="dash-card">
            <h2>{t('اتصالات تحتاج إجراءً', 'Connections requiring attention')}</h2>
            {attention.map((ch) => (
              <Link key={ch.id} className="dash-row" href="/dashboard/channels"><strong>{ch.name} · {ch.type}</strong><small>{ch.health.state} · {ch.health.reason}</small></Link>
            ))}
            {!overview.loading && !overview.error && !overview.data.channels.length && (
              <Link className="dash-row" href="/dashboard/channels">{t('ابدأ بقناة موقع لتجربة البوت دون حساب خارجي', 'Start with website chat to test without an external account')}</Link>
            )}
            {!overview.loading && overview.data.channels.length > 0 && !attention.length && <p className="muted">{t('كل القنوات متصلة.', 'All channels are connected.')}</p>}
          </section>
          <section className="dash-card">
            <h2>{t('حالات الرسائل — آخر 30 يومًا', 'Message statuses — last 30 days')}</h2>
            <div className="dash-chips">
              {overview.data.delivery.map((row) => <Link href="/dashboard/delivery" className="badge" key={row.status}>{statusLabel(row.status, t)}: {row.count}</Link>)}
              {!overview.loading && !overview.data.delivery.length && <p className="muted">{t('لا توجد رسائل بعد.', 'No messages yet.')}</p>}
            </div>
          </section>
        </div>
      </div>
      <div className="dash-cols dash-cols-3">
        <section className="dash-card">
          <h2>{t('تابع العمل على بوتاتك', 'Continue working on your bots')}</h2>
          {overview.data.drafts.map((f) => <Link className="dash-row" key={f.id} href={`/dashboard/flows/${f.id}/workspace`}><strong>{f.name}</strong><small>{statusLabel(f.status, t)}</small></Link>)}
          {!overview.loading && !overview.data.drafts.length && <p className="muted">{t('لا توجد مسودات.', 'No drafts.')}</p>}
        </section>
        <section className="dash-card">
          <h2>{t('أتمتة تُناسب عملك', 'Automation for your business')}</h2>
          <p className="muted">{t('استخدم قالب خدمة العملاء أو جمع البيانات. المصمم متصل بمحرك المحادثات الفعلي.', 'Start with support or lead capture. The builder connects directly to your conversation engine.')}</p>
          <div className="form-actions">
            <Link className="btn" href="/dashboard/flows">{t('استكشف قوالب البوت', 'Explore bot templates')}</Link>
            <Link className="btn" href="/dashboard/channels">{t('إدارة القنوات', 'Manage channels')}</Link>
          </div>
        </section>
        <section className="dash-card">
          <h2>{t('اشتراكك الحالي', 'Your subscription')}</h2>
          <span className="badge">{w?.plan.plan_name || '—'} · {statusLabel(w?.plan.status, t)}</span>
          {w?.plan.trial_ends_at && <p className="muted">{t('نهاية التجربة:', 'Trial ends:')} {new Date(w.plan.trial_ends_at).toLocaleDateString()}</p>}
          <div className="form-actions"><Link className="btn" href="/dashboard/billing">{t('عرض الباقات والاستهلاك', 'View plans & usage')}</Link></div>
        </section>
      </div>
    </main>
  );
}
