'use client';
import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useLocale } from './locale';
import { useData } from '../business/useData';
type SDK = {
  init: (args: Record<string, unknown>) => void;
  login: (
    cb: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};
export default function MetaConnect({ onSaved, selectedKind }: { onSaved: () => void; selectedKind?: string }) {
  const { t } = useLocale();
  const config = useData<{
    configured: boolean;
    externalEnabled: boolean;
    appId: string | null;
    embeddedConfigId: string | null;
    redirectUri: string;
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
  const [whatsappMode, setWhatsappMode] = useState('cloud');
  const [existingName, setExistingName] = useState('WhatsApp Business');
  const [existingPhoneNumberId, setExistingPhoneNumberId] = useState('');
  const [existingWabaId, setExistingWabaId] = useState('');
  const [existingToken, setExistingToken] = useState('');
  const [existingOpen, setExistingOpen] = useState(false);
  async function attachExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!/^\\d+$/.test(existingPhoneNumberId.trim()) || !/^\\d+$/.test(existingWabaId.trim())) {
      setError(t('معرّفا رقم الهاتف وحساب واتساب يجب أن يكونا أرقامًا صحيحة.', 'Phone Number ID and WABA ID must be numeric.'));
      return;
    }
    setBusy(true);
    try {
      await api('/channels', {
        method: 'POST',
        body: JSON.stringify({
          type: 'whatsapp',
          name: existingName.trim() || 'WhatsApp Business',
          credentials: {
            phoneNumberId: existingPhoneNumberId.trim(),
            wabaId: existingWabaId.trim(),
            accessToken: existingToken.trim(),
          },
        }),
      });
      setExistingToken('');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(kind: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ state: string; authorizeUrl: string }>('/channels/meta/start', {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      if (kind !== 'whatsapp') {
        window.location.assign(result.authorizeUrl);
        return;
      }
      let wabaId = '',
        phoneNumberId = '';
      const listener = (event: MessageEvent) => {
        if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin))
          return;
        try {
          const value = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (value.type === 'WA_EMBEDDED_SIGNUP' && value.event === 'FINISH') {
            wabaId = value.data.waba_id;
            phoneNumberId = value.data.phone_number_id;
          }
        } catch {
          /* The action helper displays the error. */
        }
      };
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
            config_id: config.data.embeddedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: '3', ...(whatsappMode === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {}) },
          }),
        );
        if (!response.authResponse?.code)
          throw new Error(
            t(
              'أُلغي الربط أو لم يُمنح كود.',
              'Connection canceled or no authorization code returned.',
            ),
          );
        if (!wabaId || !phoneNumberId)
          throw new Error(
            t(
              'لم تكتمل بيانات Embedded Signup. ابدأ من جديد.',
              'Embedded Signup did not return account/phone IDs. Start again.',
            ),
          );
        await api('/channels/meta/embedded/complete', {
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
      } finally {
        window.removeEventListener('message', listener);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack mb-6">
      <div>
        <h2>{t('ربط رسمي مع Meta', 'Official Meta connection')}</h2>
        <p className="muted">
          {t(
            'اختر قناة واتبع تفويض المزود. لا تعني إضافة بيانات الربط وجود موافقة خارجية.',
            'Choose a channel and follow provider authorization. Stored connection data does not establish external approval.',
          )}
        </p>
      </div>
      {(!selectedKind || selectedKind === 'whatsapp') && <fieldset className="stack"><legend>{t('كيف تريد استخدام WhatsApp؟', 'How will you use WhatsApp?')}</legend>
        <label><input type="radio" name="whatsapp-mode" checked={whatsappMode === 'cloud'} onChange={() => setWhatsappMode('cloud')} /> {t('رقم WhatsApp Cloud', 'WhatsApp Cloud number')}</label>
        <label><input type="radio" name="whatsapp-mode" checked={whatsappMode === 'coexistence'} onChange={() => setWhatsappMode('coexistence')} /> {t('رقم موجود في تطبيق WhatsApp Business — تعايش', 'Existing WhatsApp Business app number — coexistence')}</label>
        <p className="muted">{t('تتحقق Meta من أهلية الرقم والتعايش أثناء التفويض. اختيار هذا المسار لا يؤكد الأهلية ولا ينقل الرقم تلقائيًا.', 'Meta checks number and coexistence eligibility during authorization. Selecting this path does not confirm eligibility or automatically migrate the number.')}</p>
      </fieldset>}
      {(!selectedKind || selectedKind === 'whatsapp') && (
        <section className="card stack">
          <button type="button" className="btn" aria-expanded={existingOpen} onClick={() => setExistingOpen(!existingOpen)}>
            {t('رقمي متصل بالفعل بـMeta — اربطه بالمنصة دون إعادة التسجيل', 'Already connected to Meta — attach without onboarding again')}
          </button>
          {existingOpen && (
            <form className="stack" onSubmit={attachExisting}>
              <p className="muted">{t(
                'استخدم هذا الخيار فقط إذا اكتمل ربط الرقم رسميًا داخل Meta. لن ننقل الرقم أو نسجله مجددًا. يلزم رمز وصول مصرح له بهذا الرقم تحديدًا. حفظ القناة لا يفعّل Webhooks أو إرسال الرسائل تلقائيًا.',
                'Use only for a number already authorized in Meta. This does not migrate or register your phone again. Use an access token authorized for this exact number. Saving the channel does not automatically activate webhooks or outbound messaging.',
              )}</p>
              <label className="field">{t('اسم القناة', 'Channel name')}
                <input value={existingName} maxLength={80} onChange={(e) => setExistingName(e.target.value)} required autoComplete="off"/>
              </label>
              <label className="field">{t('Phone Number ID من Meta', 'Meta Phone Number ID')}
                <input value={existingPhoneNumberId} onChange={(e) => setExistingPhoneNumberId(e.target.value)} required pattern="[0-9]+" inputMode="numeric" dir="ltr" autoComplete="off"/>
              </label>
              <label className="field">{t('WhatsApp Business Account ID (WABA ID)', 'WhatsApp Business Account ID (WABA ID)')}
                <input value={existingWabaId} onChange={(e) => setExistingWabaId(e.target.value)} required pattern="[0-9]+" inputMode="numeric" dir="ltr" autoComplete="off"/>
              </label>
              <label className="field">{t('Access Token بصلاحيات WhatsApp', 'WhatsApp-authorized Access Token')}
                <input type="password" value={existingToken} onChange={(e) => setExistingToken(e.target.value)} required minLength={10} dir="ltr" autoComplete="off"/>
              </label>
              <p className="muted">{t(
                'أدخل الرمز هنا داخل حسابك فقط، ولا ترسله في المحادثات أو الصور. بعد الحفظ اضغط فحص الاتصال بالمزود، ثم أكمل ضبط الـWebhook.',
                'Enter the token only inside your account, never in chats or screenshots. After saving, verify the provider connection and configure your webhook.',
              )}</p>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? t('جارٍ ربط البيانات…', 'Attaching…') : t('حفظ الربط الحالي دون إعادة التسجيل', 'Attach existing Meta number')}
              </button>
            </form>
          )}
        </section>
      )}
      {(!config.data.configured || !config.data.externalEnabled) && (
        <div className="notice"><strong>{t('بانتظار تجهيز الربط','Connection setup pending')}</strong><p>{t('تواصل مع مسؤول المنصة لتجهيز الربط الرسمي. يمكنك استخدام قناة الموقع الآن دون حساب خارجي.','Contact the platform administrator to prepare the official connection. Website chat is available without an external account.')}</p><details><summary>{t('تفاصيل للمسؤول','Administrator details')}</summary>{t(
            'يلزم إعداد تطبيق Meta ومعرّف Embedded Signup وRedirect URI والصلاحيات المعتمدة بواسطة المشغّل.',
            'The operator must configure the Meta app, Embedded Signup configuration, redirect URI and approved permissions.',
          )}
        </details></div>
      )}
      {(error || config.error || connections.error) && (
        <p role="alert" className="notice error">
          {error || config.error || connections.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {['facebook', 'instagram', 'whatsapp'].filter(kind => !selectedKind || selectedKind === kind).map((kind) => (
          <button
            key={kind}
            className="btn"
            disabled={
              busy ||
              !config.data.configured ||
              !config.data.externalEnabled ||
              (kind === 'whatsapp' && !config.data.embeddedConfigId)
            }
            onClick={() => connect(kind)}
          >
            {kind === 'whatsapp'
              ? 'WhatsApp Embedded Signup'
              : kind === 'facebook'
                ? 'Facebook Login'
                : 'Instagram via Facebook Login'}
          </button>
        ))}
      </div>
      {connections.data.map((c) => (
        <div key={c.id}>
          <h3 className="font-bold">
            {t('اختر الحساب المصرح به', 'Choose an authorized account')} · {c.kind}
          </h3>
          {c.assets.map((a) => (
            <button
              className="btn m-1"
              key={a.id}
              disabled={busy || (c.kind === 'instagram' && !a.instagram)}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/channels/meta/connections/${c.id}/attach`, {
                    method: 'POST',
                    body: JSON.stringify({ pageId: a.id }),
                  });
                  onSaved();
                  connections.reload();
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
        </div>
      ))}
    </section>
  );
}
