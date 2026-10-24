'use client';
import { DeliveryAccounts, DeliveryAccount } from './DeliveryAccounts';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
export function DeliveryPolicies() {
  const { t } = useLocale();
  const data = useData<
    {
      id: string;
      name: string;
      type: string;
      interval_ms: number;
      marketing_enabled: boolean;
      account_id: string | null;
    }[]
  >('/delivery/policies', []);
  const accounts = useData<DeliveryAccount[]>('/delivery/policies/accounts', []);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <DeliveryAccounts changed={() => void accounts.reload()} />
      <section className="card stack">
        <h2>
          {t('سياسات القنوات ومعدل الإرسال المشترك', 'Channel policy and shared send pacing')}
        </h2>
        <p>
          {t(
            'فاصل الإرسال مشترك لكل الرسائل الخارجية وحملات الموقع على القناة عبر العمال؛ ردود دردشة الموقع المباشرة فورية. لا يمنح الاشتراك التسويقي إذنًا لتجاوز نافذة Meta. تفعيل السياسة لا يفعّل الإرسال الخارجي في البيئة.',
            'Intervals pace all external messages and website campaigns on each channel across workers. Direct website chat replies remain immediate. Marketing consent does not bypass Meta response windows. Enabling policy does not enable external delivery in this environment.',
          )}
        </p>
        {(error || data.error) && <p className="notice error">{error || data.error}</p>}
        {data.data.map((policy) => (
          <form
            key={policy.id}
            className="rounded border p-3 form-actions"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                await api('/delivery/policies/' + policy.id, {
                  method: 'PUT',
                  body: JSON.stringify({
                    intervalMs: Number(form.get('interval')),
                    marketingEnabled: form.get('marketing') === 'on',
                    accountId: form.get('account') || null,
                  }),
                });
                await data.reload();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <strong>
              {policy.name} · {policy.type}
            </strong>
            <label className="field">
              {t('الفاصل بالمللي ثانية', 'Interval in milliseconds')}
              <input
                name="interval"
                required
                type="number"
                min={policy.type === 'web' ? 100 : 1000}
                max={3600000}
                defaultValue={policy.interval_ms}
              />
            </label>
            <label>
              <input type="checkbox" name="marketing" defaultChecked={policy.marketing_enabled} />{' '}
              {t('السماح بالحملات ضمن سياسات المزود', 'Allow campaigns within provider policy')}
            </label>
            <label className="field">
              {t('مجموعة الحساب المشتركة', 'Shared account group')}
              <select name="account" defaultValue={policy.account_id || ''}>
                <option value="">{t('حدود القناة فقط', 'Channel limits only')}</option>
                {accounts.data
                  .filter(
                    (account) => account.provider === (policy.type === 'web' ? 'web' : 'meta'),
                  )
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="btn" disabled={busy}>
              {t('حفظ', 'Save')}
            </button>
          </form>
        ))}
      </section>
    </>
  );
}
