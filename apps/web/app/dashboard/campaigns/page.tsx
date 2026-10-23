'use client';
import { DeliveryPolicies } from '../../../components/business/DeliveryPolicies';
import {
  CampaignDraftEditor,
  EditableCampaign,
} from '../../../components/business/CampaignDraftEditor';
import { useState } from 'react';
import { CampaignComposer } from '../../../components/business/CampaignComposer';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Campaign = EditableCampaign & {
  id: string;
  name: string;
  channel_name: string;
  status: string;
  recipients: number;
  scheduled_at: string | null;
};
type Recipient = {
  id: string;
  contact_name: string;
  status: string;
  delivery_status: string | null;
  error: string | null;
};
export default function Campaigns() {
  const { t } = useLocale();
  const list = useData<Campaign[]>('/campaigns', []);
  const channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const segments = useData<{ id: string; name: string; filters: Record<string, string> }[]>(
    '/crm/segments',
    [],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [ledger, setLedger] = useState<{
    items: Recipient[];
    totals: { status: string; delivery_status: string | null; count: number }[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function view(id: string, p = 1) {
    setSelected(id);
    setPage(p);
    try {
      setLedger(await api<typeof ledger>(`/campaigns/${id}/recipients?page=${p}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERMISSION-BASED MARKETING</p>
          <h1>{t('رسالة مناسبة، لجمهور موافق', 'The right message, with permission')}</h1>
          <p>
            {t(
              'راجع الجمهور والموافقة قبل الجدولة. حالة الطابور لا تعني التسليم.',
              'Review your audience and consent before scheduling. Queued is not delivered.',
            )}
          </p>
        </div>
        <button className="btn" onClick={() => list.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      <p className="notice">
        {t(
          'الإرسال الخارجي معطّل افتراضيًا في البيئة. لن ترسل المنصة إلى Meta حتى يفعّل المشغّل الاتصال الرسمي والإذن اللازم.',
          'External delivery is disabled by default. Meta delivery requires operator activation and official channel authorization.',
        )}
      </p>
      {(error || list.error) && (
        <p className="notice error" role="alert">
          {error || list.error}
        </p>
      )}
      {message && <p className="notice">{message}</p>}
      <CampaignComposer
        channels={channels.data}
        segments={segments.data}
        onSaved={async () => {
          await list.reload();
          setMessage(
            t(
              'حُفظت مسودة الحملة. يمكنك مراجعتها وجدولتها من القائمة.',
              'Campaign draft saved. Review and schedule it below.',
            ),
          );
        }}
      />
      <DeliveryPolicies />
      <section className="card table-wrap">
        <h2>{t('الحملات', 'Campaigns')}</h2>
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('الحملة', 'Campaign')}</th>
              <th>{t('الحالة', 'Status')}</th>
              <th>{t('الجمهور', 'Recipients')}</th>
              <th>{t('الإجراءات', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted">{c.channel_name}</div>
                </td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
                <td>{c.recipients}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => view(c.id)}>
                      {t('النتائج', 'Results')}
                    </button>
                    {c.status === 'draft' && (
                      <CampaignDraftEditor campaign={c} save={run} busy={busy} />
                    )}
                    {['draft', 'scheduled'].includes(c.status) && (
                      <form
                        className="flex flex-wrap gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const at = new Date(
                            String(new FormData(e.currentTarget).get('at')),
                          ).toISOString();
                          run(() =>
                            api(`/campaigns/${c.id}/schedule`, {
                              method: 'POST',
                              body: JSON.stringify({ at }),
                            }),
                          );
                        }}
                      >
                        <input
                          type="datetime-local"
                          aria-label={t('موعد الحملة', 'Campaign schedule')}
                          name="at"
                          required
                        />
                        <button className="btn" disabled={busy}>
                          {c.status === 'scheduled'
                            ? t('إعادة الجدولة', 'Reschedule')
                            : t('جدولة', 'Schedule')}
                        </button>
                      </form>
                    )}
                    {['draft', 'scheduled', 'running'].includes(c.status) && (
                      <button
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          confirm(
                            t('إلغاء ما لم يُرسل من الحملة؟', 'Cancel the unsent campaign work?'),
                          ) && run(() => api(`/campaigns/${c.id}/cancel`, { method: 'PATCH' }))
                        }
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.loading ? (
          <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
        ) : (
          !list.data.length && (
            <p className="empty">
              {t(
                'لا توجد حملات. أنشئ أول مسودة أعلاه.',
                'No campaigns. Build your first draft above.',
              )}
            </p>
          )
        )}
      </section>
      {ledger && (
        <section className="card table-wrap">
          <h2>{t('سجل الجمهور والتسليم', 'Recipient & delivery ledger')}</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {ledger.totals.map((x, i) => (
              <span key={i} className="badge">
                {x.status} / {x.delivery_status || '—'}: {x.count}
              </span>
            ))}
          </div>
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('العميل', 'Contact')}</th>
                <th>{t('المعالجة', 'Processing')}</th>
                <th>{t('التسليم', 'Delivery')}</th>
                <th>{t('التفاصيل', 'Details')}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.items.map((x) => (
                <tr key={x.id}>
                  <td>{x.contact_name}</td>
                  <td>{x.status}</td>
                  <td>{x.delivery_status || '—'}</td>
                  <td>
                    {x.error}
                    {x.status === 'failed' && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/campaigns/${selected}/recipients/${x.id}/retry`, {
                              method: 'POST',
                            });
                            await view(selected, page);
                          })
                        }
                      >
                        {t('إعادة المحاولة', 'Retry')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button className="btn" disabled={page === 1} onClick={() => view(selected, page - 1)}>
              {t('السابق', 'Previous')}
            </button>
            <button className="btn" onClick={() => view(selected, page)}>
              {t('تحديث', 'Refresh')}
            </button>
            <button
              className="btn"
              disabled={ledger.items.length < 25}
              onClick={() => view(selected, page + 1)}
            >
              {t('التالي', 'Next')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
