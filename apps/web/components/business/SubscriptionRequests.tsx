'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Request = {
  id: string;
  kind: string;
  plan_code: string | null;
  status: string;
  error: string | null;
  created_at: string;
};
export function SubscriptionRequests({
  plans,
  linked,
}: {
  plans: { code: string; name: string; price_cents: number }[];
  linked: boolean;
}) {
  const { t } = useLocale();
  const jobs = useData<Request[]>('/billing/subscription-requests', []);
  const [kind, setKind] = useState('cancel'),
    [plan, setPlan] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const unresolved = jobs.data.some((j) => ['pending', 'ambiguous'].includes(j.status));
  async function act(body: unknown, path = '/billing/subscription-requests') {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setConfirmed(false);
      await jobs.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>{t('إدارة تغييرات الاشتراك', 'Subscription change requests')}</h2>
      <p className="notice">
        {t(
          'الإلغاء يسري في نهاية الفترة. تغيير الخطة لا ينشئ رسومًا نسبية فورية؛ السعر الجديد يسري على الفواتير التالية. الطلبات الغامضة تتطلب مراجعة المشغّل ولا تُعاد تلقائيًا.',
          'Cancellation takes effect at period end. Plan changes have no immediate proration; the new price applies to subsequent invoices. Uncertain requests require operator review and never retry automatically.',
        )}
      </p>
      {(error || jobs.error) && (
        <p className="notice error" role="alert">
          {error || jobs.error}
        </p>
      )}
      <label>
        {t('الإجراء', 'Action')}
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="cancel">{t('إلغاء التجديد', 'Cancel renewal')}</option>
          <option value="resume">{t('استئناف التجديد', 'Resume renewal')}</option>
          <option value="change_plan">{t('تغيير الخطة', 'Change plan')}</option>
        </select>
      </label>
      {kind === 'change_plan' && (
        <label>
          {t('الخطة الجديدة', 'New plan')}
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">{t('اختر خطة', 'Choose a plan')}</option>
            {plans
              .filter((p) => p.price_cents > 0)
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t('أؤكد طلب التغيير وفق السياسة الموضحة', 'I confirm this change under the policy above')}
      </label>
      <div className="form-actions">
        <button
          className="btn btn-primary"
          disabled={
            busy || !linked || !confirmed || unresolved || (kind === 'change_plan' && !plan)
          }
          onClick={() => act({ kind, ...(kind === 'change_plan' ? { planCode: plan } : {}) })}
        >
          {t('حفظ الطلب', 'Save request')}
        </button>
        <button className="btn" onClick={() => jobs.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      {jobs.data.map((j) => (
        <article key={j.id} className="card">
          <strong>
            {j.kind === 'cancel'
              ? t('إلغاء التجديد', 'Cancel renewal')
              : j.kind === 'resume'
                ? t('استئناف التجديد', 'Resume renewal')
                : t('تغيير الخطة', 'Change plan')}{' '}
            {j.plan_code}
          </strong>
          <p>
            {j.status} · {new Date(j.created_at).toLocaleString()}
          </p>
          {j.error && <p role="status">{j.error}</p>}
          {['pending', 'blocked'].includes(j.status) && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => act({}, `/billing/subscription-requests/${j.id}/withdraw`)}
            >
              {t('سحب الطلب', 'Withdraw request')}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
