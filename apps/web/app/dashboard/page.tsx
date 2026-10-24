'use client';
import {statusLabel} from '../../components/product/status';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../../components/product/locale';
type Workspace = {
  tenant: { name: string; settings?: { industry?: string }; onboarding_completed_at: string | null };
  plan: { plan_name: string; status: string; trial_ends_at: string | null };
  usage: Record<string, number>;
};
export default function Dashboard() {
  const { t } = useLocale();
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
    [t('محادثات مفتوحة', 'Active conversations'), counts.active, '/dashboard/inbox?tab=active'],
    [t('بانتظار التعيين', 'Unassigned'), counts.unassigned, '/dashboard/inbox?tab=unassigned'],
    [t('محادثات عند البوت', 'Handled by bot'), counts.bot, '/dashboard/inbox?tab=bot'],
    [t('جهات الاتصال', 'Contacts'), w?.usage.contacts, '/dashboard/crm'],
  ];
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE, CONNECTED</p>
          <h1>
            {t('لوحة التحكم —', 'Dashboard —')} {w?.tenant.name || 'ELHAFEZ BOAT'}
          </h1>
          <p>
            {t(
              'المحادثات والفريق والبوت في مساحة عمل واحدة.',
              'Your conversations, team and bot in one workspace.',
            )}
          </p>
        </div>
        <Link className="btn btn-primary" href="/dashboard/inbox">
          {t('فتح صندوق الوارد', 'Open inbox')} ↗
        </Link>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {w && !w.tenant.onboarding_completed_at && (
        <section className="card">
          <div className="page-heading mb-0">
            <div>
              <h2>{t('تقدم الإعداد', 'Setup progress')}</h2><p>{t(`اكتملت ${[!!w.tenant.settings?.industry, !!w.usage.channels, !!w.usage.flows].filter(Boolean).length} من 3 خطوات أساسية`, `${[!!w.tenant.settings?.industry, !!w.usage.channels, !!w.usage.flows].filter(Boolean).length} of 3 essential steps completed`)}</p>
              <p>
                {t(
                  'جهّز شركتك، أضف قناة، واختر قالبًا لبوتك.',
                  'Set up your company, connect a channel and choose a bot template.',
                )}
              </p>
            </div>
            <Link href="/dashboard/onboarding" className="btn">
              {!w.tenant.settings?.industry ? t('التالي: تعريف الشركة','Next: company details') : !w.usage.channels ? t('التالي: إضافة قناة','Next: add a channel') : !w.usage.flows ? t('التالي: إنشاء مسودة بوت','Next: create a bot draft') : t('التالي: تجربة المسودة ومراجعة النشر','Next: test draft and review publication')}
            </Link>
          </div>
        </section>
      )}
      <div className="card-grid">
        {metrics.map(([label, value, href]) => (
          <section className="card" key={String(label)}>
            <p className="muted">{label}</p>
            <Link className="metric" href={String(href)}>{value ?? '—'}</Link>
            <small className="muted">{t('من بيانات مساحة عملك', 'From your workspace data')}</small>
          </section>
        ))}
      </div>
      <div className="card-grid">
        <section className="card">
          <h2>{t('أتمتة تُناسب عملك', 'Automation for your business')}</h2>
          <p className="muted">
            {t(
              'استخدم قالب خدمة العملاء أو جمع البيانات. المصمم متصل بمحرك المحادثات الفعلي.',
              'Start with support or lead capture. The builder connects directly to your conversation engine.',
            )}
          </p>
          <div className="form-actions">
            <Link className="btn" href="/dashboard/flows">
              {t('استكشف قوالب البوت', 'Explore bot templates')}
            </Link>
            <Link className="btn" href="/dashboard/channels">
              {t('إدارة القنوات', 'Manage channels')}
            </Link>
          </div>
        </section>
        <section className="card">
          <h2>{t('اشتراكك الحالي', 'Your subscription')}</h2>
          <span className="badge">
            {w?.plan.plan_name || '—'} · {statusLabel(w?.plan.status,t)}
          </span>
          {w?.plan.trial_ends_at && (
            <p className="muted mt-3">
              {t('نهاية التجربة:', 'Trial ends:')}{' '}
              {new Date(w.plan.trial_ends_at).toLocaleDateString()}
            </p>
          )}
          <div className="form-actions">
            <Link className="btn" href="/dashboard/billing">
              {t('عرض الباقات والاستهلاك', 'View plans & usage')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
