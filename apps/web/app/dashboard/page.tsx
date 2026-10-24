'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../../components/product/locale';
type Workspace = {
  tenant: { name: string; onboarding_completed_at: string | null };
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
    [t('محادثات مفتوحة', 'Active conversations'), counts.active],
    [t('بانتظار التعيين', 'Unassigned'), counts.unassigned],
    [t('محادثات عند البوت', 'Handled by bot'), counts.bot],
    [t('جهات الاتصال', 'Contacts'), w?.usage.contacts],
  ];
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE, CONNECTED</p>
          <h1>
            {t('مرحبًا بك في', 'Welcome to')} {w?.tenant.name || 'ELHAFEZ BOAT'}
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
      {!w?.tenant.onboarding_completed_at && (
        <section className="card">
          <div className="page-heading mb-0">
            <div>
              <h2>{t('لنجهّز أول تجربة لعملائك', 'Build your first customer experience')}</h2>
              <p>
                {t(
                  'جهّز شركتك، أضف قناة، واختر قالبًا لبوتك.',
                  'Set up your company, connect a channel and choose a bot template.',
                )}
              </p>
            </div>
            <Link href="/dashboard/onboarding" className="btn">
              {t('متابعة الإعداد', 'Continue setup')}
            </Link>
          </div>
        </section>
      )}
      <div className="card-grid">
        {metrics.map(([label, value]) => (
          <section className="card" key={String(label)}>
            <p className="muted">{label}</p>
            <div className="metric">{value ?? '—'}</div>
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
            {w?.plan.plan_name || '—'} · {w?.plan.status || '—'}
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
