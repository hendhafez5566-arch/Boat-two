'use client';
import Link from 'next/link';
import { CSSProperties, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
export default function Onboarding() {
  const { t } = useLocale();
  const [w, setW] = useState<{
    tenant: {
      name: string;
      settings: { industry?: string };
      onboarding_completed_at: string | null;
    };
    usage: { channels: number; flows: number; agents: number };
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState<{ status: string }[]>([]);
  const hasActiveChannel = channels.some((channel) => channel.status === 'active');
  useEffect(() => {
    Promise.all([
      api<NonNullable<typeof w>>('/workspace'),
      api<{ status: string }[]>('/channels'),
    ])
      .then(([workspace, channelList]) => {
        setW(workspace);
        setChannels(channelList);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function finish() {
    setBusy(true);
    try {
      await api('/workspace/onboarding/complete', { method: 'POST' });
      window.location.assign('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  type Step = { key: string; ar: string; en: string; hint: string; href: string; icon: string; done: boolean; kind: 'core' | 'try' | 'optional' };
  const steps: Step[] = [
    {
      key: 'company', kind: 'core', icon: 'settings',
      ar: 'عرّف شركتك',
      en: 'Set up your company',
      hint: t('الاسم ومجال العمل والمنطقة الزمنية', 'Name, industry and timezone'),
      href: '/dashboard/settings',
      done: !!w?.tenant.settings.industry,
    },
    {
      key: 'channel', kind: 'core', icon: 'channels',
      ar: 'اربط قناة محادثة',
      en: 'Connect a messaging channel',
      hint: t(
        'ابدأ بويدجت الموقع دون مفاتيح خارجية',
        'Start with website chat; no provider keys required',
      ),
      href: '/dashboard/channels',
      done: hasActiveChannel,
    },
    {
      key: 'bot', kind: 'core', icon: 'flows',
      ar: 'أنشئ أول بوت من قالب',
      en: 'Create your first bot from a template',
      hint: t(
        'وجود المسودة لا يعني التجربة أو النشر. افتح المصمم لتجربتها ثم انشرها عندما تصبح جاهزة.',
        'A draft does not confirm testing or publication. Open the builder to test, then publish when ready.',
      ),
      href: '/dashboard/flows',
      done: !!w?.usage.flows,
    },
    {
      key: 'try', kind: 'try', icon: 'play',
      ar: 'جرّب البوت قبل النشر',
      en: 'Test your bot before publishing',
      hint: t(
        'افتح المصمم وجرّب المحادثة ثم انشر عندما تكون جاهزًا. لا يمكن التحقق من التجربة تلقائيًا.',
        'Open the builder, run a test chat, then publish when ready. Testing cannot be verified automatically.',
      ),
      href: '/dashboard/flows',
      done: false,
    },
    {
      key: 'team', kind: 'optional', icon: 'team',
      ar: 'ادعُ فريقك',
      en: 'Invite your team',
      hint: t(
        'اختياري — أضف الموظفين وحدد صلاحياتهم',
        'Optional — add teammates and choose their roles',
      ),
      href: '/dashboard/team',
      done: (w?.usage.agents ?? 0) > 1,
    },
  ];
  const core = steps.filter((s) => s.kind === 'core');
  const doneCount = core.filter((s) => s.done).length;
  const next = core.find((s) => !s.done);
  const pct = Math.round((doneCount / core.length) * 100);
  const nextIndex = next ? steps.indexOf(next) : -1;
  return (
    <main className="ob">
      <header className="ob-hero">
        <div className="ob-hero-text">
          <p className="eyebrow">{t('أهلًا بك على متن Boat Two', 'Welcome aboard')}</p>
          <h1>{t('دليل البداية', 'Getting started')}</h1>
          <p>
            {t(
              'كل خطوة تحفظ تقدمك داخل شركتك. يمكنك العودة في أي وقت.',
              'Your workspace keeps your progress. Return whenever you need.',
            )}
          </p>
          {w?.tenant.name && <span className="badge">{w.tenant.name}</span>}
        </div>
        <div className="ob-progress" role="progressbar" aria-valuemin={0} aria-valuemax={core.length} aria-valuenow={doneCount} aria-label={t('تقدم الإعداد', 'Setup progress')}>
          <span className="ob-ring" style={{ '--p': pct } as CSSProperties}><b>{pct}%</b></span>
          <span className="ob-progress-text">
            <strong>{t(`${doneCount} من ${core.length}`, `${doneCount} of ${core.length}`)}</strong>
            <small>{t('خطوات أساسية مكتملة', 'essential steps done')}</small>
          </span>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {w && next && (
        <section className="ob-next">
          <div>
            <small>{t('خطوتك التالية', 'Your next step')}</small>
            <strong>{t(next.ar, next.en)}</strong>
          </div>
          <Link className="btn btn-primary btn-lg" href={next.href}>{t('ابدأ الآن', 'Start now')} ↗</Link>
        </section>
      )}
      <ol className="ob-steps">
        {steps.map((s, i) => {
          const current = i === nextIndex;
          return (
            <li key={s.key} className={`ob-step ${s.done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${s.kind !== 'core' ? 'is-soft' : ''}`}>
              <span className="ob-step-icon">{s.done ? <NavIcon name="check" /> : <NavIcon name={s.icon} />}</span>
              <div className="ob-step-body">
                <div className="ob-step-title">
                  <strong>{i + 1}. {t(s.ar, s.en)}</strong>
                  {s.kind === 'optional' && <span className="badge">{t('اختياري', 'Optional')}</span>}
                  {s.kind === 'try' && <span className="badge">{t('يدوي', 'Manual')}</span>}
                  {s.kind === 'core' && <span className={`status-pill ${s.done ? 'is-live' : 'is-draft'}`}>{s.done ? t('مكتملة', 'Done') : t('ناقصة', 'To do')}</span>}
                </div>
                <small>{s.hint}</small>
              </div>
              <Link className={`btn ${!s.done && s.kind === 'core' ? 'btn-primary' : ''}`} href={s.href}>
                {s.done ? t('إدارة', 'Manage') : s.kind === 'try' ? t('افتح المصمم', 'Open builder') : t('ابدأ', 'Start')}
              </Link>
            </li>
          );
        })}
      </ol>
      <section className="ob-finish">
        <div className="form-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !hasActiveChannel}
            onClick={finish}
          >
            {t('إنهاء الإعداد والانتقال للوحة', 'Finish setup & open dashboard')}
          </button>
          <Link className="btn" href="/dashboard">
            {t('المتابعة لاحقًا', 'Continue later')}
          </Link>
        </div>
        <p className="muted">
          {t(
            'إكمال الإعداد يتطلب قناة نشطة. نشر السيناريو خطوة مستقلة من المصمم.',
            'An active channel is required to finish setup. Publish your flow separately in the builder.',
          )}
        </p>
      </section>
    </main>
  );
}
