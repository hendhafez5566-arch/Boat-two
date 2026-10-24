'use client';
import { statusLabel } from '../../../components/product/status';
import { DomainTransfers } from '../../../components/business/DomainTransfers';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Brand = { name: string; logo_url: string | null; primary_color: string; widget_title: string };
export default function Branding() {
  const { t } = useLocale();
  const settings = useData<{ enabled: boolean; branding: Brand | null }>('/workspace/branding', {
    enabled: false,
    branding: null,
  });
  const domains = useData<{
    domains: {
      id: string;
      hostname: string;
      verification_token: string;
      status: string;
      hosting_enabled: boolean;
      hosting_error: string | null;
    }[];
  }>('/workspace/branding/domains', { domains: [] });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await settings.reload();
      await domains.reload();
      setMessage(
        t(
          'حُفظ التغيير. أعد تحميل الصفحة لتطبيق الهوية على التنقل.',
          'Change saved. Reload the page to apply branding to navigation.',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <h1>{t('هوية الشركة والنطاقات', 'Company branding and domains')}</h1>
      {(error || settings.error || domains.error) && (
        <p className="notice error">{error || settings.error || domains.error}</p>
      )}
      {message && <p className="notice">{message}</p>}
      {settings.loading ? (
        <p>{t('جارٍ التحميل…', 'Loading…')}</p>
      ) : !settings.data.enabled ? (
        <p className="notice">
          {t(
            'التخصيص الكامل متاح للباقة التي تتضمن White Label.',
            'Full customization requires a plan with White Label.',
          )}
        </p>
      ) : (
        <form
          key={JSON.stringify(settings.data.branding)}
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              api('/workspace/branding', {
                method: 'PATCH',
                body: JSON.stringify({
                  name: f.get('name'),
                  logoUrl: f.get('logo') || null,
                  primaryColor: f.get('color'),
                  widgetTitle: f.get('title'),
                }),
              }),
            );
          }}
        >
          <label className="field">
            {t('اسم العلامة', 'Brand name')}
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={settings.data.branding?.name}
            />
          </label>
          <label className="field">
            {t('رابط الشعار HTTPS', 'HTTPS logo URL')}
            <input name="logo" type="url" defaultValue={settings.data.branding?.logo_url || ''} />
          </label>
          <label className="field">
            {t('اللون الأساسي', 'Primary color')}
            <input
              name="color"
              type="color"
              defaultValue={settings.data.branding?.primary_color || '#0f766e'}
            />
          </label>
          <label className="field">
            {t('عنوان نافذة العملاء', 'Customer widget title')}
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={settings.data.branding?.widget_title || 'Chat with us'}
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {t('حفظ الهوية', 'Save branding')}
          </button>
        </form>
      )}
      <section className="card stack">
        <h2>{t('التحقق من ملكية النطاق', 'Domain ownership verification')}</h2>
        <p className="notice">
          {t(
            'تحقق من TXT ثم اطلب الاستضافة. يلزم إعداد بوابة المشغّل وDNS وTLS. تنتهي صلاحية التحقق بعد 24 ساعة؛ يعاد فحص الملكية دوريًا عند تفعيل الخدمات الخارجية.',
            'Verify TXT, then request hosting. Operator ingress, DNS and TLS configuration are required. Ownership expires after 24 hours; periodic rechecks run when external services are enabled.',
          )}
        </p>
        <form
          className="form-actions"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              api('/workspace/branding/domains', {
                method: 'POST',
                body: JSON.stringify({ hostname: f.get('hostname') }),
              }),
            );
          }}
        >
          <input
            name="hostname"
            required
            placeholder="chat.example.com"
            aria-label={t('النطاق', 'Domain')}
          />
          <button className="btn" disabled={busy || !settings.data.enabled}>
            {t('إضافة نطاق', 'Add domain')}
          </button>
        </form>
        {!domains.data.domains.length && (
          <p>{t('لا توجد نطاقات مسجلة.', 'No registered domains.')}</p>
        )}
        {domains.data.domains.map((domain) => (
          <article key={domain.id} className="rounded border p-4 space-y-2">
            <strong>
              {domain.hostname} · {statusLabel(domain.status, t)}
            </strong>
            <p dir="ltr" className="break-all select-all">
              _boat-verification.{domain.hostname} TXT boat-verification={domain.verification_token}
            </p>
            {domain.hosting_error && (
              <p role="alert" className="notice error">
                {domain.hosting_error}
              </p>
            )}
            <p>
              {domain.hosting_enabled
                ? t(
                    'الاستضافة مطلوبة؛ شهادة TLS يديرها المشغّل.',
                    'Hosting requested; TLS is managed by the operator.',
                  )
                : t('استضافة النطاق متوقفة.', 'Domain hosting is off.')}
            </p>
            <div className="form-actions">
              <button
                className="btn"
                disabled={busy || (!domain.hosting_enabled && domain.status !== 'verified')}
                onClick={() =>
                  void run(() =>
                    api('/workspace/branding/domains/' + domain.id + '/hosting', {
                      method: 'PATCH',
                      body: JSON.stringify({ enabled: !domain.hosting_enabled }),
                    }),
                  )
                }
              >
                {domain.hosting_enabled
                  ? t('إيقاف الاستضافة', 'Disable hosting')
                  : t('طلب استضافة النطاق', 'Request domain hosting')}
              </button>
              <button
                className="btn"
                disabled={busy || domain.status === 'revoked'}
                onClick={() =>
                  void run(() =>
                    api('/workspace/branding/domains/' + domain.id + '/verify', { method: 'POST' }),
                  )
                }
              >
                {t('فحص TXT', 'Check TXT')}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    api('/workspace/branding/domains/' + domain.id + '/revoke', {
                      method: 'PATCH',
                    }),
                  )
                }
              >
                {t('إلغاء النطاق', 'Revoke domain')}
              </button>
            </div>
          </article>
        ))}
      </section>
      <DomainTransfers domains={domains.data.domains} onChanged={domains.reload} />
    </main>
  );
}
