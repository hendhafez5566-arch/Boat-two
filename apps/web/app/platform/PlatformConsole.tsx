'use client';
import { DisclosureSummary } from '../../components/product/DisclosureSummary';

import { useEffect, useRef, useState } from 'react';
import { NavIcon } from '../../components/product/NavIcon';
import { useTransientNotice } from '../../components/product/useTransientNotice';
import styles from './platform.module.css';
import BillingReviews from './BillingReviews';
import OperationalReports from './OperationalReports';
import PriceCatalog from './PriceCatalog';
import AuditTrail from './AuditTrail';
import { API } from '../../lib/api';
import { billingMoney } from '../../lib/billing-display';
import { createDesignReview } from './design-review';
import { useLocale } from '../../components/product/locale';
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
  currency?: string;
  interval?: string;
  checkout_available?: boolean;
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
type Overview = {
  companies: { total: number; suspended: number };
  subscriptions: Record<string, number>;
};

const sectionIcons:Record<string,string>={overview:'grid',companies:'commerce',plans:'billing',billing:'coins',users:'team',reports:'reports',audit:'audit',security:'shield'};
export default function Console({designReview=false}:{designReview?:boolean}) {
  const designRequest=useRef<ReturnType<typeof createDesignReview>|null>(null);
  if(designReview&&!designRequest.current)designRequest.current=createDesignReview();
  const { language, t, toggle } = useLocale();
  const [section, setSection] = useState('overview');
  const lock=useRef(false),writeLock=useRef(false),draft=useRef(false);
  const [writing,setWriting]=useState(false);
  const [loadedAt,setLoadedAt]=useState<Date|null>(null);
  function selectSection(id:string){
    if(id===section||lock.current||writeLock.current)return;
    if(draft.current&&!confirm(t('تجاهل التغييرات غير المحفوظة؟','Discard unsaved changes?')))return;
    if(backupCodes.length&&!confirm(t('هل حفظت رموز الاسترداد؟ لن تظهر مرة أخرى.','Have you saved your recovery codes? They will not be shown again.')))return;
    draft.current=false;setBackupCodes([]);setStepUpCode('');setError('');setMessage('');setSection(id);
  }
  const [report, setReport] = useState<Overview | null>(null);
  const [reportError, setReportError] = useState(false);
  const [token, setToken] = useState(designReview?'design-preview-local':''),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useTransientNotice(message,()=>setMessage(''));
  const [enrollment, setEnrollment] = useState<{
      secret: string;
      provisioningUri: string;
      setupToken: string;
    } | null>(null),
    [requiresMfa, setRequiresMfa] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [stepUpCode, setStepUpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(draft.current||lock.current||writeLock.current||backupCodes.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[backupCodes.length]);
  const [companyStatus, setCompanyStatus] = useState('');
  const [appliedCompanyQuery, setAppliedCompanyQuery] = useState('');
  const [appliedUserQuery, setAppliedUserQuery] = useState('');
  const [companyQuery, setCompanyQuery] = useState(''),
    [userQuery, setUserQuery] = useState(''),
    [companyPage, setCompanyPage] = useState(1),
    [userPage, setUserPage] = useState(1),
    [companyTotal, setCompanyTotal] = useState(0),
    [userTotal, setUserTotal] = useState(0);
  useEffect(()=>{if(designReview)void loadSnapshot('design-preview-local').catch(e=>setError(String(e)));},[designReview]);
  async function loadSnapshot(
    access = token,
    options: {
      companyPage?: number;
      userPage?: number;
      companyQuery?: string;
      userQuery?: string;
    } = {},
  ) {
    const cp = options.companyPage ?? companyPage,
      up = options.userPage ?? userPage;
    const companySearch = options.companyQuery ?? appliedCompanyQuery;
    const userSearch = options.userQuery ?? appliedUserQuery;
    const session = await request('/session', undefined, 'GET', access);
    const [snapshot, companies, users, overview] = await Promise.all([
      request('', undefined, 'GET', access),
      session.permissions.includes('companies.read')
        ? request(
            '/directory?' +
              new URLSearchParams({ kind: 'companies', q: companySearch, page: String(cp) }),
            undefined,
            'GET',
            access,
          )
        : Promise.resolve({ items: [], total: 0 }),
      session.permissions.includes('users.read')
        ? request(
            '/directory?' + new URLSearchParams({ kind: 'users', q: userSearch, page: String(up) }),
            undefined,
            'GET',
            access,
          )
        : Promise.resolve({ items: [], total: 0 }),
      session.permissions.includes('reports.read')
        ? request(
            '/reports?' +
              new URLSearchParams({
                from: new Date(Date.now() - 30 * 86400000).toISOString(),
                to: new Date().toISOString(),
              }),
            undefined,
            'GET',
            access,
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    setLoadedAt(new Date());
    setReport(overview);
    setReportError(session.permissions.includes('reports.read') && !overview);
    setPermissions(session.permissions);
    setData({ ...snapshot, companies: companies.items, users: users.items });
    setAppliedCompanyQuery(companySearch);
    setAppliedUserQuery(userSearch);
    setCompanyTotal(companies.total);
    setUserTotal(users.total);
    setCompanyPage(cp);
    setUserPage(up);
  }
  async function directoryPage(kind: 'companies' | 'users', page: number, query?: string) {
    if(lock.current||writeLock.current)return;
    lock.current=true;setBusy(true);
    setError('');
    try {
      await loadSnapshot(
        token,
        kind === 'companies'
          ? { companyPage: page, companyQuery: query }
          : { userPage: page, userQuery: query },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  async function request(
    path: string,
    body?: unknown,
    method = body ? 'POST' : 'GET',
    access = token,
  ) {
    if(designReview){if(!designRequest.current)throw new Error('Design review unavailable');const result=await designRequest.current(path,body,method);if(method!=='GET')draft.current=false;return result;}
    const mutation=!!access&&['POST','PATCH','DELETE'].includes(method)&&!['/login','/mfa/enroll','/step-up'].includes(path);
    if(mutation&&writeLock.current)throw new Error(t('هناك إجراء قيد التنفيذ','An action is already in progress'));
    if(mutation){writeLock.current=true;setWriting(true);}
    try{
    let stepUpToken = '';
    if (mutation) {
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
        Array.isArray(result.message)
          ? result.message.join(' · ')
          : result.message || t('تعذّر تنفيذ الطلب', 'Platform request rejected'),
      );
    if(mutation)draft.current=false;
    return result;
    }finally{if(mutation){writeLock.current=false;setWriting(false);}}
  }
  async function act(fn: () => Promise<unknown>) {
    if(lock.current||writeLock.current)return;
    lock.current=true;setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(t('تمت العملية.', 'Operation completed.'));
      if (token) {
        try {
          await loadSnapshot();
        } catch {
          setError(
            t(
              'تم تنفيذ الإجراء وتعذّر تحديث العرض. اضغط تحديث.',
              'The action completed. Select Refresh to reload the view.',
            ),
          );
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  function subscriptionLabel(status: string) {
    return (
      (
        {
          active: t('نشط', 'Active'),
          trialing: t('تجريبي', 'Trial'),
          past_due: t('متأخر السداد', 'Past due'),
          canceled: t('ملغى', 'Canceled'),
        } as Record<string, string>
      )[status] ?? status
    );
  }

  const primaryLimits = {
    messages_per_month: t('الرسائل شهريًا', 'Messages per month'),
    contacts: t('الحد الإجمالي للعملاء', 'Total contact limit'),
    ai_credits: t('رصيد الذكاء الاصطناعي الشهري', 'Monthly AI credits'),
  };
  const limitLabels: Record<string, string> = {
    ...primaryLimits,
    agents: t('مقاعد الفريق', 'Team seats'),
    bots: t('البوتات','Bots'),
    channels: t('القنوات', 'Channels'),
    flows: t('التدفقات', 'Flows'),
  };

  const sections = [
    { id: 'overview', label: t('نظرة عامة', 'Overview'), permission: '' },
    {
      id: 'companies',
      label: t('الشركات والاشتراكات', 'Companies & subscriptions'),
      permission: 'companies.read',
    },
    { id: 'plans', label: t('الباقات والأسعار', 'Plans & prices'), permission: 'plans.read' },
    { id: 'billing', label: t('الفوترة', 'Billing'), permission: 'subscriptions.read' },
    { id: 'users', label: t('المستخدمون', 'Users'), permission: 'users.read' },
    { id: 'reports', label: t('التقارير', 'Reports'), permission: 'reports.read' },
    { id: 'audit', label: t('سجل العمليات', 'Audit log'), permission: 'audit.read' },
    { id: 'security', label: t('أمان الحساب', 'Account security'), permission: '' },
  ].filter(({ permission }) => !permission || permissions.includes(permission));
  const activeSection = sections.find(({ id }) => id === section) ?? sections[0];

  const visibleCompanies = data?.companies.filter((company) => {
    if (!companyStatus) return true;
    if (companyStatus === 'suspended') return Boolean(company.suspended_at);
    return company.status === companyStatus;
  });

  return (
    <main
      className={`${styles.console} ${token ? styles.signedIn : styles.signIn}`}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.brandIcon}><NavIcon name="shield"/></span>
          <div><p className={styles.brand}>BOT TWO · PLATFORM</p>
          <h1>{t('لوحة مدير المنصة', 'Platform administration')}</h1>
          <p className={styles.subtitle}>{t('إدارة مركزية للشركات والتشغيل والأمان','Central control of companies, operations and security')}</p></div>
        </div>
        <div className={styles.headerActions}>{token&&<span className={styles.sessionBadge}><NavIcon name="shield"/>{designReview?t('معاينة التصميم','Design review'):t('جلسة إدارية محمية','Secured admin session')}</span>}
        <button className="btn" onClick={toggle}><NavIcon name="language"/>
          {t('English', 'العربية')}
        </button></div>
      </header>
      {designReview&&<p role="status" className="notice">{t('وضع مراجعة التصميم: جميع البيانات تجريبية والتعديلات محلية ولا تُحفظ في قاعدة البيانات.','Design review: all records are fictional; changes stay local and are not saved to the database.')}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!token && !enrollment && (
        <details className="card">
          <DisclosureSummary>
            {t('فقدت تطبيق المصادقة؟', 'Lost your authenticator?')}
          </DisclosureSummary>
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
            <button className="btn" disabled={busy||writing}>
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
          <button className="btn btn-primary" disabled={busy||writing}>
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
          <button className="btn btn-primary" disabled={busy||writing}>
            {t('دخول مستقل', 'Platform sign-in')}
          </button>
        </form>
      ) : (
        <>
          <div className="form-actions">
            {loadedAt&&<span className={styles.secondary}>{t('آخر تحديث','Last refreshed')}: {loadedAt.toLocaleTimeString(language)}</span>}
            <button
              className="btn"
              disabled={busy||writing}
              onClick={() => {if(draft.current&&!confirm(t('تحديث العرض مع تجاهل المسودة؟','Refresh and discard draft?')))return;draft.current=false;void directoryPage('companies', companyPage);}}
            >
              <NavIcon name="refresh"/>{t('تحديث', 'Refresh')}
            </button>
            <button
              className="btn"
              disabled={busy||writing}
              onClick={() => {
                if(writeLock.current||lock.current)return;
                if((draft.current||backupCodes.length)&&!confirm(t('إنهاء الجلسة وتجاهل البيانات غير المحفوظة؟','End session and discard unsaved data?')))return;
                if(designReview){draft.current=false;window.location.reload();return;}
                draft.current=false;setLoadedAt(null);setPermissions([]);
                setToken('');
                setBackupCodes([]);
                setStepUpCode('');
                setData(null);
                setReport(null);
                setSection('overview');
                setCompanyQuery('');
                setUserQuery('');
                setAppliedCompanyQuery('');
                setAppliedUserQuery('');
                setCompanyStatus('');
                setCompanyPage(1);
                setUserPage(1);
                setError('');
                setMessage('');
              }}
            >
              <NavIcon name="logout"/>{designReview?t('إعادة ضبط المعاينة','Reset review'):t('إنهاء جلسة المنصة', 'End platform session')}
            </button>
          </div>
          <div className={styles.layout}>
            <nav className={styles.nav} aria-label={t('أقسام المنصة', 'Platform sections')}>
              {sections.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={activeSection.id === id ? 'page' : undefined}
                  disabled={busy||writing} onClick={() => selectSection(id)}
                >
                  <NavIcon name={sectionIcons[id]}/>{label}
                </button>
              ))}
            </nav>
            <div className={styles.content} data-platform-section={activeSection.id} aria-busy={busy||writing} onChange={e=>{const form=(e.target as HTMLElement).closest("form");if(form&&form.querySelector("[name=reason]"))draft.current=true;}}>
              <header className={styles.sectionHeader}><span className={styles.sectionIcon}><NavIcon name={sectionIcons[activeSection.id]}/></span><div><h2>{activeSection.label}</h2><p>{t("إدارة ومراجعة البيانات الفعلية للمنصة","Manage and review live platform records")}</p></div></header>
              {activeSection.id === 'overview' && (
                <section className={styles.panel}>
                  <h2>{activeSection.label}</h2>
                  <nav className="platform-quick" aria-label={t('إدارة المنصة','Platform operations')}>{sections.filter(item=>['companies','users','billing','plans','reports','audit'].includes(item.id)).map(item=><button type="button" key={item.id} disabled={busy||writing} onClick={()=>selectSection(item.id)}><span className={styles.sectionIcon}><NavIcon name={sectionIcons[item.id]}/></span><strong>{item.label}</strong><span aria-hidden="true">‹</span></button>)}</nav>
                  {reportError && (
                    <p role="alert" className="notice error">
                      {t(
                        'تعذّر تحميل الإحصائيات. جرّب التحديث.',
                        'Could not load statistics. Try refreshing.',
                      )}
                    </p>
                  )}
                  <div className={styles.metrics}>
                    {[
                      ...(report
                        ? [
                            [t('إجمالي الشركات', 'Total companies'), report.companies.total],
                            [
                              t('الشركات المعلّقة', 'Suspended companies'),
                              report.companies.suspended,
                            ],
                            [
                              t('اشتراكات نشطة', 'Active subscriptions'),
                              report.subscriptions.active ?? 0,
                            ],
                            [
                              t('اشتراكات قيد التجربة', 'Trial subscriptions'),
                              report.subscriptions.trialing ?? 0,
                            ],
                          ]
                        : []),
                      ...(permissions.includes('plans.read')
                        ? [
                            [
                              t('الباقات المتاحة', 'Available plans'),
                              data?.plans.filter((plan) => plan.is_active).length ?? 0,
                            ],
                          ]
                        : []),
                    ].map(([label, value],index) => (
                      <div className={styles.metric} key={label}>
                        <span className={styles.metricIcon}><NavIcon name={['commerce','blocked','circleCheck','calendar','billing'][index%5]}/></span><span>{label}</span>
                        <strong>{Number(value).toLocaleString(language)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {activeSection.id === 'security' && (
                <section className={styles.panel}>
                  <h2>{activeSection.label}</h2>
                  <p>{t('الصلاحيات الفعّالة', 'Effective permissions')}</p>
                  <ul className={styles.permissions}>
                    {permissions.map((permission) => (
                      <li key={permission}>{permission}</li>
                    ))}
                  </ul>
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
                        disabled={busy||writing}
                        onClick={() => {
                          if(!confirm(t('إبطال الرموز الاحتياطية القديمة وتوليد أخرى؟','Invalidate old backup codes and generate new ones?')))return;
                          void act(async () => {
                            const r = await request('/mfa/backup-codes', {});
                            setBackupCodes(r.codes);
                          });
                        }}
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
                </section>
              )}
              {!designReview&&['companies', 'users', 'plans', 'billing', 'security'].includes(activeSection.id) &&
                permissions.some((permission) =>
                  [
                    'companies.write',
                    'subscriptions.write',
                    'users.write',
                    'plans.write',
                    'sessions.revoke',
                    'mfa.manage',
                  ].includes(permission),
                ) && (
                  <section className={styles.verification}><NavIcon name="shield"/>
                    <label>
                      {t(
                        'رمز جديد من تطبيق المصادقة لكل إجراء',
                        'Fresh authenticator code for each action',
                      )}
                      <input
                        value={stepUpCode}
                        onChange={(e) => setStepUpCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                      />
                    </label>
                  </section>
                )}
              {activeSection.id === 'companies' && (
                <section className={styles.panel}>
                  <h2>{t('الشركات والاشتراكات', 'Companies and subscriptions')}</h2>
                  <form
                    className="card form-actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void directoryPage('companies', 1, companyQuery.trim());
                    }}
                  >
                    <input
                      aria-label={t('بحث الشركات', 'Search companies')}
                      value={companyQuery}
                      onChange={(e) => setCompanyQuery(e.target.value)}
                      maxLength={100}
                      placeholder={t('الاسم أو المعرّف', 'Name or ID')}
                    />
                    <button className="btn" disabled={busy||writing}>
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
                  <label className={styles.filter}>
                    {t('تصفية الصفحة الحالية', 'Filter this page')}
                    <select
                      value={companyStatus}
                      onChange={(event) => setCompanyStatus(event.target.value)}
                    >
                      <option value="">{t('كل الحالات', 'All statuses')}</option>
                      <option value="suspended">{t('معلّقة', 'Suspended')}</option>
                      {['active', 'trialing', 'past_due', 'canceled'].map((status) => (
                        <option value={status} key={status}>
                          {subscriptionLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {visibleCompanies?.map((company) => (
                    <details key={company.id} className={styles.row}>
                      <DisclosureSummary>
                        <span className={styles.rowTitle}>{company.name}</span>
                        <span className={styles.tag}>{company.plan_code}</span>
                        <span className={styles.tag} data-state={company.suspended_at?'suspended':company.status}>
                          {company.suspended_at
                            ? t('معلّقة', 'Suspended')
                            : subscriptionLabel(company.status)}
                        </span>
                      </DisclosureSummary>
                      <div className={styles.rowBody}>
                        <small dir="auto">
                          {company.slug} · {company.members} {t('أعضاء', 'members')}
                        </small>
                        <form
                          className="form-actions"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            if(!confirm(t('تأكيد حفظ بيانات الشركة وحالتها؟','Confirm company details and status change?')))return;
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
                            <input
                              name="suspend"
                              type="checkbox"
                              defaultChecked={!!company.suspended_at}
                            />{' '}
                            {t('تعليق الشركة', 'Suspend company')}
                          </label>
                          <input
                            name="reason"
                            minLength={10}
                            required
                            placeholder={t('السبب للتدقيق', 'Audit reason')}
                          />
                          <button
                            className="btn"
                            disabled={busy || writing || !permissions.includes('companies.write')}
                          >
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
                          <select
                            name="plan"
                            aria-label={t('الباقة', 'Plan')}
                            defaultValue={company.plan_code}
                          >
                            {!data?.plans.some(
                              (plan) => plan.is_active && plan.code === company.plan_code,
                            ) && (
                              <option value={company.plan_code} disabled>
                                {company.plan_code}
                              </option>
                            )}
                            {data?.plans
                              .filter((plan) => plan.is_active)
                              .map((plan) => (
                                <option key={plan.code} value={plan.code}>
                                  {plan.name}
                                </option>
                              ))}
                          </select>
                          <select
                            name="status"
                            aria-label={t('حالة الاشتراك', 'Subscription status')}
                            defaultValue={company.status}
                          >
                            {Array.from(
                              new Set([
                                company.status,
                                'active',
                                'trialing',
                                'past_due',
                                'canceled',
                              ]),
                            ).map((status) => (
                              <option key={status} value={status}>
                                {subscriptionLabel(status)}
                              </option>
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
                            disabled={busy || writing || !permissions.includes('subscriptions.write')}
                          >
                            {t('تعديل الاستحقاق المحلي', 'Override local entitlement')}
                          </button>
                        </form>
                      </div>
                    </details>
                  ))}
                  {visibleCompanies?.length === 0 && (
                    <p className={styles.empty}>
                      {t('لا توجد شركات مطابقة.', 'No matching companies.')}
                    </p>
                  )}
                </section>
              )}
              {activeSection.id === 'users' && (
                <section className={styles.panel}>
                  <h2>{activeSection.label}</h2>
                  <form
                    className="card form-actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void directoryPage('users', 1, userQuery.trim());
                    }}
                  >
                    <input
                      aria-label={t('بحث المستخدمين', 'Search users')}
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      maxLength={100}
                      placeholder={t('الاسم أو البريد أو المعرّف', 'Name, email or ID')}
                    />
                    <button className="btn" disabled={busy||writing}>
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
                    <details className={styles.row} key={user.id}>
                      <DisclosureSummary>
                        <span className={styles.rowTitle}>{user.full_name || user.email}</span>
                        <span className={styles.secondary} dir="ltr">
                          {user.email}
                        </span>
                        <span className={styles.tag} data-state={user.disabled_at?'disabled':'active'}>
                          {user.disabled_at ? t('موقوف', 'Disabled') : t('نشط', 'Active')}
                        </span>
                      </DisclosureSummary>
                      <div className={styles.rowBody}>
                        <form
                          className="form-actions"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            if(!confirm(t('تأكيد حفظ المستخدم وإبطال جلساته؟','Confirm saving user and revoking sessions?')))return;
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
                          <input
                            name="name"
                            aria-label={t('اسم المستخدم', 'User name')}
                            defaultValue={user.full_name}
                            required
                          />
                          <label>
                            <input
                              name="disabled"
                              type="checkbox"
                              defaultChecked={!!user.disabled_at}
                            />{' '}
                            {t('إيقاف الحساب', 'Disable account')}
                          </label>
                          <input
                            name="reason"
                            required
                            minLength={10}
                            placeholder={t('السبب', 'Reason')}
                          />
                          <button
                            className="btn"
                            disabled={busy || writing || !permissions.includes('users.write')}
                          >
                            {t('حفظ وإبطال الجلسات', 'Save and revoke sessions')}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy || writing || !permissions.includes('sessions.revoke')}
                            onClick={() => {
                              const reason = prompt(
                                t(
                                  'سبب إبطال جميع جلسات المستخدم (10 أحرف على الأقل)',
                                  'Reason for revoking all user sessions (at least 10 characters)',
                                ),
                              );
                              if (reason)
                                void act(() =>
                                  request('/users/' + user.id + '/revoke-sessions', { reason }),
                                );
                            }}
                          >
                            {t('إبطال الجلسات فقط', 'Revoke sessions only')}
                          </button>
                        </form>
                      </div>
                    </details>
                  ))}
                  {data?.users.length === 0 && (
                    <p className={styles.empty}>
                      {t('لا يوجد مستخدمون مطابقون.', 'No matching users.')}
                    </p>
                  )}
                </section>
              )}
              {activeSection.id === 'plans' && (
                <section className={styles.panel}>
                  <h2>{t('الباقات والحدود', 'Plans and limits')}</h2>
                  <p className="notice">{designReview?t('الكتالوج يبدأ من الباقات العامة الفعلية عند توفرها، لكن أي تعديل هنا تجريبي ومحلي فقط.','Catalog starts from the real public plans when available; all edits here are local simulations.'):t('هذه الباقات هي مصدر قسم اشتراكي. تعديل الحدود والمميزات يؤثر على الشركات المشتركة، أما الأسعار الحالية فتُدار من كتالوج الأسعار ولا تعيد تسعير الاشتراكات القائمة تلقائيًا.','These plans power My Subscription. Limits and features affect subscribed companies; prices are managed in the price catalog and do not automatically reprice existing subscriptions.')}</p>
                  {permissions.includes('plans.write') && data && data.plans.length > 0 && (
                    <details className={styles.row}>
                      <DisclosureSummary>{t('إنشاء باقة', 'Create plan')}</DisclosureSummary>
                      <form
                        className="stack"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          const limits = Object.fromEntries(
                            Object.keys(primaryLimits).map((key) => [key, Number(form.get(key))]),
                          );
                          void act(() =>
                            request('/plans', {
                              code: form.get('code'),
                              name: form.get('name'),
                              templateCode: form.get('templateCode'),
                              limits,
                              reason: form.get('reason'),
                            }),
                          );
                        }}
                      >
                        <div className="form-grid">
                          <label className="field">
                            {t('اسم الباقة', 'Plan name')}
                            <input name="name" maxLength={100} required />
                          </label>
                          <label className="field">
                            {t('رمز فريد بالإنجليزية', 'Unique plan code')}
                            <input name="code" dir="ltr" pattern="[a-z][a-z0-9\-]{1,39}" required />
                          </label>
                          <label className="field">
                            {t('نسخ باقي الإعدادات من', 'Copy other settings from')}
                            <select name="templateCode">
                              {data.plans.map((plan) => (
                                <option key={plan.code} value={plan.code}>
                                  {plan.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {Object.entries(primaryLimits).map(([key, label]) => (
                            <label className="field" key={key}>
                              {label}
                              <input name={key} type="number" min={-1} max={1000000000} required />
                            </label>
                          ))}
                        </div>
                        <p className="muted">
                          {t(
                            '٠ للمنع، و−١ لغير محدود. تُنشأ الباقة غير متاحة حتى تفعيلها.',
                            'Use 0 to disable and −1 for unlimited. The plan starts unavailable until enabled.',
                          )}
                        </p>
                        <label className="field">
                          {t('سبب التغيير', 'Change reason')}
                          <input name="reason" minLength={10} maxLength={1000} required />
                        </label>
                        <button className="btn btn-primary" disabled={busy||writing}>
                          {t('إنشاء باقة', 'Create plan')}
                        </button>
                      </form>
                    </details>
                  )}
                  {data?.plans.map((plan) => (
                    <details className={styles.row} key={plan.code}>
                      <DisclosureSummary>
                        <span className={styles.rowTitle}>{plan.name}</span>
                        <span className={styles.tag}>{plan.code}</span>
                        <span className={styles.tag}>{plan.currency?billingMoney(plan.price_cents,plan.currency):'—'} / {plan.interval==='year'?t('سنة','year'):t('شهر','month')}</span>
                        {plan.price_cents>0&&<span className={styles.tag} data-state={plan.checkout_available?'active':'past_due'}>{plan.checkout_available?t('سعر مرتبط بالكتالوج','Catalog price mapped'):t('سعر غير جاهز للدفع','Price not ready for checkout')}</span>}
                        <span className={styles.tag} data-state={plan.is_active?'active':'disabled'}>
                          {plan.is_active ? t('متاحة', 'Available') : t('غير متاحة', 'Unavailable')}
                        </span>
                      </DisclosureSummary>
                      <form
                        className="stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const limits = Object.fromEntries(
                            Object.keys(plan.limits).map((key) => [
                              key,
                              Number(f.get('limit-' + key)),
                            ]),
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
                        <input
                          name="name"
                          aria-label={t('اسم الباقة', 'Plan name')}
                          defaultValue={plan.name}
                          required
                        />
                        <label>
                          <input name="enabled" type="checkbox" defaultChecked={plan.is_active} />{' '}
                          {t('متاحة', 'Available')}
                        </label>
                        <div className="form-grid">
                          {Object.entries(plan.limits).map(([key, value]) => (
                            <label className="field" key={key}>
                              {limitLabels[key] ?? key}
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
                            <input type="checkbox" name={'feature-' + key} defaultChecked={value} />{' '}
                            {key}
                          </label>
                        ))}
                        <input
                          name="reason"
                          minLength={10}
                          required
                          placeholder={t('سبب تعديل الباقة', 'Plan change reason')}
                        />
                        <button
                          className="btn"
                          disabled={busy || writing || !permissions.includes('plans.write')}
                        >
                          {t('حفظ الباقة', 'Save plan')}
                        </button>
                      </form>
                    </details>
                  ))}
                  <PriceCatalog request={request} canWrite={permissions.includes('plans.write')} plans={data?.plans??[]} onChanged={()=>loadSnapshot()} />
                </section>
              )}
              {activeSection.id === 'billing' && (
                <BillingReviews
                  request={request}
                  canWrite={permissions.includes('subscriptions.write')}
                />
              )}
              {activeSection.id === 'reports' && <OperationalReports request={request} />}
              {activeSection.id === 'audit' && <AuditTrail request={request} />}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

