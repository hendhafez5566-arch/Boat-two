'use client';
import { useState } from 'react';
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
export default function MetaConnect({ onSaved }: { onSaved: () => void }) {
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
            script.onerror = () => reject(new Error('Meta SDK failed to load'));
            document.head.appendChild(script);
          });
        if (!win.FB) throw new Error('Meta SDK unavailable');
        win.FB.init({ appId: config.data.appId, version: 'v21.0', xfbml: false });
        const response = await new Promise<{ authResponse?: { code?: string } }>((resolve) =>
          win.FB!.login(resolve, {
            config_id: config.data.embeddedConfigId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: '3' },
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
      {!config.data.configured && (
        <p className="notice">
          {t(
            'يلزم إعداد تطبيق Meta ومعرّف Embedded Signup وRedirect URI والصلاحيات المعتمدة بواسطة المشغّل.',
            'The operator must configure the Meta app, Embedded Signup configuration, redirect URI and approved permissions.',
          )}
        </p>
      )}
      {error && <p className="notice error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {['facebook', 'instagram', 'whatsapp'].map((kind) => (
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
