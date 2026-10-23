'use client';
import { useState } from 'react';
import PriceCatalog from './PriceCatalog';
import AuditTrail from './AuditTrail';
import { API } from '../../lib/api';
import { LocaleProvider, useLocale } from '../../components/product/locale';
type Company = {
  id: string;
  name: string;
  slug: string;
  plan_code: string;
  status: string;
  suspended_at: string | null;
  members: number;
};
type User = {
  id: string;
  email: string;
  full_name: string;
  session_version: number;
  disabled_at: string | null;
};
type Plan = {
  code: string;
  name: string;
  price_cents: number;
  is_active: boolean;
  limits: Record<string, number>;
  features: Record<string, boolean>;
};
type Snapshot = {
  companies: Company[];
  users: User[];
  plans: Plan[];
  audit: { id: string; actor_id: string; action: string; details: unknown; created_at: string }[];
};
function Console() {
  const { t, toggle } = useLocale();
  const [token, setToken] = useState(''),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [enrollment, setEnrollment] = useState<{
      secret: string;
      provisioningUri: string;
      setupToken: string;
    } | null>(null),
    [requiresMfa, setRequiresMfa] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [stepUpCode, setStepUpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [companyQuery, setCompanyQuery] = useState(''),
    [userQuery, setUserQuery] = useState(''),
    [companyPage, setCompanyPage] = useState(1),
    [userPage, setUserPage] = useState(1),
    [companyTotal, setCompanyTotal] = useState(0),
    [userTotal, setUserTotal] = useState(0);
  async function loadSnapshot(
    access = token,
    options: { companyPage?: number; userPage?: number } = {},
  ) {
    const cp = options.companyPage ?? companyPage,
      up = options.userPage ?? userPage;
    const session = await request('/session', undefined, 'GET', access);
    const [snapshot, companies, users] = await Promise.all([
      request('', undefined, 'GET', access),
      session.permissions.includes('companies.read')
        ? request(
            '/directory?' +
              new URLSearchParams({ kind: 'companies', q: companyQuery, page: String(cp) }),
            undefined,
            'GET',
            access,
          )
        : Promise.resolve({ items: [], total: 0 }),
      session.permissions.includes('users.read')
        ? request(
            '/directory?' + new URLSearchParams({ kind: 'users', q: userQuery, page: String(up) }),
            undefined,
            'GET',
            access,
          )
        : Promise.resolve({ items: [], total: 0 }),
    ]);
    setPermissions(session.permissions);
    setData({ ...snapshot, companies: companies.items, users: users.items });
    setCompanyTotal(companies.total);
    setUserTotal(users.total);
    setCompanyPage(cp);
    setUserPage(up);
  }
  async function directoryPage(kind: 'companies' | 'users', page: number) {
    setBusy(true);
    setError('');
    try {
      await loadSnapshot(token, kind === 'companies' ? { companyPage: page } : { userPage: page });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function request(
    path: string,
    body?: unknown,
    method = body ? 'POST' : 'GET',
    access = token,
  ) {
    let stepUpToken = '';
    if (
      access &&
      ['POST', 'PATCH', 'DELETE'].includes(method) &&
      !['/login', '/mfa/enroll', '/step-up'].includes(path)
    ) {
      if (!/^[0-9]{6}$/.test(stepUpCode))
        throw new Error(
          t(
            'أدخل رمز مصادقة جديدًا لهذا الإجراء',
            'Enter a fresh authenticator code for this action',
          ),
        );
      const grant = await request(
        '/step-up',
        { otp: stepUpCode, method, path: '/platform' + path, body },
        'POST',
        access,
      );
      stepUpToken = grant.stepUpToken;
      setStepUpCode('');
    }
    const response = await fetch(API + '/platform' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(access ? { Authorization: 'Bearer ' + access } : {}),
        ...(stepUpToken ? { 'x-platform-step-up': stepUpToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.message === 'string' ? result.message : 'Platform request rejected',
      );
    return result;
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      if (token) await loadSnapshot();
      setMessage(t('تمت العملية.', 'Operation completed.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack mx-auto max-w-6xl p-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ELHAFEZ BOAT · PLATFORM OPERATIONS</p>
          <h1>{t('إدارة المنصة المستقلة', 'Independent platform administration')}</h1>
        </div>
        <button className="btn" onClick={toggle}>
          العربية / English
        </button>
      </div>
      <p className="notice">
        {t(
          'الدخول يتطلب إعداد المشغّل: قائمة معرفات مسؤولين ومفتاح توقيع واتصال قاعدة بيانات منفصل. صلاحيات مالك الشركة لا تمنح هذا الدخول. تبقى الجلسة في ذاكرة الصفحة لمدة عشر دقائق.',
          'Access requires operator configuration: an administrator ID allowlist, separate signing key and separate database connection. Workspace ownership grants no platform access. The ten-minute session stays in page memory.',
        )}
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p className="notice">{message}</p>}
      {!token && !enrollment && (
        <details className="card">
          <summary>{t('فقدت تطبيق المصادقة؟', 'Lost your authenticator?')}</summary>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                const result = await request('/mfa/recover', {
                  email: f.get('email'),
                  password: f.get('password'),
                  recoveryCode: f.get('recoveryCode'),
                });
                setEnrollment(result);
                setRequiresMfa(false);
              });
            }}
          >
            <p className="notice">
              {t(
                'يلزم رمز احتياطي محفوظ وكلمة المرور. ستُلغى جميع الجلسات والرموز الاحتياطية قبل تسجيل مصادقة جديدة.',
                'Requires a saved backup code and your password. All sessions and backup codes are revoked before enrolling a new authenticator.',
              )}
            </p>
            <label>
              {t('البريد الإلكتروني', 'Email')}
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              {t('كلمة المرور', 'Password')}
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <label>
              {t('الرمز الاحتياطي', 'Backup code')}
              <input
                name="recoveryCode"
                autoComplete="off"
                required
                minLength={32}
                maxLength={32}
              />
            </label>
            <button className="btn" disabled={busy}>
              {t('بدء الاسترداد الآمن', 'Start secure recovery')}
            </button>
          </form>
        </details>
      )}
      {!token && enrollment ? (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              const login = await request('/mfa/enroll', {
                setupToken: enrollment.setupToken,
                otp: f.get('otp'),
              });
              await loadSnapshot(login.accessToken);
              setToken(login.accessToken);
              setEnrollment(null);
            });
          }}
        >
          <h2>{t('تفعيل تطبيق المصادقة', 'Set up your authenticator')}</h2>
          <p>
            {t(
              'أضف المفتاح يدويًا في تطبيق المصادقة، أو افتح رابط الإعداد على جهازك. لا تشارك المفتاح.',
              'Add this key manually to your authenticator, or open the setup link on your device. Keep the key private.',
            )}
          </p>
          <code dir="ltr">{enrollment.secret}</code>
          <a className="btn" href={enrollment.provisioningUri}>
            {t('فتح تطبيق المصادقة', 'Open authenticator')}
          </a>
          <label className="field">
            {t('رمز من 6 أرقام', 'Six-digit code')}
            <input
              name="otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {t('تأكيد وتسجيل الدخول', 'Confirm and sign in')}
          </button>
          <button className="btn" type="button" onClick={() => setEnrollment(null)}>
            {t('العودة للدخول', 'Back to sign-in')}
          </button>
        </form>
      ) : !token ? (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              const login = await request('/login', {
                email: f.get('email'),
                password: f.get('password'),
                ...(f.get('otp') ? { otp: f.get('otp') } : {}),
              });
              if (login.requiresEnrollment) {
                setEnrollment(login);
                return;
              }
              if (login.requiresMfa) {
                setRequiresMfa(true);
                return;
              }
              await loadSnapshot(login.accessToken);
              setToken(login.accessToken);
            });
          }}
        >
          <label className="field">
            {t('البريد', 'Email')}
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label className="field">
            {t('كلمة المرور', 'Password')}
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <label className="field">
            {t('رمز تطبيق المصادقة', 'Authenticator code')}
            <input
              name="otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              required={requiresMfa}
            />
          </label>
          {requiresMfa && (
            <p className="notice">
              {t(
                'أدخل رمزًا جديدًا من تطبيق المصادقة ثم تابع.',
                'Enter a fresh authenticator code, then continue.',
              )}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {t('دخول مستقل', 'Platform sign-in')}
          </button>
        </form>
      ) : (
        <>
          <div className="form-actions">
            <button className="btn" disabled={busy} onClick={() => void act(async () => {})}>
              {t('تحديث', 'Refresh')}
            </button>
            <button
              className="btn"
              onClick={() => {
                setToken('');
                setBackupCodes([]);
                setStepUpCode('');
                setData(null);
              }}
            >
              {t('إنهاء جلسة المنصة', 'End platform session')}
            </button>
          </div>
          <p className="notice">
            {t('الصلاحيات الفعالة: ', 'Effective permissions: ')}
            {permissions.join(', ') || t('قراءة فقط', 'Read only')}
          </p>
          {permissions.includes('mfa.manage') && (
            <section className="card stack">
              <h2>{t('رموز الاسترداد الاحتياطية', 'Backup recovery codes')}</h2>
              <p>
                {t(
                  'توليد مجموعة جديدة يُبطل المجموعة السابقة. احفظ الرموز خارج المتصفح؛ ستظهر مرة واحدة فقط. يلزم رمز مصادقة جديد أدناه.',
                  'Generating a new set invalidates the previous set. Save the codes outside your browser; they appear only once. Enter a fresh authenticator code below first.',
                )}
              </p>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const r = await request('/mfa/backup-codes', {});
                    setBackupCodes(r.codes);
                  })
                }
              >
                {t('توليد رموز جديدة', 'Generate new codes')}
              </button>
              {backupCodes.length > 0 && (
                <>
                  <textarea
                    aria-label={t('احفظ رموز الاسترداد الآن', 'Save recovery codes now')}
                    readOnly
                    rows={8}
                    value={backupCodes.join('\n')}
                  />
                  <button className="btn" onClick={() => setBackupCodes([])}>
                    {t('حفظت الرموز؛ إخفاء', 'I saved the codes; hide')}
                  </button>
                </>
              )}
            </section>
          )}
          <section className="card stack">
            <h2>{t('تأكيد الإجراءات الحساسة', 'Confirm sensitive actions')}</h2>
            <label>
              {t(
                'رمز جديد من تطبيق المصادقة لكل إجراء',
                'Fresh authenticator code for each action',
              )}
              <input
                value={stepUpCode}
                onChange={(e) => setStepUpCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </label>
            <p className="muted">
              {t(
                'انتظر رمزًا جديدًا بعد تسجيل الدخول أو تنفيذ إجراء. الموافقة مرتبطة بطلب واحد وتنتهي خلال دقيقتين.',
                'Wait for a new code after signing in or completing an action. Approval is bound to one request and expires in two minutes.',
              )}
            </p>
          </section>

          <h2>{t('الشركات والاشتراكات', 'Companies and subscriptions')}</h2>
          <form
            className="card form-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void directoryPage('companies', 1);
            }}
          >
            <input
              aria-label={t('بحث الشركات', 'Search companies')}
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              maxLength={100}
              placeholder={t('الاسم أو المعرّف', 'Name or ID')}
            />
            <button className="btn" disabled={busy}>
              {t('بحث', 'Search')}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || companyPage === 1}
              onClick={() => void directoryPage('companies', companyPage - 1)}
            >
              {t('السابق', 'Previous')}
            </button>
            <span>
              {companyPage} · {companyTotal} {t('نتيجة', 'records')}
            </span>
            <button
              className="btn"
              type="button"
              disabled={busy || companyPage * 50 >= companyTotal}
              onClick={() => void directoryPage('companies', companyPage + 1)}
            >
              {t('التالي', 'Next')}
            </button>
          </form>
          {data?.companies.map((company) => (
            <article key={company.id} className="card stack">
              <h3>
                {company.name} · {company.plan_code} · {company.status}
              </h3>
              <small>
                {company.id} · {company.members} {t('أعضاء', 'members')}
              </small>
              <form
                className="form-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(() =>
                    request(
                      '/companies/' + company.id,
                      {
                        name: f.get('name'),
                        suspended: f.get('suspend') === 'on',
                        reason: f.get('reason'),
                      },
                      'PATCH',
                    ),
                  );
                }}
              >
                <input
                  name="name"
                  required
                  defaultValue={company.name}
                  aria-label={t('اسم الشركة', 'Company name')}
                />
                <label>
                  <input name="suspend" type="checkbox" defaultChecked={!!company.suspended_at} />{' '}
                  {t('تعليق الشركة', 'Suspend company')}
                </label>
                <input
                  name="reason"
                  minLength={10}
                  required
                  placeholder={t('السبب للتدقيق', 'Audit reason')}
                />
                <button className="btn" disabled={busy || !permissions.includes('companies.write')}>
                  {t('حفظ الشركة', 'Save company')}
                </button>
              </form>
              <form
                className="form-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    confirm(
                      t(
                        'هذا تعديل محلي للاستحقاقات، ولا يغير اشتراك Stripe. متابعة؟',
                        'This changes local entitlements and does not update Stripe. Continue?',
                      ),
                    )
                  )
                    void act(() =>
                      request(
                        '/subscriptions/' + company.id,
                        {
                          planCode: f.get('plan'),
                          status: f.get('status'),
                          reason: f.get('reason'),
                        },
                        'PATCH',
                      ),
                    );
                }}
              >
                <select name="plan" defaultValue={company.plan_code}>
                  {data.plans
                    .filter((plan) => plan.is_active)
                    .map((plan) => (
                      <option key={plan.code} value={plan.code}>
                        {plan.name}
                      </option>
                    ))}
                </select>
                <select name="status" defaultValue={company.status}>
                  {['active', 'trialing', 'past_due', 'canceled'].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                <input
                  name="reason"
                  minLength={10}
                  required
                  placeholder={t('سبب تعديل الاستحقاق', 'Entitlement override reason')}
                />
                <button
                  className="btn"
                  disabled={busy || !permissions.includes('subscriptions.write')}
                >
                  {t('تعديل الاستحقاق المحلي', 'Override local entitlement')}
                </button>
              </form>
            </article>
          ))}
          <h2>{t('المستخدمون', 'Users')}</h2>
          <form
            className="card form-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void directoryPage('users', 1);
            }}
          >
            <input
              aria-label={t('بحث المستخدمين', 'Search users')}
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              maxLength={100}
              placeholder={t('الاسم أو البريد أو المعرّف', 'Name, email or ID')}
            />
            <button className="btn" disabled={busy}>
              {t('بحث', 'Search')}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || userPage === 1}
              onClick={() => void directoryPage('users', userPage - 1)}
            >
              {t('السابق', 'Previous')}
            </button>
            <span>
              {userPage} · {userTotal} {t('نتيجة', 'records')}
            </span>
            <button
              className="btn"
              type="button"
              disabled={busy || userPage * 50 >= userTotal}
              onClick={() => void directoryPage('users', userPage + 1)}
            >
              {t('التالي', 'Next')}
            </button>
          </form>
          {data?.users.map((user) => (
            <article className="card" key={user.id}>
              <strong>{user.email}</strong>
              <form
                className="form-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(() =>
                    request(
                      '/users/' + user.id,
                      {
                        name: f.get('name'),
                        disabled: f.get('disabled') === 'on',
                        reason: f.get('reason'),
                      },
                      'PATCH',
                    ),
                  );
                }}
              >
                <input name="name" defaultValue={user.full_name} required />
                <label>
                  <input name="disabled" type="checkbox" defaultChecked={!!user.disabled_at} />{' '}
                  {t('إيقاف الحساب', 'Disable account')}
                </label>
                <input name="reason" required minLength={10} placeholder={t('السبب', 'Reason')} />
                <button className="btn" disabled={busy || !permissions.includes('users.write')}>
                  {t('حفظ وإبطال الجلسات', 'Save and revoke sessions')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !permissions.includes('sessions.revoke')}
                  onClick={() => {
                    const reason = prompt(
                      t(
                        'سبب إبطال جميع جلسات المستخدم (10 أحرف على الأقل)',
                        'Reason for revoking all user sessions (at least 10 characters)',
                      ),
                    );
                    if (reason)
                      void act(() => request('/users/' + user.id + '/revoke-sessions', { reason }));
                  }}
                >
                  {t('إبطال الجلسات فقط', 'Revoke sessions only')}
                </button>
              </form>
            </article>
          ))}
          <h2>{t('الباقات والحدود', 'Plans and limits')}</h2>
          {data?.plans.map((plan) => (
            <details className="card" key={plan.code}>
              <summary>
                {plan.name} · {plan.code}
              </summary>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const limits = Object.fromEntries(
                    Object.keys(plan.limits).map((key) => [key, Number(f.get('limit-' + key))]),
                  );
                  const features = Object.fromEntries(
                    Object.keys(plan.features).map((key) => [
                      key,
                      f.get('feature-' + key) === 'on',
                    ]),
                  );
                  void act(() =>
                    request(
                      '/plans/' + plan.code,
                      {
                        name: f.get('name'),
                        enabled: f.get('enabled') === 'on',
                        limits,
                        features,
                        reason: f.get('reason'),
                      },
                      'PATCH',
                    ),
                  );
                }}
              >
                <input name="name" defaultValue={plan.name} required />
                <label>
                  <input name="enabled" type="checkbox" defaultChecked={plan.is_active} />{' '}
                  {t('متاحة', 'Available')}
                </label>
                <div className="form-grid">
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <label className="field" key={key}>
                      {key}
                      <input
                        name={'limit-' + key}
                        type="number"
                        min={-1}
                        max={1000000000}
                        defaultValue={value}
                        required
                      />
                    </label>
                  ))}
                </div>
                {Object.entries(plan.features).map(([key, value]) => (
                  <label key={key}>
                    <input type="checkbox" name={'feature-' + key} defaultChecked={value} /> {key}
                  </label>
                ))}
                <input
                  name="reason"
                  minLength={10}
                  required
                  placeholder={t('سبب تعديل الباقة', 'Plan change reason')}
                />
                <button className="btn" disabled={busy || !permissions.includes('plans.write')}>
                  {t('حفظ الباقة', 'Save plan')}
                </button>
              </form>
            </details>
          ))}
          {permissions.includes('plans.read') && (
            <PriceCatalog request={request} canWrite={permissions.includes('plans.write')} />
          )}
          {permissions.includes('audit.read') && <AuditTrail request={request} />}
        </>
      )}
    </main>
  );
}
export default function Platform() {
  return (
    <LocaleProvider>
      <Console />
    </LocaleProvider>
  );
}
