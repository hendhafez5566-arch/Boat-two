'use client';
import { useState } from 'react';
import { useLocale } from '../../components/product/locale';
type Review = {
  id: string;
  status: string;
  observed_at: string | null;
  evidence: {
    verdict: string;
    providerRequestId: string;
    status: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  error: string | null;
};
type Item = {
  id: string;
  company: string;
  kind: string;
  plan_code: string | null;
  reviews: Review[];
};
export default function BillingReviews({
  request,
  canWrite,
}: {
  request: (path: string, body?: unknown) => Promise<unknown>;
  canWrite: boolean;
}) {
  const { t } = useLocale(),
    [rows, setRows] = useState<Item[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setRows((await request('/billing-reviews')) as Item[]);
  }
  async function act(path: string, reason: string) {
    setBusy(true);
    setError('');
    try {
      await request(path, { reason });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BILLING REVIEW</p>
          <h2>{t('مراجعة النتائج غير المؤكدة', 'Review uncertain outcomes')}</h2>
        </div>
        <button
          className="btn"
          onClick={() => {
            setError('');
            void load().catch((e) => setError(e.message));
          }}
        >
          {t('تحميل وتحديث', 'Load and refresh')}
        </button>
      </div>
      <p className="notice">
        {t(
          'اطلب قراءة موثقة من المزود، ثم راجع الدليل وأكّد خلال 15 دقيقة. كل إجراء يتطلب رمز مصادقة جديدًا. لا يعيد هذا المسار تنفيذ أي عملية مالية؛ الدليل غير المطابق يبقي الطلب معزولًا.',
          'Request a verified provider read, review its evidence, then confirm within 15 minutes. Each action needs a fresh authenticator code. This never replays a financial mutation; mismatching evidence keeps the request quarantined.',
        )}
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {rows.map((row) => (
        <article key={row.id} className="card stack">
          <h3>
            {row.company} · {row.kind} {row.plan_code}
          </h3>
          <form
            className="form-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                `/billing-reviews/${row.id}/evidence`,
                String(new FormData(e.currentTarget).get('reason')),
              );
            }}
          >
            <label>
              {t('سبب المراجعة', 'Review reason')}
              <input name="reason" required minLength={10} maxLength={1000} />
            </label>
            <button className="btn" disabled={busy || !canWrite}>
              {t('طلب دليل جديد', 'Request fresh evidence')}
            </button>
          </form>
          {row.reviews.map((review) => (
            <div key={review.id} className="review-evidence">
              <strong>{review.status}</strong>
              <p>{review.error}</p>
              {review.evidence && (
                <dl>
                  <dt>{t('النتيجة', 'Verdict')}</dt>
                  <dd>{review.evidence.verdict}</dd>
                  <dt>Stripe request</dt>
                  <dd>
                    <code>{review.evidence.providerRequestId}</code>
                  </dd>
                  <dt>{t('وقت القراءة', 'Read time')}</dt>
                  <dd>{review.observed_at}</dd>
                </dl>
              )}
              {review.status === 'ready' && review.evidence?.verdict === 'satisfied' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(
                      `/billing-reviews/${review.id}/confirm`,
                      String(new FormData(e.currentTarget).get('reason')),
                    );
                  }}
                >
                  <label>
                    {t('توثيق قرار اعتماد الدليل', 'Document evidence approval')}
                    <input name="reason" required minLength={10} maxLength={1000} />
                  </label>
                  <button className="btn btn-primary" disabled={busy || !canWrite}>
                    {t('اعتماد الحالة المرصودة وإغلاق العزل', 'Approve observed state and resolve')}
                  </button>
                </form>
              )}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
