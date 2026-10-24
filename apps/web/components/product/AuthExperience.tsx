'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBrand } from './BrandContext';
import { useLocale } from './locale';
import { NavIcon } from './NavIcon';
import { api, setSession } from '../../lib/api';
export function AuthExperience({
  register = false,
  invitation = false,
}: {
  register?: boolean;
  invitation?: boolean;
}) {
  const brand = useBrand(),
    { t, toggle } = useLocale(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  const joining = register && (!!brand || invitation);
  const [token, setToken] = useState('');
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const session = await api<{ accessToken: string; refreshToken: string }>(
        joining ? '/auth/accept-invitation' : register ? '/auth/register' : '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: f.get('email'),
            password: f.get('password'),
            ...(register
              ? {
                  fullName: f.get('fullName'),
                  ...(joining
                    ? { token: f.get('invitation') }
                    : { workspaceName: f.get('workspaceName') }),
                }
              : {}),
            ...(brand ? { brandHostname: brand.hostname } : {}),
          }),
        },
      );
      setSession(session);
      window.location.assign(register && !joining ? '/dashboard/onboarding' : '/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-experience">
      <section className="auth-story">
        <Link href="/" className="brand">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt="" width={44} height={44} />
          ) : (
            <span className="brand-mark">
              <NavIcon name="flows" />
            </span>
          )}
          <strong>{brand?.name ?? 'ELHAFEZ BOAT'}</strong>
        </Link>
        <span className="auth-orbit" aria-hidden="true">
          <NavIcon name="automations" />
        </span>
        <p className="eyebrow">
          {t('محادثات تفتح فرصًا جديدة', 'CONVERSATIONS THAT OPEN POSSIBILITIES')}
        </p>
        <h1>
          {brand?.widgetTitle ??
            t('كل محادثة، بداية أفضل.', 'Every conversation. A better beginning.')}
        </h1>
        <p>
          {t(
            'مساحة واحدة تجمع فريقك وعملاءك وأفكارك. صمّم تجربة ترحيب وابدأ بخطوات بسيطة.',
            'One space for your team, customers and ideas. Create a warm welcome and start with simple steps.',
          )}
        </p>
        <div className="auth-benefits">
          {[
            ['inbox', t('فريق متصل', 'A connected team')],
            ['flows', t('بوت على مقاسك', 'A bot made for you')],
            ['crm', t('علاقات تدوم', 'Lasting relationships')],
          ].map(([icon, label]) => (
            <span key={icon}>
              <NavIcon name={icon} />
              {label}
            </span>
          ))}
        </div>
      </section>
      <section className="auth-form-panel">
        <button className="btn locale-switch" onClick={toggle}>
          العربية / English
        </button>
        <div className="auth-form-content">
          <p className="eyebrow">{brand?.name ?? 'YOUR BUSINESS, CONNECTED'}</p>
          <h2>
            {joining
              ? t('انضم إلى فريقك', 'Join your team')
              : register
                ? t('لنبدأ بشركتك', 'Let’s start with your business')
                : t('أهلًا بعودتك', 'Welcome back')}
          </h2>
          <p className="muted">
            {joining
              ? t(
                  'استخدم الدعوة التي أرسلها مسؤول شركتك.',
                  'Use the invitation sent by your workspace administrator.',
                )
              : register
                ? t(
                    'خطوتك الأولى نحو محادثات أفضل.',
                    'Your first step toward better conversations.',
                  )
                : t('مساحة عملك وفريقك في انتظارك.', 'Your workspace and team are ready for you.')}
          </p>
          <form className="stack" onSubmit={submit}>
            {register && (
              <label>
                {t('اسمك الكامل', 'Full name')}
                <input name="fullName" required maxLength={120} autoComplete="name" />
              </label>
            )}
            {register && !joining && (
              <label>
                {t('اسم الشركة', 'Company name')}
                <input name="workspaceName" required maxLength={120} autoComplete="organization" />
              </label>
            )}
            {joining ? (
              <label>
                {t('رمز الدعوة', 'Invitation token')}
                <input
                  name="invitation"
                  required
                  minLength={10}
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
            ) : (
              <label>
                {t('البريد الإلكتروني', 'Email address')}
                <input
                  name="email"
                  type="email"
                  dir="ltr"
                  required
                  autoComplete="username"
                  placeholder="you@company.com"
                />
              </label>
            )}
            <label>
              {t('كلمة المرور', 'Password')}
              <div className="password-field">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  required
                  minLength={register ? 8 : 1}
                  maxLength={128}
                  autoComplete={register ? 'new-password' : 'current-password'}
                />
                <button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>
                  {visible ? t('إخفاء', 'Hide') : t('إظهار', 'Show')}
                </button>
              </div>
            </label>
            {register && (
              <p className="muted">
                {t(
                  'استخدم 8 أحرف على الأقل وكلمة مرور فريدة.',
                  'Use at least 8 characters and a unique password.',
                )}
              </p>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <button className="btn btn-primary auth-submit" disabled={busy}>
              {busy
                ? t('جارٍ المتابعة…', 'Continuing…')
                : joining
                  ? t('قبول الدعوة', 'Accept invitation')
                  : register
                    ? t('إنشاء مساحة العمل', 'Create workspace')
                    : t('تسجيل الدخول', 'Sign in')}
            </button>
          </form>
          <p className="auth-switch">
            {register ? t('لديك حساب؟', 'Already have an account?') : t('جديد هنا؟', 'New here?')}{' '}
            <Link href={register ? '/login' : '/register'}>
              {register
                ? t('تسجيل الدخول', 'Sign in')
                : brand
                  ? t('الانضمام بدعوة', 'Join with an invitation')
                  : t('أنشئ مساحة عمل', 'Create a workspace')}
            </Link>
          </p>
          <p className="auth-footnote">
            {t(
              'بيانات كل شركة معزولة. لا يمنح النطاق وحده صلاحية الدخول.',
              'Each workspace stays isolated. A domain alone never grants access.',
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
