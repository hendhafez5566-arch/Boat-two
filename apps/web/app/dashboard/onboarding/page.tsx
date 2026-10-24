'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
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
  useEffect(() => {
    api<NonNullable<typeof w>>('/workspace')
      .then(setW)
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
  const steps = [
    {
      ar: 'عرّف شركتك',
      en: 'Set up your company',
      hint: t('الاسم ومجال العمل والمنطقة الزمنية', 'Name, industry and timezone'),
      href: '/dashboard/settings',
      done: !!w?.tenant.settings.industry,
    },
    {
      ar: 'أضف قناة محادثة',
      en: 'Connect a messaging channel',
      hint: t(
        'ابدأ بويدجت الموقع دون مفاتيح خارجية',
        'Start with website chat; no provider keys required',
      ),
      href: '/dashboard/channels',
      done: !!w?.usage.channels,
    },
    {
      ar: 'أنشئ مسودة بوت من قالب',
      en: 'Create a bot draft from a template',
      hint: t(
        'وجود المسودة لا يعني التجربة أو النشر. افتح المصمم لتجربتها ثم انشرها عندما تصبح جاهزة.',
        'A draft does not confirm testing or publication. Open the builder to test, then publish when ready.',
      ),
      href: '/dashboard/flows',
      done: !!w?.usage.flows,
    },
    {
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
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WELCOME ABOARD</p>
          <h1>{t('دليل البداية', 'Getting started')}</h1>
          <p>
            {t(
              'كل خطوة تحفظ تقدمك داخل شركتك. يمكنك العودة في أي وقت.',
              'Your workspace keeps your progress. Return whenever you need.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className="card">
        <div className="flex justify-between">
          <strong>{w?.tenant.name || '…'}</strong>
          <span className="badge">{t(`اكتملت ${steps.slice(0, 3).filter(s => s.done).length} من 3 خطوات أساسية`, `${steps.slice(0, 3).filter(s => s.done).length} of 3 essential steps completed`)}</span>
        </div>
        <div className="progress-track">
          <div style={{ width: (steps.slice(0, 3).filter((s) => s.done).length / 3) * 100 + '%' }} />
        </div>
        {steps.map((s, i) => (
          <div className="step" key={s.href}>
            {i === 3 && <strong>{t('اختياري — الفريق', 'Optional — team')}</strong>}
            <span className="step-number">{s.done ? '✓' : i + 1}</span>
            <div>
              <strong>{t(s.ar, s.en)}</strong>
              <small>{s.hint}</small>
            </div>
            <Link className="btn" href={s.href}>
              {s.done ? t('إدارة', 'Manage') : t('ابدأ', 'Start')}
            </Link>
          </div>
        ))}
        <div className="form-actions">
          <button
            className="btn btn-primary"
            disabled={busy || !w?.usage.channels}
            onClick={finish}
          >
            {t('إنهاء الإعداد والانتقال للوحة', 'Finish setup & open dashboard')}
          </button>
          <Link className="btn" href="/dashboard">
            {t('المتابعة لاحقًا', 'Continue later')}
          </Link>
        </div>
        <p className="muted mt-3">
          {t(
            'إكمال الإعداد يتطلب قناة نشطة. نشر السيناريو خطوة مستقلة من المصمم.',
            'An active channel is required to finish setup. Publish your flow separately in the builder.',
          )}
        </p>
      </section>
    </main>
  );
}
