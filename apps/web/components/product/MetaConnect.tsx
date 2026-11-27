'use client';
import { NavIcon } from './NavIcon';
import ChannelLogo from './ChannelLogo';
import { DisclosureSummary } from './DisclosureSummary';
import { Dialog } from './ProductUI';
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
  const [withCatalog, setWithCatalog] = useState(false);
  const [existingWabaId, setExistingWabaId] = useState('');
  const [existingToken, setExistingToken] = useState('');
  const [existingOpen, setExistingOpen] = useState(false);
  const [manualError, setManualError] = useState('');
  const validManual = /^\d+$/.test(existingWabaId.trim()) && existingToken.trim().length >= 10 && !/\s/.test(existingToken.trim());
  function closeManual() {
    if (busy) return;
    setExistingOpen(false);
    setExistingWabaId('');
    setExistingToken('');
    setManualError('');
  }
  async function attachExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validManual) return;
    setError('');
    setManualError('');
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
      setExistingWabaId('');
      setExistingOpen(false);
      onSaved();
      if (result.accounts.some((a) => !a.webhookReady))
        setError(
          t(
            'تم حفظ الحساب، لكن الاتصال يحتاج مراجعة إعدادات Webhook.',
            'Account saved, but webhook setup needs review.',
          ),
        );
    } catch (e) {
      setManualError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(kind: string, withCatalog = false, whatsappMode: 'coexistence' | 'cloud' = 'cloud') {
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
  const selectedCatalog = withCatalog || (!config.data.embeddedConfigId && !!config.data.catalogConfigured);
  const canAuthorizeWhatsApp = !config.loading && !config.error && enabled &&
    Boolean(selectedCatalog ? config.data.catalogConfigured : config.data.embeddedConfigId);
  return (
    <div className="stack">
      {kind === 'whatsapp' ? (
        <div className={styles.setup}>
          <section className={styles.connectPanel} aria-labelledby="whatsapp-methods-heading">
            <div className={styles.panelHeading}>
              <div>
                <h2 id="whatsapp-methods-heading">{t('اختر طريقة الربط', 'Choose a connection method')}</h2>
                <p>{t('رقمك الحالي أو رقم مخصص للمنصة، بتفويض رسمي من Meta.', 'Your current number or a dedicated number, with official Meta authorization.')}</p>
              </div>
              <span className={styles.secureLabel}>Meta · Official API</span>
            </div>
            <div className={styles.connectionCards}>
              {([
                { mode: 'coexistence', tag: 'Coexistence', ar: 'رقمي الحالي', en: 'My existing number',
                  description: t('استخدم نفس رقم WhatsApp Business على هاتفك وعلى المنصة، حسب أهلية Meta.', 'Use the same WhatsApp Business number on your phone and the platform, subject to Meta eligibility.'),
                  points: [t('استمر في الرد من الموبايل', 'Keep replying from your phone'), t('شغّل البوت وصندوق الوارد', 'Use bots and the shared inbox')] },
                { mode: 'cloud', tag: 'Cloud API', ar: 'رقم مخصص للمنصة', en: 'Dedicated number',
                  description: t('اربط رقمًا مؤهلًا لإدارة محادثات شركتك من المنصة.', 'Connect an eligible number to manage business conversations from the platform.'),
                  points: [t('إدارة الرسائل وفريق العمل', 'Manage messages and your team'), t('أتمتة الردود والحملات المسموح بها', 'Automate replies and eligible campaigns')] },
              ] as const).map((method) => (
                <article className={styles.connectCard} data-mode={method.mode} key={method.mode}>
                  <div className={styles.connectCardTop}>
                    <span className={styles.connectIcon} aria-hidden="true">
                      {method.mode === 'coexistence' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 19h2"/><path d="M9 12l2 2 4-4"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1A4.5 4.5 0 0 0 7 18Z"/><path d="M10 13l2-2 2 2m-2-2v5"/></svg>
                      )}
                    </span>
                    <span className={styles.connectTag}>{method.tag}</span>
                  </div>
                  <h3>{t(method.ar, method.en)}</h3>
                  <p>{method.description}</p>
                  <ul>{method.points.map((point) => <li key={point}>{point}</li>)}</ul>
                  <button type="button" className={styles.connectAction} disabled={busy || !canAuthorizeWhatsApp}
                    onClick={() => { if (canAuthorizeWhatsApp) void connect('whatsapp', selectedCatalog, method.mode); }}>
                    {busy ? t('جارٍ الربط…', 'Connecting…') : config.loading ? t('جارٍ التحقق…', 'Checking…') : canAuthorizeWhatsApp ? t('ربط باستخدام Meta', 'Connect with Meta') : t('بانتظار إعداد Meta', 'Awaiting Meta setup')} <span aria-hidden="true">{canAuthorizeWhatsApp ? '↗' : '—'}</span>
                  </button>
                </article>
              ))}
            </div>
            <div className={styles.connectFooter}>
              {config.data.catalogConfigured && (
                <label className={styles.catalogOption}>
                  <input type="checkbox" checked={selectedCatalog} disabled={busy || !config.data.embeddedConfigId} onChange={(e) => setWithCatalog(e.target.checked)} />
                  {t('ربط كتالوج المنتجات أيضًا', 'Also connect a product catalog')}
                </label>
              )}
              {config.loading ? <small role="status">{t('جارٍ التحقق من جاهزية Meta…', 'Checking Meta readiness…')}</small> :
                !canAuthorizeWhatsApp ? <div className={styles.setupInline} role="status"><strong>{t('الربط التلقائي غير جاهز', 'Automatic connection unavailable')}</strong><span>{t('يجب استكمال إعداد التسجيل المضمّن لدى Meta مرة واحدة للمنصة. لا يلزم إعادة ربط حساباتك الحالية.', 'Complete the platform’s one-time Meta Embedded Signup setup. Existing accounts do not need reconnection.')}</span></div> :
                <small>{t('لا تحذف رقمك الحالي قبل التحقق من أهلية الربط.', 'Do not delete your existing account before checking eligibility.')}</small>}
            </div>
          </section>
          {enabled && <div className={styles.manualEntry}>
            <span>{t('لديك إعداد API جاهز بالفعل؟', 'Already have API credentials?')}</span>
            <button type="button" className="btn" aria-haspopup="dialog" disabled={busy}
              onClick={() => {
                setExistingWabaId('');
                setExistingToken('');
                setManualError('');
                setExistingOpen(true);
              }}>
              {t('ربط يدوي متقدم', 'Advanced manual connection')}
            </button>
            <Dialog open={existingOpen} onClose={closeManual} title={t('ربط WhatsApp يدويًا', 'Connect WhatsApp manually')} className={styles.manualDialog}>
              {existingOpen && (
                <form id="whatsapp-api-form" autoComplete="off" className={styles.manualForm} onSubmit={attachExisting}>
                  <p>{t('استخدم بيانات تطبيق Meta فقط، وليس بريدك الإلكتروني أو كلمة مرور تسجيل الدخول.', 'Use Meta API credentials only, never your email or login password.')}</p>
                  <label className="field">
                    {t('معرّف حساب WhatsApp Business (WABA ID)', 'WhatsApp Business Account ID (WABA ID)')}
                    <input required pattern="[0-9]+" inputMode="numeric" name="meta-waba-id" type="text"
                      placeholder="123456789012345" value={existingWabaId}
                      onChange={(e) => setExistingWabaId(e.target.value)} dir="ltr" autoComplete="off" disabled={busy}/>
                    <small>{t('أرقام فقط، من إعدادات نشاطك التجاري لدى Meta.', 'Digits only, from your Meta business settings.')}</small>
                  </label>
                  <label className="field">
                    {t('رمز الوصول (Access Token)', 'Access Token')}
                    <input required minLength={10} maxLength={4000} name="meta-api-access-token" type="password"
                      placeholder={t('الصق رمز Meta هنا', 'Paste Meta token here')} value={existingToken}
                      onChange={(e) => setExistingToken(e.target.value)} dir="ltr" autoComplete="new-password" disabled={busy}/>
                  </label>
                  <details className={styles.manualDetails}>
                    <DisclosureSummary>{t('إعدادات Webhook للمطورين', 'Webhook settings for developers')}</DisclosureSummary>
                    {config.data.webhookUrl && <p className={styles.callback} dir="ltr">{config.data.webhookUrl}</p>}
                    <p>{t('يدير مسؤول المنصة رمز التحقق وأسرار تطبيق Meta. لا تظهر هنا.', 'The platform administrator manages the verification token and Meta app secrets. They are not exposed here.')}</p>
                  </details>
                  {manualError && <p className="notice error" role="alert">{manualError}</p>}
                  <div className={styles.manualActions}>
                    <button type="button" className="btn" disabled={busy} onClick={closeManual}>{t('إلغاء', 'Cancel')}</button>
                    <button type="submit" className="btn btn-primary" disabled={busy || !enabled || !validManual}>{busy ? t('جارٍ الربط…', 'Connecting…') : t('تحقق واربط', 'Verify and connect')}</button>
                  </div>
                </form>
              )}
            </Dialog>
          </div>}
        </div>
      ) : (
        <div className={styles.socialSetup}>
          <section className={`card stack ${styles.meta}`}>
            <div className={styles.socialTitle}><span className={styles.socialLogo} data-platform={kind}><ChannelLogo id={kind}/></span><div><h2>
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
            </div></div><button
              className="btn btn-primary"
              disabled={busy || !enabled}
              onClick={() => connect(kind)}
            >
              <ChannelLogo id="facebook"/>{t('تسجيل الدخول باستخدام Facebook', 'Login with Facebook')}
            </button>
          </section>
          <aside className="card stack">
            <h2>
              {kind === 'instagram'
                ? t('لماذا تربط Instagram؟', 'Why connect Instagram?')
                : t('لماذا تربط Facebook؟', 'Why connect Facebook?')}
            </h2>
            <ul>
              <li><NavIcon name="chat"/>
                {kind === 'instagram'
                  ? t('إدارة الرسائل المباشرة', 'Manage direct messages')
                  : t('إدارة رسائل صفحاتك', 'Manage Page messages')}
              </li>
              <li><NavIcon name="agents"/>{t('أتمتة الردود', 'Automate replies')}</li>
              <li><NavIcon name="inbox"/>{t('الرد من صندوق الوارد المشترك', 'Reply from the shared inbox')}</li>
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
