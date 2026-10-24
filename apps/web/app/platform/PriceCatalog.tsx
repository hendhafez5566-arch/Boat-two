'use client';
import { useState } from 'react';
import { useLocale } from '../../components/product/locale';
type Price = {
  provider_id: string;
  plan_code: string;
  amount_cents: number;
  currency: string;
  interval: string;
  active: boolean;
};
export default function PriceCatalog({
  request,
  canWrite,
}: {
  request: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  canWrite: boolean;
}) {
  const { t } = useLocale();
  const [prices, setPrices] = useState<Price[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setPrices((await request('/prices')) as Price[]);
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>{t('كتالوج أسعار Stripe', 'Stripe price catalog')}</h2>
      <p className="notice">
        {t(
          'سجّل سعرًا موجودًا بعد مراجعته لدى Stripe. هذا الإجراء يحدّث الكتالوج المحلي فقط. الأسعار محفوظة للتاريخ ولا تُعدّل أو تُحذف؛ تقاعد السعر يمنع اشتراكات جديدة به.',
          'Register an existing price after verifying it in Stripe. This updates the local catalog only. Historical prices are immutable; retiring a price prevents new subscriptions using it.',
        )}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" disabled={busy} onClick={() => act(load)}>
        {t('تحميل الأسعار', 'Load prices')}
      </button>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(() =>
            request('/prices', {
              planCode: f.get('planCode'),
              priceId: f.get('priceId'),
              amountCents: Number(f.get('amount')),
              currency: f.get('currency'),
              interval: f.get('interval'),
              reason: f.get('reason'),
            }),
          );
        }}
      >
        <label>
          {t('رمز الخطة', 'Plan code')}
          <input name="planCode" required maxLength={50} />
        </label>
        <label>
          Stripe price ID
          <input name="priceId" required pattern="price_[A-Za-z0-9_]+" maxLength={255} />
        </label>
        <label>
          {t('المبلغ بوحدة العملة الصغرى', 'Amount in minor currency units')}
          <input name="amount" type="number" required min={1} max={1000000000} />
        </label>
        <label>
          {t('العملة', 'Currency')}
          <input name="currency" required pattern="[a-z]{3}" defaultValue="usd" />
        </label>
        <label>
          {t('دورة الفوترة', 'Billing interval')}
          <select name="interval">
            <option value="month">{t('شهري', 'Monthly')}</option>
            <option value="year">{t('سنوي', 'Yearly')}</option>
          </select>
        </label>
        <label>
          {t('سبب موثّق ودليل المراجعة', 'Reason and verification evidence')}
          <textarea name="reason" required minLength={10} maxLength={1000} />
        </label>
        <button className="btn btn-primary" disabled={busy || !canWrite}>
          {t('تسجيل سعر جديد', 'Register new price')}
        </button>
      </form>
      {prices.map((p) => (
        <article key={p.provider_id} className="card">
          <strong>
            {p.plan_code} · {p.provider_id}
          </strong>
          <p>
            {p.amount_cents} {p.currency} / {p.interval} ·{' '}
            {p.active ? t('متاح', 'Available') : t('متقاعد', 'Retired')}
          </p>
          {p.active && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = new FormData(e.currentTarget).get('reason');
                void act(() => request(`/prices/${p.provider_id}/retire`, { reason }));
              }}
            >
              <label>
                {t('سبب التقاعد', 'Retirement reason')}
                <input name="reason" required minLength={10} maxLength={1000} />
              </label>
              <button className="btn" disabled={busy || !canWrite}>
                {t('تقاعد السعر', 'Retire price')}
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
