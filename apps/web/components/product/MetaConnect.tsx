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
  const [embeddedOpen, setEmbeddedOpen] = useState(false);
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
  return (
    <div className="stack">
      {kind === 'whatsapp' ? (
        <div className={styles.methods}>
          <section className={styles.method}>
            <header data-variant="embedded">
              <h2>{t('الربط المضمّن (بضغطة واحدة)', 'Embedded Onboarding (One Click)')}</h2>
              <span>{t('موصى به', 'Recommended')}</span>
              <p>
                {t(
                  'اربط حسابك عبر Meta في رحلة واحدة دون رموز يدوية.',
                  'Connect through Meta in one guided flow—no manual tokens.',
                )}
              </p>
            </header>
            <div className={styles.body}>
              <ul>
                <li>{t('اتصال آمن بضغطة واحدة', 'One-click secure connection')}</li>
                <li>{t('WhatsApp Cloud API الرسمي', 'Official WhatsApp Cloud API')}</li>
                <li>{t('مزامنة أرقام الهاتف تلقائيًا', 'Automatic number sync')}</li>
              </ul>
              {!embeddedOpen ? (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => setEmbeddedOpen(true)}
                >
                  {t('الربط باستخدام التسجيل المضمّن', 'Connect with Embed Onboarding')} →
                </button>
              ) : (
                <div className={styles.choices}>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !enabled || !config.data.catalogConfigured}
                    onClick={() => connect('whatsapp', true)}
                  >
                    {t('الربط مع الكتالوج', 'Connect With Catalog')}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !enabled || !config.data.embeddedConfigId}
                    onClick={() => connect('whatsapp', false)}
                  >
                    {t('الربط بدون الكتالوج', 'Connect Without Catalog')}
                  </button>
                  {!config.loading && !config.data.catalogConfigured && (
                    <p className="muted">
                      {t(
                        'يحتاج مسار الكتالوج إلى إعداد تسجيل Meta معتمد من مسؤول المنصة.',
                        'Catalog connection requires an approved Meta signup configuration from the platform administrator.',
                      )}
                    </p>
                  )}
                </div>
              )}
              <details>
                <DisclosureSummary>
                  {t('خيارات الرقم المتقدمة', 'Advanced number options')}
                </DisclosureSummary>
                <label>
                  <input
                    type="radio"
                    name="whatsappMode"
                    checked={whatsappMode === 'coexistence'}
                    onChange={() => setWhatsappMode('coexistence')}
                  />
                  {t('رقم تطبيق WhatsApp Business', 'WhatsApp Business app number')}
                </label>
                <label>
                  <input
                    type="radio"
                    name="whatsappMode"
                    checked={whatsappMode === 'cloud'}
                    onChange={() => setWhatsappMode('cloud')}
                  />
                  {t('رقم WhatsApp Cloud', 'WhatsApp Cloud number')}
                </label>
              </details>
            </div>
          </section>
          <section className={styles.method}>
            <header data-variant="api">
              <h2>{t('إنشاء اتصال API خاص بك', 'Create Your Own API Connection')}</h2>
              <span>{t('بديل', 'Alternative')}</span>
              <p>
                {t(
                  'اربط معرّف حساب الأعمال ورمز الوصول الدائم.',
                  'Connect with Business Account ID and permanent access token.',
                )}
              </p>
            </header>
            <div className={styles.body}>
              <ul>
                <li>{t('رمز الوصول الخاص بك', 'Your own access token')}</li>
                <li>Cloud API</li>
                <li>{t('مرونة كاملة', 'Full flexibility')}</li>
              </ul>
              <button
                className="btn"
                disabled={busy}
                aria-expanded={existingOpen}
                aria-controls="whatsapp-api-form"
                onClick={() => setExistingOpen(!existingOpen)}
              >
                {t('الربط باستخدام API', 'Connect with API')} →
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
            </div>
          </section>
        </div>
      ) : (
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
          <ul>
            <li>{t('إدارة الصفحات والوارد', 'Manage Pages & Inbox')}</li>
            <li>{t('بوت للمحادثات', 'Messaging Chatbot')}</li>
            <li>{t('الأتمتة والنمو', 'Automation & Growth')}</li>
            <li>{t('آمن وموثوق', 'Secure & Reliable')}</li>
          </ul>
          <button
            className="btn btn-primary"
            disabled={busy || !enabled}
            onClick={() => connect(kind)}
          >
            {t('تسجيل الدخول باستخدام Facebook', 'Login with Facebook')}
          </button>
        </section>
      )}
      {!config.loading && !enabled && (
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
