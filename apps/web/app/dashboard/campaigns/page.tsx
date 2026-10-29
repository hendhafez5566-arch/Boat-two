'use client';
import { NavIcon } from '../../../components/product/NavIcon';
import ConfigurationPanel from '../../../components/flow/ConfigurationPanel';
import { Dialog } from '../../../components/product/ProductUI';
import SequencesPanel from '../../../components/workspace/SequencesPanel';
import styles from '../../../components/business/broadcast.module.css';
import { useChannelContext } from '../../../components/product/useChannelContext';

import AudienceSummary, { Audience } from '../../../components/business/AudienceSummary';
import { statusLabel } from '../../../components/product/status';
import Link from 'next/link';
import {
  CampaignDraftEditor,
  EditableCampaign,
} from '../../../components/business/CampaignDraftEditor';
import { useState, useRef, useEffect } from 'react';
import { CampaignComposer } from '../../../components/business/CampaignComposer';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Campaign = EditableCampaign & {
  metrics: { processed: number; delivered: number; read: number; failed: number };
  id: string;
  name: string;
  channel_name: string;
  status: string;
  recipients: number;
  scheduled_at: string | null;
  channel_type: string;
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
  const [channelId, setChannelId] = useChannelContext();
  const channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const [platform, setPlatform] = useState('whatsapp');
  const [campaignLimit, setCampaignLimit] = useState(5);
  const [sort, setSort] = useState<'createdAt' | 'name' | 'status' | 'scheduledAt'>('createdAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [draftSearch, setDraftSearch] = useState('');
  function sortBy(key: 'name' | 'status' | 'scheduledAt') {
    setSort(key);
    setDirection(sort === key && direction === 'asc' ? 'desc' : 'asc');
  }
  const platformChannels = channels.data.filter((channel) => channel.type === platform);
  const activeChannel =
    platformChannels.find((channel) => channel.id === channelId) || platformChannels[0];
  const activeChannelId = activeChannel?.id || '';
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get('channel');
      setPlatform(
        value && ['whatsapp', 'sms', 'facebook', 'telegram'].includes(value) ? value : 'whatsapp',
      );
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  function selectPlatform(value: string) {
    setPlatform(value);
    const query = new URLSearchParams(window.location.search);
    query.set('channel', value);
    window.history.replaceState(window.history.state, '', window.location.pathname + '?' + query);
    setChannelId(channels.data.find((channel) => channel.type === value)?.id || '');
  }
  const [mode, setMode] = useState('broadcast'),
    [creating, setCreating] = useState(false),
    [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null),
    [scheduling, setScheduling] = useState<Campaign | null>(null);
  const [campaignSearch, setCampaignSearch] = useState(''),
    [campaignStatus, setCampaignStatus] = useState(''),
    [campaignPage, setCampaignPage] = useState(1);
  const query = new URLSearchParams({
    paginated: 'true',
    limit: String(campaignLimit),
    page: String(campaignPage),
    q: campaignSearch,
    channelType: platform,
    sort,
    direction,
    ...(activeChannelId ? { channelId: activeChannelId } : {}),
    ...(campaignStatus ? { status: campaignStatus } : {}),
  });
  const result = useData<{
    items: Campaign[];
    total: number;
    page?: number;
    limit?: number;
    filters?: {
      channelId: string;
      channelType: string;
      status: string;
      q: string;
      sort: string;
      direction: string;
    };
  }>(activeChannelId ? '/campaigns?' + query : null, {
    items: [],
    total: 0,
  });
  const currentResult =
    !result.loading &&
    !result.error &&
    result.data.page === campaignPage &&
    result.data.limit === campaignLimit &&
    result.data.filters?.channelId === activeChannelId &&
    result.data.filters?.channelType === platform &&
    result.data.filters?.status === campaignStatus &&
    result.data.filters?.q === campaignSearch.trim() &&
    result.data.filters?.sort === sort &&
    result.data.filters?.direction === direction;
  const list = { ...result, data: currentResult ? result.data.items : [] };
  const totalCampaigns = currentResult ? result.data.total : 0;
  const summary = useData<{
    total: number;
    completed: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    readRate: number | null;
    filters?: { channelId: string; channelType: string };
  }>(
    activeChannelId
      ? '/campaigns/summary?' +
          new URLSearchParams({ channelType: platform, channelId: activeChannelId })
      : null,
    {
      total: 0,
      completed: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      readRate: null,
    },
  );
  useEffect(() => {
    setCampaignPage(1);
    setSelected('');
    setLedger(null);
    setCreating(false);
    setEditingCampaign(null);
    setScheduling(null);
    setSaved(false);
    ledgerVersion.current++;
  }, [activeChannelId, platform, campaignSearch, campaignStatus, campaignLimit, sort, direction]);

  const segments = useData<{ id: string; name: string; filters: Record<string, string> }[]>(
    '/crm/segments',
    [],
  );
  const visible =
    list.loading || !activeChannelId
      ? []
      : list.data.filter((c) => c.channel_id === activeChannelId && c.channel_type === platform);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
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
  const [reviews, setReviews] = useState<Record<string, { key: string; audience: Audience }>>({});
  const reviewRequest = useRef<Record<string, number>>({});
  const reviewKey = (campaign: Campaign) =>
    JSON.stringify([campaign.channel_id, campaign.filters, campaign.revision]);
  async function reviewAudience(campaign: Campaign) {
    const request = (reviewRequest.current[campaign.id] || 0) + 1;
    reviewRequest.current[campaign.id] = request;
    const key = reviewKey(campaign);
    setBusy(true);
    setError('');
    try {
      const audience = await api<Audience>('/campaigns/audience', {
        method: 'POST',
        body: JSON.stringify({ channelId: campaign.channel_id, filters: campaign.filters }),
      });
      if (reviewRequest.current[campaign.id] === request)
        setReviews((current) => ({ ...current, [campaign.id]: { key, audience } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run(fn: () => Promise<unknown>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
      await list.reload();
      await summary.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      actionLock.current = false;
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
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>{t('مركز البث', 'Broadcast Center')}</h1>
          <p>
            {t(
              'إنشاء وإدارة وتتبع حملات البث عبر القنوات.',
              'Create, manage and track all your broadcast campaigns across channels.',
            )}
          </p>
        </div>
        <div className={styles.headActions}>
          <nav className={styles.mode} aria-label={t('أقسام البث', 'Broadcast sections')}>
            <button
              type="button"
              aria-pressed={mode === 'broadcast'}
              onClick={() => setMode('broadcast')}
            >
              <NavIcon name="campaigns" /> {t('البث', 'Broadcast')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'sequence'}
              onClick={() => setMode('sequence')}
            >
              <NavIcon name="sequences" /> {t('التسلسلات', 'Sequence')}
            </button>
          </nav>
          {mode === 'broadcast' && activeChannelId && (
            <>
              <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
                + {t('إنشاء حملة', 'Create Campaign')}
              </button>
            </>
          )}
        </div>
      </header>
      {mode === 'sequence' ? (
        <SequencesPanel />
      ) : (
        <>
          <nav className={styles.channelTabs} aria-label={t('قنوات البث', 'Broadcast channels')}>
            {['whatsapp', 'sms', 'facebook', 'telegram'].map((type) => (
              <button
                type="button"
                key={type}
                aria-pressed={platform === type}
                onClick={() => selectPlatform(type)}
              >
                <NavIcon name={type} />
                {type === 'whatsapp'
                  ? 'WhatsApp'
                  : type === 'sms'
                    ? 'SMS'
                    : type === 'facebook'
                      ? 'Facebook'
                      : 'Telegram'}
              </button>
            ))}
          </nav>
          {activeChannelId && (
            <div className={styles.currentBot}>
              <NavIcon name="flows" />
              {t('البوت الحالي:', 'Current bot:')} <strong>{activeChannel?.name}</strong>
            </div>
          )}
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

          <p className={styles.period}>
            {t(
              'إحصاءات آخر 30 يومًا للحساب المختار',
              'Statistics for the last 30 days for the selected account',
            )}
          </p>
          {summary.error && (
            <p role="alert" className="notice error">
              {summary.error}
            </p>
          )}
          <section className={styles.statistics}>
            {(
              [
                ['total', t('إجمالي الحملات', 'Total Campaigns')],
                ['completed', t('المكتملة', 'Completed')],
                ['readRate', t('نسبة القراءة من المسلّم', 'Read Rate of Delivered')],
                ['sent', t('الرسائل المرسلة', 'Messages Sent')],
                ['failed', t('فشل / غير واصل', 'Failed / Unreached')],
              ] as const
            ).map(([key, label]) => (
              <article key={key}>
                <span className={styles.statIcon} data-tone={key}>
                  <NavIcon
                    name={
                      key === 'completed'
                        ? 'circleCheck'
                        : key === 'failed'
                          ? 'circleClose'
                          : key === 'readRate'
                            ? 'eye'
                            : 'campaigns'
                    }
                  />
                </span>
                <span>{label}</span>
                <strong>
                  {summary.loading || channels.loading
                    ? '…'
                    : summary.error ||
                        !activeChannelId ||
                        summary.data.filters?.channelId !== activeChannelId ||
                        summary.data.filters?.channelType !== platform
                      ? '—'
                      : summary.data[key] === null
                        ? '—'
                        : `${summary.data[key]}${key === 'readRate' ? '%' : ''}`}
                </strong>
                <small>{t('آخر 30 يومًا', 'Last 30 days')}</small>
              </article>
            ))}
          </section>
          {!channels.loading && !activeChannelId && (
            <p className="notice">
              {platform === 'sms' ? (
                t(
                  'بث SMS غير متاح في هذه النسخة بعد.',
                  'SMS broadcasting is not available in this version yet.',
                )
              ) : (
                <>
                  {t('لا يوجد بوت متصل بهذه المنصة.', 'No bot connected for this platform.')}{' '}
                  <Link href="/dashboard/channels">{t('ربط بوت', 'Connect a bot')}</Link>
                </>
              )}
            </p>
          )}
          {activeChannelId && (
            <>
              <ConfigurationPanel
                open={creating}
                onClose={() => {
                  if (!busy) setCreating(false);
                }}
                title={t('إنشاء حملة', 'Create Campaign')}
              >
                <CampaignComposer
                  layout="reference"
                  channels={platformChannels.filter((c) => c.id === activeChannelId)}
                  segments={segments.data}
                  onSaved={async () => {
                    await list.reload();
                    setSaved(true);
                    setCreating(false);
                    void summary.reload();
                  }}
                />
                <footer className="smart-editor-footer">
                  <button type="button" onClick={() => setCreating(false)}>
                    {t('إغلاق', 'Close')}
                  </button>
                </footer>
              </ConfigurationPanel>
              <section className={styles.campaignCard} aria-label={t('الحملات', 'Campaigns')}>
                <section className={styles.filters}>
                  <select
                    aria-label={t('الحساب', 'Account')}
                    value={activeChannelId}
                    onChange={(e) => setChannelId(e.target.value)}
                  >
                    {platformChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('حالة الحملة', 'Campaign status')}
                    value={campaignStatus}
                    onChange={(e) => setCampaignStatus(e.target.value)}
                  >
                    <option value="">{t('كل الحالات', 'All statuses')}</option>
                    {['draft', 'scheduled', 'running', 'completed', 'canceled'].map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status, t)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="search"
                    aria-label={t('البحث في الحملات', 'Search campaigns')}
                    placeholder={t('ابحث واضغط Enter…', 'Search & Enter…')}
                    maxLength={120}
                    value={draftSearch}
                    onChange={(e) => {
                      setDraftSearch(e.target.value);
                      if (!e.target.value) setCampaignSearch('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setCampaignSearch(draftSearch);
                    }}
                  />
                </section>
                <div className={styles.campaignTable}>
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th
                          aria-sort={
                            sort === 'name'
                              ? direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            className={styles.sortButton}
                            type="button"
                            onClick={() => sortBy('name')}
                          >
                            {t('الحملة', 'Campaign Name')}
                            <NavIcon name="sort" />
                          </button>
                        </th>
                        <th
                          aria-sort={
                            sort === 'status'
                              ? direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            className={styles.sortButton}
                            type="button"
                            onClick={() => sortBy('status')}
                          >
                            {t('الحالة', 'Status')}
                            <NavIcon name="sort" />
                          </button>
                        </th>
                        <th>{t('الإجراءات', 'Actions')}</th>
                        <th>{t('تمت معالجته', 'Processed')}</th>
                        <th>{t('مسلّم', 'Delivered')}</th>
                        <th>{t('مقروء', 'Opened')}</th>
                        <th>{t('فشل', 'Unreached')}</th>
                        <th
                          aria-sort={
                            sort === 'scheduledAt'
                              ? direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button
                            className={styles.sortButton}
                            type="button"
                            onClick={() => sortBy('scheduledAt')}
                          >
                            {t('الموعد', 'Scheduled At')}
                            <NavIcon name="sort" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((c, index) => (
                        <tr key={c.id}>
                          <td>{(campaignPage - 1) * campaignLimit + index + 1}</td>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>
                            <span className="badge">{statusLabel(c.status, t)}</span>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <button className="btn" onClick={() => view(c.id)}>
                                {t('النتائج', 'Results')}
                              </button>
                              {c.status === 'draft' && (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => setEditingCampaign(c)}
                                >
                                  {t('تعديل', 'Edit')}
                                </button>
                              )}
                              {['draft', 'scheduled'].includes(c.status) && (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => setScheduling(c)}
                                >
                                  {c.status === 'scheduled'
                                    ? t('إعادة الجدولة', 'Reschedule')
                                    : t('جدولة', 'Schedule')}
                                </button>
                              )}
                              {['draft', 'scheduled', 'running'].includes(c.status) && (
                                <button
                                  className="btn btn-danger"
                                  disabled={busy}
                                  onClick={() =>
                                    confirm(
                                      t(
                                        'إلغاء ما لم يُرسل من الحملة؟',
                                        'Cancel the unsent campaign work?',
                                      ),
                                    ) &&
                                    run(() => api(`/campaigns/${c.id}/cancel`, { method: 'PATCH' }))
                                  }
                                >
                                  {t('إلغاء', 'Cancel')}
                                </button>
                              )}
                            </div>
                          </td>
                          <td>{c.metrics?.processed ?? 0}</td>
                          <td>{c.metrics?.delivered ?? 0}</td>
                          <td>{c.metrics?.read ?? 0}</td>
                          <td>{c.metrics?.failed ?? 0}</td>
                          <td>
                            {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {list.loading ? (
                    <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
                  ) : (
                    !visible.length && (
                      <p className="empty">
                        {t('لا توجد بيانات في الجدول.', 'No data available in table.')}
                      </p>
                    )
                  )}
                </div>
                <div className={styles.pagination}>
                  <select
                    aria-label={t('عدد الحملات في الصفحة', 'Campaigns per page')}
                    value={campaignLimit}
                    onChange={(e) => setCampaignLimit(Number(e.target.value))}
                  >
                    {[5, 10, 25].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <span>
                    {totalCampaigns ? (campaignPage - 1) * campaignLimit + 1 : 0} -{' '}
                    {Math.min(campaignPage * campaignLimit, totalCampaigns)} {t('من', 'of')}{' '}
                    {totalCampaigns}
                  </span>
                  <button
                    className="btn"
                    type="button"
                    disabled={list.loading || campaignPage <= 1}
                    onClick={() => setCampaignPage(campaignPage - 1)}
                  >
                    {t('السابق', 'Previous')}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={list.loading || campaignPage * campaignLimit >= totalCampaigns}
                    onClick={() => setCampaignPage(campaignPage + 1)}
                  >
                    {t('التالي', 'Next')}
                  </button>
                </div>
              </section>
            </>
          )}

          <Dialog
            open={!!editingCampaign}
            onClose={() => {
              if (!busy) setEditingCampaign(null);
            }}
            title={t('تعديل مسودة الحملة', 'Edit Campaign Draft')}
          >
            {editingCampaign && (
              <CampaignDraftEditor
                key={editingCampaign.id + editingCampaign.revision}
                campaign={editingCampaign}
                save={run}
                busy={busy}
                expanded
              />
            )}
          </Dialog>
          <Dialog
            open={!!scheduling}
            onClose={() => {
              if (!busy) setScheduling(null);
            }}
            title={t('مراجعة الجمهور والجدولة', 'Review Audience & Schedule')}
          >
            {scheduling &&
              (() => {
                const c = scheduling;
                return (
                  <form
                    className="flex flex-wrap gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        reviews[c.id]?.key !== reviewKey(c) ||
                        !reviews[c.id]?.audience.eligible
                      ) {
                        setError(
                          t(
                            'راجع الجمهور وأسباب الاستبعاد أولاً.',
                            'Review the audience and exclusions first.',
                          ),
                        );
                        return;
                      }
                      const at = new Date(
                        String(new FormData(e.currentTarget).get('at')),
                      ).toISOString();
                      run(async () => {
                        const result = await api(`/campaigns/${c.id}/schedule`, {
                          method: 'POST',
                          body: JSON.stringify({ at }),
                        });
                        setScheduling(null);
                        return result;
                      });
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => reviewAudience(c)}
                    >
                      {t('مراجعة أسباب أهلية الجمهور', 'Review audience eligibility')}
                    </button>
                    {reviews[c.id]?.key === reviewKey(c) && (
                      <AudienceSummary audience={reviews[c.id].audience} />
                    )}
                    <input
                      type="datetime-local"
                      aria-label={t('موعد الحملة', 'Campaign schedule')}
                      name="at"
                      required
                    />
                    <button
                      className="btn"
                      disabled={
                        busy ||
                        reviews[c.id]?.key !== reviewKey(c) ||
                        !reviews[c.id]?.audience.eligible
                      }
                    >
                      {c.status === 'scheduled'
                        ? t('إعادة الجدولة', 'Reschedule')
                        : t('جدولة', 'Schedule')}
                    </button>
                  </form>
                );
              })()}
          </Dialog>
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
              {ledgerLoading && (
                <p role="status">{t('تحميل سجل المستلمين…', 'Loading recipients…')}</p>
              )}
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
                        {[
                          ...new Set([x.error, x.delivery_error, x.job_error].filter(Boolean)),
                        ].join(' · ')}
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
                <button
                  className="btn"
                  disabled={page === 1}
                  onClick={() => view(selected, page - 1)}
                >
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
        </>
      )}
    </main>
  );
}
