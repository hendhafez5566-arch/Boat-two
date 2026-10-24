'use client';
import { statusLabel } from '../product/status';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
type Policy = {
  revision: number;
  monthly_calls?: number | null;
  monthly_tokens?: string | null;
  monthly_cost_microusd?: string | null;
};
type Usage = {
  baseline_calls: number;
  attempts: number;
  reserved_tokens: string;
  charged_tokens: string;
  reserved_cost_microusd: string;
  charged_cost_microusd: string;
  baseline_unpriced_calls: number;
};
type Reservation = {
  id: string;
  model: string;
  status: string;
  reserved_tokens: string;
  reserved_cost_microusd: string | null;
  actual_input_tokens: string | null;
  actual_output_tokens: string | null;
  actual_cost_microusd: string | null;
  created_at: string;
};
export function GenerationBudgetPanel() {
  const { t } = useLocale();
  const data = useData<{
    policy: Policy;
    usage: Usage | null;
    planLimit: number;
    reservations: Reservation[];
  }>('/agents/generation', {
    policy: { revision: 0 },
    usage: null,
    planLimit: 0,
    reservations: [],
  });
  const workspace = useData<{ role: string }>('/workspace', { role: '' });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const owner = workspace.data.role === 'owner',
    u = data.data.usage;
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      await data.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <div className="page-heading">
        <h2>{t('ميزانية استدعاءات AI', 'AI generation budget')}</h2>
        <button className="btn" onClick={() => data.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      <p className="muted">
        {t(
          'حجز ذري قبل الاتصال بالمزود؛ تبقى النتائج المجهولة محجوزة بعد الانقطاع ولا تعاد تلقائيًا. الرموز المحجوزة تقدير محافظ وليست فاتورة المزود. حد التكلفة يتطلب أسعارًا معلومة.',
          'Atomic reservation before provider calls. Interrupted or unknown outcomes retain their reservation and are never blindly retried. Reserved tokens are a conservative estimate, not provider invoices. Cost caps require configured prices.',
        )}
      </p>
      {(error || data.error) && (
        <p role="alert" className="notice error">
          {error || data.error}
        </p>
      )}
      <div className="form-grid">
        <article className="card">
          <strong>{t('محاولات هذا الشهر / حد الباقة', 'Monthly attempts / plan limit')}</strong>
          <p>
            {(u?.baseline_calls ?? 0) + (u?.attempts ?? 0)} /{' '}
            {data.data.planLimit === -1 ? '∞' : data.data.planLimit}
          </p>
        </article>
        <article className="card">
          <strong>{t('رموز فعلية / محجوزة', 'Actual / reserved tokens')}</strong>
          <p>
            {u?.charged_tokens ?? 0} / {u?.reserved_tokens ?? 0}
          </p>
        </article>
        <article className="card">
          <strong>{t('تكلفة معلومة / محجوزة بالدولار', 'Known / reserved cost in USD')}</strong>
          <p>
            {Number(u?.charged_cost_microusd ?? 0) / 1000000} /{' '}
            {Number(u?.reserved_cost_microusd ?? 0) / 1000000}
          </p>
          <small>
            {t(
              'راجع الحالات غير المسعّرة أدناه؛ الإجمالي ليس فاتورة.',
              'Review unpriced entries below; this total is not an invoice.',
            )}
          </small>
        </article>
      </div>
      {!!u?.baseline_unpriced_calls && (
        <p className="notice">
          {t(
            'توجد استدعاءات تاريخية غير مسعّرة؛ لا يمكن ضمان حد تكلفة لهذا الشهر قبل مراجعتها.',
            'Historical calls have unknown prices; a cost cap cannot be enforced for this month until reviewed.',
          )}
        </p>
      )}
      <form
        className="stack"
        key={data.data.policy.revision}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            n = (key: string) => (f.get(key) === '' ? null : Number(f.get(key)));
          void act('/agents/generation/policy', {
            revision: data.data.policy.revision,
            monthlyCalls: n('calls'),
            monthlyTokens: n('tokens'),
            monthlyCostUsd: n('cost'),
          });
        }}
      >
        <div className="form-grid">
          <label className="field">
            {t('حد المحاولات الشهري (اختياري)', 'Monthly attempt cap (optional)')}
            <input
              name="calls"
              type="number"
              min={0}
              max={10000000}
              defaultValue={data.data.policy.monthly_calls ?? ''}
              disabled={!owner}
            />
          </label>
          <label className="field">
            {t('حد الرموز الشهري (اختياري)', 'Monthly token cap (optional)')}
            <input
              name="tokens"
              type="number"
              min={0}
              max={2000000000}
              defaultValue={data.data.policy.monthly_tokens ?? ''}
              disabled={!owner}
            />
          </label>
          <label className="field">
            {t('حد التكلفة الشهرية بالدولار (اختياري)', 'Monthly cost cap in USD (optional)')}
            <input
              name="cost"
              type="number"
              min={0}
              max={1000000}
              step="0.000001"
              defaultValue={
                data.data.policy.monthly_cost_microusd == null
                  ? ''
                  : Number(data.data.policy.monthly_cost_microusd) / 1000000
              }
              disabled={!owner}
            />
          </label>
        </div>
        <button className="btn" disabled={busy || !owner}>
          {t('حفظ حدود الميزانية', 'Save budget limits')}
        </button>
      </form>
      <div className="table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('النموذج', 'Model')}</th>
              <th>{t('الحالة', 'State')}</th>
              <th>{t('رموز محجوزة / فعلية', 'Reserved / actual tokens')}</th>
              <th>{t('دولار محجوز / فعلي', 'Reserved / actual USD')}</th>
              <th>{t('المراجعة', 'Review')}</th>
            </tr>
          </thead>
          <tbody>
            {data.data.reservations.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.model}
                  <small className="block">{new Date(r.created_at).toLocaleString()}</small>
                </td>
                <td>{statusLabel(r.status, t)}</td>
                <td>
                  {r.reserved_tokens} /{' '}
                  {r.actual_input_tokens == null
                    ? '—'
                    : Number(r.actual_input_tokens) + Number(r.actual_output_tokens)}
                </td>
                <td>
                  {r.reserved_cost_microusd == null
                    ? '—'
                    : Number(r.reserved_cost_microusd) / 1000000}{' '}
                  /{' '}
                  {r.actual_cost_microusd == null ? '—' : Number(r.actual_cost_microusd) / 1000000}
                </td>
                <td>
                  {owner && ['started', 'uncertain', 'reserved'].includes(r.status) && (
                    <details>
                      <summary>{t('مراجعة حجز متوقف', 'Review interrupted reservation')}</summary>
                      <form
                        className="stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act('/agents/generation/' + r.id + '/release', {
                            confirmedNotBilled: true,
                            evidence: f.get('evidence'),
                          });
                        }}
                      >
                        <p>
                          {t(
                            'لا تُفرج عن الحجز إلا بدليل من المزود على عدم احتساب التكلفة. لا يكرر الإفراج الاتصال، ولا يسمح بإعادة استخدام الطلب القديم. يجب مرور دقيقتين على آخر تحديث.',
                            'Release only with provider evidence that this attempt was not billed. Release never repeats the call or permits reuse of the old request. Last update must be at least two minutes old.',
                          )}
                        </p>
                        <label className="field">
                          {t('مرجع دليل عدم احتساب التكلفة', 'Evidence of no charge')}
                          <textarea name="evidence" minLength={20} maxLength={2000} required />
                        </label>
                        <label>
                          <input type="checkbox" required />{' '}
                          {t(
                            'أؤكد أن المزود لم يحتسب تكلفة هذا الطلب',
                            'I confirm the provider did not bill this attempt',
                          )}
                        </label>
                        <button className="btn" disabled={busy}>
                          {t('تسجيل الدليل والإفراج', 'Record evidence & release')}
                        </button>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.data.reservations.length && (
        <p className="empty">{t('لا توجد حجوزات بعد.', 'No generation reservations yet.')}</p>
      )}
    </section>
  );
}
