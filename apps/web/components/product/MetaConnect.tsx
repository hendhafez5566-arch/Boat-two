'use client';
import { DisclosureSummary } from './DisclosureSummary';
import styles from './meta-connect.module.css';

import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { embeddedSignupSession } from '../../lib/meta-signup';
import { useLocale } from './locale';
import { useData } from '../business/useData';
type SDK = {
  init: (args: Record<string, unknown>) => void;
  login: (
    cb: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};
export default function MetaConnect({
  onSaved,
  selectedKind,
}: {
  onSaved: () => void;
  selectedKind?: string;
}) {
  const { t } = useLocale();
  const config = useData<{
    configured: boolean;
    externalEnabled: boolean;
    connectEnabled?: boolean;
    appId: string | null;
    embeddedConfigId: string | null;
    redirectUri: string;
    catalogConfigured?: boolean;
    webhookUrl?: string;
  }>('/channels/meta/config', {
    configured: false,
    externalEnabled: false,
    appId: null,
    embeddedConfigId: null,
    redirectUri: '',
  });
  const connections = useData<
    {
      id: string;
      kind: string;
      assets: { id: string; name: string; instagram?: { id: string; username?: string } }[];
    }[]
  >('/channels/meta/connections', []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [withCatalog, setWithCatalog] = useState(false);
  const [whatsappMode, setWhatsappMode] = useState('coexistence');
  const [existingWabaId, setExistingWabaId] = useState('');
  const [existingToken, setExistingToken] = useState('');
  const [existingOpen, setExistingOpen] = useState(false);
  async function attachExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await api<{ accounts: { id: string; webhookReady: boolean }[] }>(
        '/channels/meta/manual/complete',
        {
          method: 'POST',
          body: JSON.stringify({
            wabaId: existingWabaId.trim(),
            accessToken: existingToken.trim(),
          }),
        },
      );
      setExistingToken('');
      onSaved();
      if (result.accounts.some((a) => !a.webhookReady))
        setError(
          t(
            'تم حفظ الحساب، لكن الاتصال يحتاج مراجعة إعدادات Webhook.',
            'Account saved, but webhook setup needs review.',
          ),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(kind: string, withCatalog = false) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ state: string; authorizeUrl: string; embeddedConfigId?: string }>(
        '/channels/meta/start',
        {
          method: 'POST',
          body: JSON.stringify({ kind, withCatalog }),
        },
      );
      if (kind !== 'whatsapp') {
        window.location.assign(result.authorizeUrl);
        return;
      }
      const signup = embeddedSignupSession();
      const listener = (event: MessageEvent) => signup.receive(event.origin, event.data);
      window.addEventListener('message', listener);
      try {
        const win = window as Window & { FB?: SDK };
        if (!win.FB)
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://connect.facebook.net/en_US/sdk.js';
            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error(t('تعذّر تحميل Meta SDK', 'Meta SDK failed to load')));
            document.head.appendChild(script);
          });
        if (!win.FB) throw new Error(t('Meta SDK غير متاح', 'Meta SDK unavailable'));
        win.FB.init({ appId: config.data.appId, version: 'v21.0', xfbml: false });
        const response = await new Promise<{ authResponse?: { code?: string } }>((resolve) =>
          win.FB!.login(resolve, {
            config_id: result.embeddedConfigId || config.data.embeddedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              version: 'v4',
              sessionInfoVersion: '3',
              ...(whatsappMode === 'coexistence'
                ? { featureType: 'whatsapp_business_app_onboarding' }
                : {}),
            },
          }),
        );
        if (!response.authResponse?.code)
          throw new Error(
            t(
              'أُلغي الربط أو لم يُمنح كود.',
              'Connection canceled or no authorization code returned.',
            ),
          );
        const { wabaId, phoneNumberId } = await signup.wait();
        const attached = await api<{ webhookReady?: boolean }>('/channels/meta/embedded/complete', {
          method: 'POST',
          body: JSON.stringify({
            state: result.state,
            code: response.authResponse.code,
            wabaId,
            phoneNumberId,
            name: 'WhatsApp Business',
          }),
        });
        onSaved();
        if (attached.webhookReady === false)
          setError(
            t(
              'تم حفظ التفويض، لكن اشتراك Webhook يحتاج مراجعة من مسؤول المنصة. افحص اتصال القناة قبل تشغيل البوت.',
              'Authorization saved, but the webhook subscription needs administrator review. Verify the channel before running the bot.',
            ),
          );
      } finally {
        signup.dispose();
        window.removeEventListener('message', listener);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const kind = selectedKind || 'whatsapp';
  const enabled =
    config.data.configured && (config.data.connectEnabled ?? config.data.externalEnabled);
  const signupConfigured = Boolean(config.data.embeddedConfigId || config.data.catalogConfigured);
  const canAuthorizeWhatsApp = !config.loading && !config.error && enabled &&
    Boolean(withCatalog ? config.data.catalogConfigured : config.data.embeddedConfigId);
  return (
    <div className="stack">
      {kind === 'whatsapp' ? (
        <div className={styles.setup}>
          <section className={styles.wizard}>
              <div className={styles.wizardIntro}>
                <h2>{t('ربط WhatsApp Business', 'Connect WhatsApp Business')}</h2>
                <p>{t('اختر الطريقة المناسبة لرقمك. سنرشدك خلال التفويض الرسمي لدى Meta دون الحاجة إلى نسخ مفاتيح API.', 'Choose the method for your number. We guide you through official Meta authorization without copying API keys.')}</p>
              </div>
              {config.loading ? (
                <p role="status">{t('جارٍ فحص جاهزية الربط…', 'Checking connection readiness…')}</p>
              ) : (!enabled || !signupConfigured || config.error) ? (
                <div className={styles.setupNotice} role="status">
                  <strong>{t('استعرض طرق الربط الآن', 'Explore connection methods now')}</strong>
                  <small>{t('يمكنك اختيار طريقة الربط ومراجعة الخطوات. التفويض الرسمي غير متاح حتى يكتمل إعداد Meta للمنصة. لن تتأثر قنواتك المتصلة.', 'Choose a connection method and review the steps. Official authorization is unavailable until platform Meta setup is complete. Existing channels are unaffected.')}</small>
                </div>
              ) : null}
              <ol className={styles.progress}>
                {[t('نوع الرقم', 'Number type'), t('الكتالوج', 'Catalog'), t('تفويض Meta', 'Meta authorization')].map((label, index) =>
                  <li key={label} aria-current={step === index + 1 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}
              </ol>
              {step === 1 && <fieldset className={styles.options}>
                <legend>{t('أي رقم تريد ربطه؟', 'Which number are you connecting?')}</legend>
                <label className={styles.modeCard}>
                  <input type="radio" name="whatsappMode" disabled={busy} checked={whatsappMode === 'coexistence'} onChange={() => setWhatsappMode('coexistence')} />
                  <span className={styles.modeCopy}>
                    <strong>{t('استخدم رقم واتساب بيزنس الحالي', 'Keep your existing WhatsApp Business number')}</strong>
                    <span className={styles.modeTag}>Coexistence</span>
                    <small>{t('استمر في استخدام التطبيق على الموبايل، واربط نفس الرقم بالمنصة للأتمتة وصندوق الوارد إذا كان مؤهلًا لدى Meta.', 'Keep using the mobile app and connect the same number for automation and the inbox if Meta confirms eligibility.')}</small>
                    <small>{t('لا تحذف حسابك أو تطبيقك قبل التحقق من أهلية الربط.', 'Do not delete your account or app before checking eligibility.')}</small>
                  </span>
                </label>
                <label className={styles.modeCard}>
                  <input type="radio" name="whatsappMode" disabled={busy} checked={whatsappMode === 'cloud'} onChange={() => setWhatsappMode('cloud')} />
                  <span className={styles.modeCopy}>
                    <strong>{t('اربط رقمًا مخصصًا للمنصة', 'Connect a dedicated business number')}</strong>
                    <span className={styles.modeTag}>Cloud API</span>
                    <small>{t('أدر الرسائل والبوت وفريق العمل عبر المنصة. اختر رقمًا مؤهلًا وأكمل التحقق الرسمي لدى Meta.', 'Manage messaging, bots and your team from the platform. Choose an eligible number and complete Meta verification.')}</small>
                  </span>
                </label>
              </fieldset>}
              {step === 2 && <fieldset className={styles.options}>
                <legend>{t('هل تريد ربط كتالوج المنتجات؟', 'Do you want to connect a product catalog?')}</legend>
                <label><input type="radio" name="whatsappCatalog" disabled={busy || (!config.data.embeddedConfigId && !!config.data.catalogConfigured)} checked={!withCatalog} onChange={() => setWithCatalog(false)} />
                  {t('ربط الرسائل فقط', 'Connect messaging only')}</label>
                <label><input type="radio" name="whatsappCatalog" disabled={busy || !config.data.catalogConfigured} checked={withCatalog} onChange={() => setWithCatalog(true)} />
                  {t('ربط الرسائل والكتالوج', 'Connect messaging and catalog')}</label>
                {!config.data.catalogConfigured && <small>{t('ربط الكتالوج يحتاج إعدادًا من مسؤول المنصة.', 'Catalog onboarding requires platform setup.')}</small>}
              </fieldset>}
              {step === 3 && <div className={styles.review}>
                <h3>{t('راجع اختيارك قبل التفويض', 'Review your choice before authorization')}</h3>
                <p><strong>{whatsappMode === 'coexistence' ? 'Coexistence' : 'Cloud API'}</strong> · {withCatalog ? t('الرسائل والكتالوج', 'Messaging and catalog') : t('الرسائل فقط', 'Messaging only')}</p>
                <p>{t('سجّل الدخول في نافذة Meta الرسمية، واختر النشاط والرقم، ثم ارجع للتحقق من حالة القناة. إتمام التفويض لا يعني نجاح إرسال رسالة فعلية.', 'Sign in to the official Meta window, select your business and number, then return to check channel health. Authorization alone does not confirm live message delivery.')}</p>
              </div>}
              <div className={styles.wizardActions}>
                {step > 1 && <button className="btn" disabled={busy} type="button" onClick={() => setStep(step - 1)}>{t('رجوع', 'Back')}</button>}
                <button className="btn btn-primary" type="button" disabled={busy || (step === 3 && !canAuthorizeWhatsApp)}
                  onClick={() => {
                    if (step === 1 && !config.data.embeddedConfigId && config.data.catalogConfigured) setWithCatalog(true);
                    if (step < 3) setStep(step + 1);
                    else if (canAuthorizeWhatsApp) void connect('whatsapp', withCatalog);
                  }}>
                  {busy ? t('جارٍ الربط…', 'Connecting…') : step < 3 ? t('متابعة', 'Continue') : canAuthorizeWhatsApp ? t('المتابعة مع Meta', 'Continue with Meta') : t('التفويض غير متاح حاليًا', 'Authorization not available yet')}
                </button>
              </div>
            </section>
          {enabled && <section className={styles.manual}>
            <button type="button" className="btn" aria-expanded={existingOpen} aria-controls="whatsapp-api-form"
              disabled={busy} onClick={() => {
                setExistingOpen(!existingOpen);
                if (existingOpen) setExistingToken('');
              }}>
              {t('خيارات متقدمة — الربط اليدوي باستخدام API', 'Advanced options — manual API connection')}
            </button>
              {existingOpen && (
                <form id="whatsapp-api-form" className="stack" onSubmit={attachExisting}>
                  <h3>
                    {t('معرّف حساب الأعمال + رمز الوصول', 'Business Account ID + Access Token')}
                  </h3>
                  <label className="field">
                    {t('معرّف حساب WhatsApp Business', 'WhatsApp Business Account ID')}
                    <input
                      required
                      pattern="[0-9]+"
                      inputMode="numeric"
                      value={existingWabaId}
                      onChange={(e) => setExistingWabaId(e.target.value)}
                      dir="ltr"
                      autoComplete="off"
                      disabled={busy}
                    />
                  </label>
                  <label className="field">
                    {t('رمز الوصول', 'Access Token')}
                    <input
                      required
                      minLength={10}
                      maxLength={4000}
                      type="password"
                      value={existingToken}
                      onChange={(e) => setExistingToken(e.target.value)}
                      dir="ltr"
                      autoComplete="off"
                      disabled={busy}
                    />
                  </label>
                  {config.data.webhookUrl && (
                    <div>
                      <strong>{t('عنوان استقبال Webhook', 'WEBHOOK CALLBACK URL')}</strong>
                      <p className={styles.callback} dir="ltr">
                        {config.data.webhookUrl}
                      </p>
                    </div>
                  )}
                  <details>
                    <DisclosureSummary>
                      {t('إعداد التحقق من Webhook', 'Webhook verification setup')}
                    </DisclosureSummary>
                    <p>
                      {t(
                        'يدير مسؤول المنصة رمز التحقق وعناوين السياسات الخاصة بتطبيق Meta. لا يتم كشف أسرار التطبيق في مساحة العمل.',
                        'The platform administrator manages the verification token and Meta app policy URLs. App secrets are not exposed in the workspace.',
                      )}
                    </p>
                  </details>
                  <button className="btn btn-primary" disabled={busy || !enabled}>
                    {busy ? t('جارٍ الربط…', 'Connecting…') : t('ربط', 'Connect')}
                  </button>
                </form>
              )}
          </section>}
        </div>
      ) : (
        <div className={styles.socialSetup}>
          <section className={`card stack ${styles.meta}`}>
            <h2>
              {kind === 'instagram'
                ? t('اربط حساب Instagram الخاص بك', 'Connect Your Instagram Account')
                : t('اربط حساب Facebook الخاص بك', 'Connect Your Facebook Account')}
            </h2>
            <p>
              {t(
                'اربط حسابك لإدارة المحادثات وأتمتة الردود وتنمية جمهورك.',
                'Connect your account to manage conversations, automate replies and grow your audience.',
              )}
            </p>
            <button
              className="btn btn-primary"
              disabled={busy || !enabled}
              onClick={() => connect(kind)}
            >
              {t('تسجيل الدخول باستخدام Facebook', 'Login with Facebook')}
            </button>
          </section>
          <aside className="card stack">
            <h2>
              {kind === 'instagram'
                ? t('لماذا تربط Instagram؟', 'Why connect Instagram?')
                : t('لماذا تربط Facebook؟', 'Why connect Facebook?')}
            </h2>
            <ul>
              <li>
                {kind === 'instagram'
                  ? t('إدارة الرسائل المباشرة', 'Manage direct messages')
                  : t('إدارة رسائل صفحاتك', 'Manage Page messages')}
              </li>
              <li>{t('أتمتة الردود', 'Automate replies')}</li>
              <li>{t('الرد من صندوق الوارد المشترك', 'Reply from the shared inbox')}</li>
            </ul>
          </aside>
        </div>
      )}
      {kind !== 'whatsapp' && !config.loading && !enabled && (
        <div className="notice">
          <strong>{t('بانتظار تجهيز الربط', 'Connection setup pending')}</strong>
          <p>
            {t(
              'تواصل مع مسؤول المنصة لتجهيز الربط الرسمي.',
              'Contact the platform administrator to prepare the official connection.',
            )}
          </p>
          <details>
            <DisclosureSummary>{t('تفاصيل للمسؤول', 'Administrator details')}</DisclosureSummary>
            {t(
              'يلزم إعداد تطبيق Meta وإعداد التسجيل المضمّن وعنوان الرجوع والصلاحيات المعتمدة.',
              'Configure the Meta app, embedded signup, redirect URI and approved permissions.',
            )}
          </details>
        </div>
      )}
      {(error || config.error || connections.error) && (
        <p role="alert" className="notice error">
          {error || config.error || connections.error}
        </p>
      )}
      {connections.data
        .filter((c) => c.kind === kind)
        .map((c) => (
          <section key={c.id} className="card stack">
            <h3>{t('اختر الحساب المصرح به', 'Choose an authorized account')}</h3>
            {!c.assets.length && (
              <p>
                {t(
                  'لم يمنح Meta أي حسابات متاحة. أعد التفويض لاختيار الحساب.',
                  'Meta returned no eligible accounts. Authorize again to select an account.',
                )}
              </p>
            )}
            {c.assets.map((a) => (
              <button
                className="btn"
                key={a.id}
                disabled={busy || (c.kind === 'instagram' && !a.instagram)}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/channels/meta/connections/${c.id}/attach`, {
                      method: 'POST',
                      body: JSON.stringify({ pageId: a.id }),
                    });
                    onSaved();
                    await connections.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {a.name}
                {a.instagram ? ' · @' + a.instagram.username : ''}
              </button>
            ))}
          </section>
        ))}
    </div>
  );
}
