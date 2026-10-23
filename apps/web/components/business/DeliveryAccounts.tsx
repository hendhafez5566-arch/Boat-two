'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
export type DeliveryAccount = {
  id: string;
  name: string;
  provider: string;
  interval_ms: number;
  daily_limit: number;
  daily_used: number;
  usage_date: string;
  enabled: boolean;
};
export function DeliveryAccounts({ changed }: { changed: () => void }) {
  const { t } = useLocale();
  const accounts = useData<DeliveryAccount[]>('/delivery/policies/accounts', []),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save(form: HTMLFormElement, id?: string) {
    const f = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await api('/delivery/policies/accounts' + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          provider: f.get('provider'),
          intervalMs: Number(f.get('interval')),
          dailyLimit: Number(f.get('daily')),
          enabled: f.get('enabled') === 'on',
        }),
      });
      await accounts.reload();
      changed();
      if (!id) form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function fields(account?: DeliveryAccount) {
    return (
      <>
        <label className="field">
          {t('اسم مجموعة حساب المزود', 'Provider account group name')}
          <input name="name" required maxLength={100} defaultValue={account?.name} />
        </label>
        <label className="field">
          {t('المزود', 'Provider')}
          <select
            name="provider"
            defaultValue={account?.provider || 'meta'}
            onChange={(e) => {
              if (account) e.target.value = account.provider;
            }}
          >
            <option value="meta">Meta</option>
            <option value="web">{t('دردشة الموقع', 'Website')}</option>
          </select>
        </label>
        <label className="field">
          {t('الفاصل المشترك بالمللي ثانية', 'Shared interval in milliseconds')}
          <input
            name="interval"
            required
            type="number"
            min={account?.provider === 'web' ? 100 : 1000}
            max={3600000}
            defaultValue={account?.interval_ms || 1000}
          />
        </label>
        <label className="field">
          {t('محاولات يومية UTC، ‎-1 دون حد', 'Daily UTC attempts, -1 unlimited')}
          <input
            name="daily"
            required
            type="number"
            min={-1}
            max={100000000}
            defaultValue={account?.daily_limit ?? 10000}
          />
        </label>
        <label>
          <input name="enabled" type="checkbox" defaultChecked={account?.enabled ?? true} />{' '}
          {t('مفعّل', 'Enabled')}
        </label>
        <button className="btn" disabled={busy}>
          {t('حفظ المجموعة', 'Save group')}
        </button>
      </>
    );
  }
  return (
    <section className="card stack">
      <h2>
        {t(
          'حدود مشتركة بين القنوات والحملات',
          'Shared account limits across channels and campaigns',
        )}
      </h2>
      <p>
        {t(
          'اجمع القنوات التي تشترك في حساب مزود واحد، ثم اربطها أدناه. تُحجز المحاولات ذريًا عبر العمال، وتبقى المحاولة الغامضة محتسبة. هذه حدود تشغيل يحددها المسؤول وليست اكتشافًا تلقائيًا لحصص المزود.',
          'Group channels sharing a provider account, then assign them below. Attempts reserve atomically across workers; unknown outcomes remain counted. These are operator-configured controls, not automatic discovery of provider quotas.',
        )}
      </p>
      {(error || accounts.error) && <p className="notice error">{error || accounts.error}</p>}
      <details>
        <summary>{t('مجموعة جديدة', 'New account group')}</summary>
        <form
          className="form-grid p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget);
          }}
        >
          {fields()}
        </form>
      </details>
      {accounts.data.map((account) => (
        <details key={account.id}>
          <summary>
            {account.name} · {account.daily_used}/
            {account.daily_limit === -1 ? '∞' : account.daily_limit} · {account.usage_date}
          </summary>
          <form
            className="form-grid p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save(e.currentTarget, account.id);
            }}
          >
            {fields(account)}
          </form>
        </details>
      ))}
    </section>
  );
}
