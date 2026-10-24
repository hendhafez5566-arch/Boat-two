'use client';
import AudienceSummary, { Audience } from '../../../components/business/AudienceSummary';
import { statusLabel } from '../../../components/product/status';
import { DeliveryPolicies } from '../../../components/business/DeliveryPolicies';
import {
  CampaignDraftEditor,
  EditableCampaign,
} from '../../../components/business/CampaignDraftEditor';
import { useState, useRef } from 'react';
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
  delivery_error: string | null;
  job_status: string | null;
  job_error: string | null;
  attempts: number | null;
  can_retry: boolean;
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
    filteredCount: number;
    totals: { status: string; delivery_status: string | null; count: number }[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    deliveryStatus: '',
    jobStatus: '',
  });
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const ledgerVersion = useRef(0);
  const [saved, setSaved] = useState(false);
  const [reviews,setReviews] = useState<Record<string,{key:string;audience:Audience}>>({});
  const reviewRequest = useRef<Record<string,number>>({});
  const reviewKey = (campaign:Campaign) => JSON.stringify([campaign.channel_id,campaign.filters,campaign.revision]);
  async function reviewAudience(campaign:Campaign) {
    const request=(reviewRequest.current[campaign.id] || 0)+1;
    reviewRequest.current[campaign.id]=request;
    const key=reviewKey(campaign);
    setBusy(true);setError('');
    try {const audience=await api<Audience>('/campaigns/audience',{method:'POST',body:JSON.stringify({channelId:campaign.channel_id,filters:campaign.filters})});
      if(reviewRequest.current[campaign.id]===request)setReviews(current=>({...current,[campaign.id]:{key,audience}}));
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
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
  async function view(id: string, p = 1, next = filters) {
    const version = ++ledgerVersion.current;
    setSelected(id);
    setPage(p);
    setFilters(next);
    setLedgerLoading(true);
    setError('');
    setLedger(null);
    try {
      const result = await api<NonNullable<typeof ledger>>(
        `/campaigns/${id}/recipients?` + new URLSearchParams({ ...next, page: String(p) }),
      );
      if (version === ledgerVersion.current) setLedger(result);
    } catch (e) {
      if (version === ledgerVersion.current) setError((e as Error).message);
    } finally {
      if (version === ledgerVersion.current) setLedgerLoading(false);
    }
  }
  function downloadLedger() {
    if (!ledger) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              campaignId: selected,
              filters,
              page,
              filteredCount: ledger.filteredCount,
              downloadedAt: new Date().toISOString(),
              scope: 'loaded_page_only',
              items: ledger.items,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'campaign-recipients-page-' + page + '.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('تسويق قائم على الموافقة', 'PERMISSION-BASED MARKETING')}</p>
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
      {saved && (
        <p className="notice" role="status">
          {t(
            'حُفظت مسودة الحملة. يمكنك مراجعتها وجدولتها من القائمة.',
            'Campaign draft saved. Review and schedule it below.',
          )}
        </p>
      )}
      <CampaignComposer
        channels={channels.data}
        segments={segments.data}
        onSaved={async () => {
          await list.reload();
          setSaved(true);
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
                  <span className="badge">{statusLabel(c.status, t)}</span>
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
                          if (reviews[c.id]?.key !== reviewKey(c) || !reviews[c.id]?.audience.eligible) {setError(t('راجع الجمهور وأسباب الاستبعاد أولاً.','Review the audience and exclusions first.'));return;}
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
                        <button type="button" className="btn" disabled={busy} onClick={()=>reviewAudience(c)}>{t('مراجعة أسباب أهلية الجمهور','Review audience eligibility')}</button>
                        {reviews[c.id]?.key === reviewKey(c) && <AudienceSummary audience={reviews[c.id].audience} />}
                        <input
                          type="datetime-local"
                          aria-label={t('موعد الحملة', 'Campaign schedule')}
                          name="at"
                          required
                        />
                        <button className="btn" disabled={busy || reviews[c.id]?.key !== reviewKey(c) || !reviews[c.id]?.audience.eligible}>
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
      {selected && (
        <section
          className="card stack"
          aria-label={t('تصفية مستلمي الحملة', 'Campaign recipient filters')}
        >
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void view(selected, 1, {
                search: String(f.get('search') ?? ''),
                status: String(f.get('status') ?? ''),
                deliveryStatus: String(f.get('deliveryStatus') ?? ''),
                jobStatus: String(f.get('jobStatus') ?? ''),
              });
            }}
          >
            <label className="field">
              {t('البحث باسم العميل', 'Search contact name')}
              <input name="search" maxLength={120} defaultValue={filters.search} />
            </label>
            <label className="field">
              {t('حالة المعالجة', 'Processing status')}
              <select name="status" defaultValue={filters.status}>
                <option value="">{t('الكل', 'All')}</option>
                {['pending', 'queued', 'skipped', 'failed'].map((x) => (
                  <option key={x} value={x}>
                    {statusLabel(x, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('حالة التسليم', 'Delivery status')}
              <select name="deliveryStatus" defaultValue={filters.deliveryStatus}>
                <option value="">{t('الكل', 'All')}</option>
                {['none', 'queued', 'sent', 'delivered', 'read', 'failed'].map((x) => (
                  <option key={x} value={x}>
                    {x === 'none' ? t('لا توجد رسالة', 'No message') : statusLabel(x, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('حالة مهمة الإرسال', 'Outbound job status')}
              <select name="jobStatus" defaultValue={filters.jobStatus}>
                <option value="">{t('الكل', 'All')}</option>
                {['none', 'pending', 'sending', 'sent', 'failed', 'ambiguous', 'blocked'].map(
                  (x) => (
                    <option key={x} value={x}>
                      {x === 'none' ? t('لا توجد مهمة', 'No job') : statusLabel(x, t)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button className="btn" disabled={ledgerLoading}>
              {t('تطبيق الفلاتر', 'Apply filters')}
            </button>
          </form>
          {ledgerLoading && <p role="status">{t('تحميل سجل المستلمين…', 'Loading recipients…')}</p>}
          <p className="muted">
            {t(
              'إعادة المحاولة متاحة فقط لفشل المعالجة قبل إنشاء رسالة. النتائج الغامضة تحتاج مراجعة ولا يُعاد إرسالها هنا.',
              'Retry is available only for processing failures before message creation. Ambiguous outcomes need review and cannot be resent here.',
            )}
          </p>
        </section>
      )}
      {ledger && (
        <section className="card table-wrap">
          <h2>{t('سجل الجمهور والتسليم', 'Recipient & delivery ledger')}</h2>
          <p>{list.data.find((c) => c.id === selected)?.name}</p>
          <p className="muted">
            {t('إجمالي الحملة قبل التصفية', 'Campaign totals before filters')}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {ledger.totals.map((x, i) => (
              <span key={i} className="badge">
                {statusLabel(x.status, t)} /{' '}
                {x.delivery_status ? statusLabel(x.delivery_status, t) : '—'}: {x.count}
              </span>
            ))}
          </div>
          <div className="form-actions">
            <p role="status">
              {ledger.filteredCount} {t('مستلم مطابق', 'matching recipients')}
            </p>
            <button className="btn" onClick={downloadLedger}>
              {t('تنزيل الصفحة المحملة', 'Download loaded page')}
            </button>
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
                  <td>{statusLabel(x.status, t)}</td>
                  <td>
                    {x.delivery_status ? statusLabel(x.delivery_status, t) : '—'}
                    <br />
                    {x.job_status ? statusLabel(x.job_status, t) : '—'}
                    {x.attempts != null && (
                      <small>
                        {' '}
                        · {x.attempts} {t('محاولات', 'attempts')}
                      </small>
                    )}
                  </td>
                  <td>
                    {[...new Set([x.error, x.delivery_error, x.job_error].filter(Boolean))].join(
                      ' · ',
                    )}
                    {x.can_retry && (
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
          {!ledger.items.length && (
            <p className="empty">
              {t('لا يوجد مستلمون يطابقون الفلاتر.', 'No recipients match these filters.')}
            </p>
          )}
          <div className="form-actions">
            <button className="btn" disabled={page === 1} onClick={() => view(selected, page - 1)}>
              {t('السابق', 'Previous')}
            </button>
            <button className="btn" onClick={() => view(selected, page)}>
              {t('تحديث', 'Refresh')}
            </button>
            <button
              className="btn"
              disabled={page * 25 >= ledger.filteredCount}
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
