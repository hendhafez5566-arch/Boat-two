'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Transfer = {
  id: string;
  source_tenant_id: string;
  target_tenant_id: string;
  hostname: string;
  verification_token: string;
  status: string;
  expires_at: string;
};
export function DomainTransfers({
  domains,
  onChanged,
}: {
  domains: { id: string; hostname: string; status: string }[];
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useLocale(),
    ws = useData<{ role: string; tenant: { id: string } }>('/workspace', {
      role: '',
      tenant: { id: '' },
    });
  const transfers = useData<Transfer[]>(
    ws.data.role === 'owner' ? '/workspace/branding/domain-transfers' : null,
    [],
  );
  const [error, setError] = useState(''),
    [secret, setSecret] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ transferSecret?: string }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r.transferSecret) setSecret(r.transferSecret);
      await transfers.reload();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (ws.data.role !== 'owner') return null;
  return (
    <section className="card stack">
      <h2>{t('نقل النطاق واسترداده', 'Domain transfer and reclaim')}</h2>
      <p className="notice">
        {t(
          'النقل يتطلب موافقة المالك الحالي ورمزًا سريًا وفحص TXT جديدًا من الشركة المستقبلة خلال 24 ساعة. تتوقف الاستضافة حتى يطلبها المستقبِل مجددًا. النطاق الملغى يبقى محجوزًا لشركته؛ لا يوجد استيلاء تلقائي بناءً على DNS.',
          'Transfer requires current-owner approval, a secret and fresh TXT proof from the receiving workspace within 24 hours. Hosting stays off until requested again. Revoked domains remain reserved to their workspace; DNS alone never permits takeover.',
        )}
      </p>
      <p>
        {t('معرّف شركتك لاستقبال النطاقات: ', 'Your receiving workspace ID: ')}
        <code>{ws.data.tenant.id}</code>
      </p>
      {(error || transfers.error) && (
        <p role="alert" className="notice error">
          {error || transfers.error}
        </p>
      )}
      {secret && (
        <div className="notice">
          <p>
            {t(
              'احفظ الرمز وأرسله إلى مالك الشركة المستقبِلة عبر قناة آمنة. يظهر مرة واحدة.',
              'Save this secret and share it with the receiving owner through a secure channel. It appears once.',
            )}
          </p>
          <code className="select-all">{secret}</code>
          <button className="btn" onClick={() => setSecret('')}>
            {t('إخفاء', 'Hide')}
          </button>
        </div>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act('/workspace/branding/domain-transfers', {
            domainId: f.get('domain'),
            targetTenantId: f.get('target'),
          });
        }}
      >
        <label>
          {t('نطاق موثّق', 'Verified domain')}
          <select name="domain" required>
            <option value="">{t('اختر النطاق', 'Choose domain')}</option>
            {domains
              .filter((d) => d.status === 'verified')
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.hostname}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t('معرّف الشركة المستقبِلة', 'Receiving workspace ID')}
          <input name="target" required />
        </label>
        <button className="btn" disabled={busy}>
          {t('بدء النقل وإيقاف الاستضافة', 'Start transfer and stop hosting')}
        </button>
      </form>
      {domains
        .filter((d) => d.status === 'revoked')
        .map((d) => (
          <article key={d.id}>
            <strong>{d.hostname}</strong>
            <button
              className="btn"
              disabled={busy}
              onClick={() => act('/workspace/branding/domain-transfers/reclaim/' + d.id)}
            >
              {t('استرداد بنص TXT جديد', 'Reclaim with fresh TXT')}
            </button>
          </article>
        ))}
      <button className="btn" onClick={() => transfers.reload()}>
        {t('تحديث طلبات النقل', 'Refresh transfers')}
      </button>
      {transfers.data.map((r) => (
        <article key={r.id} className="card stack">
          <strong>
            {r.hostname} · {r.status}
          </strong>
          <p>
            {t('ينتهي في: ', 'Expires: ')}
            {new Date(r.expires_at).toLocaleString()}
          </p>
          {r.status === 'pending' &&
            (r.target_tenant_id === ws.data.tenant.id ? (
              <>
                <p dir="ltr" className="break-all">
                  _boat-verification.{r.hostname} TXT boat-verification={r.verification_token}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(`/workspace/branding/domain-transfers/${r.id}/accept`, {
                      transferSecret: f.get('secret'),
                    });
                  }}
                >
                  <label>
                    {t('رمز النقل من المالك الحالي', 'Transfer secret from current owner')}
                    <input
                      name="secret"
                      required
                      minLength={32}
                      maxLength={32}
                      autoComplete="off"
                    />
                  </label>
                  <button className="btn" disabled={busy}>
                    {t('فحص الملكية وقبول النقل', 'Verify ownership and accept')}
                  </button>
                </form>
              </>
            ) : (
              <button
                className="btn"
                disabled={busy}
                onClick={() => act(`/workspace/branding/domain-transfers/${r.id}/cancel`)}
              >
                {t('إلغاء طلب النقل', 'Cancel transfer')}
              </button>
            ))}
        </article>
      ))}
    </section>
  );
}
