'use client';
import { NavIcon } from '../../../components/product/NavIcon';
import SubscriberProfile from '../../../components/business/SubscriberProfile';
import styles from '../../../components/business/subscribers.module.css';
import { useChannelContext } from '../../../components/product/useChannelContext';
import { Dialog } from '../../../components/product/ProductUI';
import { statusLabel } from '../../../components/product/status';
import { CrmJobs } from '../../../components/business/CrmJobs';
import { ContactLifecycle } from '../../../components/business/ContactLifecycle';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
import { download, exportCsv } from '../../../components/business/csv';
type Contact = {
  lists?: { id: string; name: string }[];
  sequences?: { id: string; name: string; status: string }[];
  consents?: { channelId: string; status: string }[];
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  owner_id: string | null;
  archived_at: string | null;
  attributes: Record<string, string | number | boolean | null>;
};
type Pipeline = {
  id: string;
  name: string;
  stages: string[];
  owner_id: string | null;
  ownership_revision: number;
};
type Deal = {
  id: string;
  title: string;
  contact_name: string;
  pipeline_id: string;
  stage: string;
  status: string;
  value_cents: string;
  currency: string;
};
type Task = { id: string; title: string; contact_name: string; due_at: string; status: string };
const blank = {
  name: '',
  email: '',
  phone: '',
  lifecycle: 'lead',
  tags: '',
  ownerId: '',
  attributes: '{}',
};
const COLUMNS = ['contact', 'lifecycle', 'tags', 'id'] as const;
type Column = (typeof COLUMNS)[number];

export default function CRM() {
  const { t } = useLocale();
  const workspace = useData<{ role: string }>('/workspace', { role: '' });
  const canManage = ['owner', 'admin'].includes(workspace.data.role);
  const [tab, setTab] = useState('contacts');
  const [headMenu, setHeadMenu] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const profileDismissed = useRef(false);
  useEffect(() => {
    if (!headMenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-subscriber-menu]')) setHeadMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeadMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [headMenu]);
  const [cols, setCols] = useState<Column[]>(['contact', 'lifecycle', 'tags']);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('crm.columns') || 'null');
      if (Array.isArray(saved)) setCols(saved.filter((c): c is Column => COLUMNS.includes(c)));
    } catch {
      /* Optional column preferences. */
    }
  }, []);
  const toggleCol = (c: Column, on: boolean) =>
    setCols((cur) => {
      const next = on ? [...cur, c] : cur.filter((x) => x !== c);
      try {
        localStorage.setItem('crm.columns', JSON.stringify(next));
      } catch {
        /* Optional column preferences. */
      }
      return next;
    });
  const [q, setQ] = useState('');
  const [channelId, setChannelId] = useChannelContext();
  const [listId, setListId] = useState(''),
    [sequenceId, setSequenceId] = useState(''),
    [sequenceStatus, setSequenceStatus] = useState(''),
    [consentStatus, setConsentStatus] = useState('');
  const filterChannels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const filterLists = useData<{ id: string; name: string }[]>(
    canManage ? '/contact-lists' : null,
    [],
  );
  const filterSequences = useData<{ id: string; name: string }[]>(
    canManage ? '/sequences' : null,
    [],
  );
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [stage, setStage] = useState('');
  const [tag, setTag] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blank);
  const [selected, setSelected] = useState<Contact | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('contact');
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
    let active = true;
    profileDismissed.current = true;
    api<Contact>(`/crm/contacts/${id}`)
      .then((contact) => {
        if (active) setSelected(contact);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const [viewMode, setViewMode] = useState('list');
  const [sort, setSort] = useState('latest');
  const [pageSize, setPageSize] = useState(10);
  const filter = new URLSearchParams({
    q,
    ...(channelId ? { channelId } : {}),
    ...(listId ? { listId } : {}),
    ...(sequenceId ? { sequenceId } : {}),
    ...(sequenceStatus ? { sequenceStatus } : {}),
    ...(consentStatus ? { consentStatus } : {}),
    archived: archiveFilter,
    ...(stage ? { lifecycle: stage } : {}),
    ...(tag ? { tag } : {}),
  });
  const contacts = useData<{ items: Contact[]; total: number }>(
    `/crm/contacts?${filter}&page=${page}&limit=${pageSize}&sort=${sort}`,
    { items: [], total: 0 },
  );
  useEffect(() => {
    if (!selected && !profileDismissed.current && contacts.data.items.length)
      setSelected(contacts.data.items[0]);
  }, [contacts.data.items, selected]);
  const editContact = (contact: Contact) => {
    setEdit(contact.id);
    setForm({
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      lifecycle: contact.lifecycle,
      tags: contact.tags.join(', '),
      ownerId: contact.owner_id || '',
      attributes: JSON.stringify(contact.attributes, null, 2),
    });
  };
  const summary = useData<{
    total: number;
    retained: number;
    subscribed: number;
    in_sequences: number;
  }>(tab === 'contacts' ? '/crm/contacts-summary?' + filter : null, {
    total: 0,
    retained: 0,
    subscribed: 0,
    in_sequences: 0,
  });
  useEffect(() => {
    setPage(1);
    setBulkIds([]);
  }, [
    q,
    channelId,
    listId,
    sequenceId,
    sequenceStatus,
    consentStatus,
    stage,
    tag,
    archiveFilter,
    pageSize,
    sort,
  ]);
  const pipelines = useData<Pipeline[]>('/crm/pipelines', []);
  const deals = useData<{ items: Deal[]; total: number }>('/crm/deals?page=' + page, {
    items: [],
    total: 0,
  });
  const tasks = useData<{ items: Task[]; total: number }>('/crm/tasks?page=' + page, {
    items: [],
    total: 0,
  });
  const fields = useData<{ id: string; key: string; label: string; type: string }[]>(
    '/crm/fields',
    [],
  );
  const segments = useData<
    {
      id: string;
      name: string;
      filters: {
        q?: string;
        lifecycle?: string;
        tag?: string;
        archived?: string;
        channelId?: string;
        listId?: string;
        sequenceId?: string;
        sequenceStatus?: string;
        consentStatus?: string;
      };
    }[]
  >('/crm/segments', []);
  const duplicates = useData<{ kind: string; value: string; ids: string[]; count: number }[]>(
    '/crm/contacts/duplicates',
    [],
  );
  const team = useData<{ members: { user_id: string; full_name: string; email: string }[] }>(
    '/team',
    { members: [] },
  );
  useEffect(() => {
    const reload = () => {
      void contacts.reload();
    };
    window.addEventListener('boat:crm-imported', reload);
    return () => window.removeEventListener('boat:crm-imported', reload);
  }, [contacts.reload]);
  const refresh = () => {
    contacts.reload();
    summary.reload();
    deals.reload();
    tasks.reload();
    fields.reload();
    segments.reload();
    duplicates.reload();
    pipelines.reload();
  };
  async function act(path: string, body?: unknown, method = 'POST') {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const r = await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      setMessage(t('تم حفظ التغيير.', 'Change saved.'));
      refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await act(
        '/crm/contacts' + (edit ? '/' + edit : ''),
        {
          ...form,
          email: form.email || null,
          phone: form.phone || null,
          tags: form.tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          ownerId: form.ownerId || null,
          attributes: JSON.parse(form.attributes),
        },
        edit ? 'PATCH' : 'POST',
      );
      setForm(blank);
      setEdit(null);
      setShowCreate(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function exportContacts() {
    try {
      const r = await api<{ items: Contact[]; total: number }>(`/crm/contacts/export?${filter}`);
      if (r.total > r.items.length)
        throw new Error(
          t(
            'ضيّق التصفية إلى 10000 جهة اتصال أو أقل.',
            'Narrow the filter to 10,000 contacts or fewer.',
          ),
        );
      download('contacts.csv', exportCsv(r.items, ['name', 'email', 'phone', 'lifecycle', 'tags']));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const tabs = [
    ['contacts', 'جهات الاتصال', 'Contacts'],
    ['deals', 'الصفقات', 'Deals'],
    ['tasks', 'المتابعات', 'Tasks'],
    ['config', 'الحقول والشرائح', 'Fields & segments'],
  ];
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>{t('المشتركون', 'Subscribers')}</h1>
          <p>
            {t(
              'إدارة جمهورك وتصنيفه عبر جميع القنوات',
              'Manage and segment your audience across all channels',
            )}
          </p>
        </div>
        <div className={styles.headActions}>
          <div className={styles.dropdown} data-subscriber-menu>
            <button
              className="btn"
              type="button"
              aria-expanded={headMenu === 'transfer'}
              onClick={() => setHeadMenu(headMenu === 'transfer' ? null : 'transfer')}
            >
              <NavIcon name="export" />
              {t('تصدير / استيراد', 'Export/Import')}
              <NavIcon name="chevron" />
            </button>
            {headMenu === 'transfer' && (
              <div className={styles.dropdownMenu}>
                <button
                  type="button"
                  onClick={() => {
                    setHeadMenu(null);
                    void exportContacts();
                  }}
                >
                  {t('تصدير CSV', 'Export CSV')}
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setHeadMenu(null);
                      setImportOpen(true);
                    }}
                  >
                    {t('استيراد وإدارة الملفات', 'Import and manage files')}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={styles.dropdown} data-subscriber-menu>
            <button
              className="btn"
              type="button"
              aria-expanded={headMenu === 'manage'}
              onClick={() => setHeadMenu(headMenu === 'manage' ? null : 'manage')}
            >
              <NavIcon name="settings" />
              {t('إدارة', 'Manage')}
              <NavIcon name="chevron" />
            </button>
            {headMenu === 'manage' && (
              <div className={styles.dropdownMenu}>
                <button
                  type="button"
                  onClick={() => {
                    setHeadMenu(null);
                    setEdit(null);
                    setForm(blank);
                    setShowCreate(true);
                    setTab('contacts');
                  }}
                >
                  {t('إضافة مشترك', 'Add subscriber')}
                </button>
                {tabs.map(([id, ar, en]) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      setHeadMenu(null);
                      setTab(id);
                      setPage(1);
                    }}
                  >
                    {t(ar, en)}
                  </button>
                ))}
                <Link href="/dashboard/crm/lists">{t('القوائم', 'Lists')}</Link>
              </div>
            )}
          </div>
          <button
            className="btn"
            type="button"
            aria-label={t('تحديث', 'Refresh')}
            onClick={refresh}
          >
            <NavIcon name="redo" />
          </button>
        </div>
      </header>
      {tab !== 'contacts' && (
        <nav className={styles.navigation}>
          <button className="btn" onClick={() => setTab('contacts')}>
            {t('العودة للمشتركين', 'Back to subscribers')}
          </button>
          <span>{t(...(tabs.find(([key]) => key === tab)?.slice(1) as [string, string]))}</span>
        </nav>
      )}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('تصدير واستيراد المشتركين', 'Subscriber Export/Import')}
      >
        {canManage && <CrmJobs />}
      </Dialog>
      {(error ||
        contacts.error ||
        deals.error ||
        tasks.error ||
        fields.error ||
        segments.error) && (
        <p className="notice error" role="alert">
          {error || contacts.error || deals.error || tasks.error || fields.error || segments.error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {tab === 'contacts' && (
        <>
          <section
            className={styles.filters}
            aria-label={t('تصفية المشتركين', 'Subscriber filters')}
          >
            <select
              aria-label={t('القناة', 'Channel')}
              value={filterChannels.data.find((c) => c.id === channelId)?.type || ''}
              onChange={(e) => {
                setChannelId(filterChannels.data.find((c) => c.type === e.target.value)?.id || '');
              }}
            >
              <option value="">{t('كل القنوات', 'All channels')}</option>
              {[...new Set(filterChannels.data.map((c) => c.type))].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <select
              aria-label={t('الحساب', 'Account')}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="">{t('كل الحسابات', 'All accounts')}</option>
              {filterChannels.data.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
            <input
              aria-label={t('الوسم', 'Label')}
              list="crm-known-tags"
              placeholder={t('كل الوسوم', 'All labels')}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <datalist id="crm-known-tags">
              {[...new Set(contacts.data.items.flatMap((contact) => contact.tags))]
                .sort()
                .map((label) => (
                  <option key={label}>{label}</option>
                ))}
            </datalist>
            <select
              aria-label={t('القائمة', 'List')}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
            >
              <option value="">{t('كل القوائم', 'All lists')}</option>
              {filterLists.data.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t('التسلسل', 'Sequence')}
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
            >
              <option value="">{t('كل التسلسلات', 'All sequences')}</option>
              {filterSequences.data.map((sequence) => (
                <option key={sequence.id} value={sequence.id}>
                  {sequence.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t('حالة المشترك', 'Subscriber status')}
              value={archiveFilter}
              onChange={(e) => setArchiveFilter(e.target.value)}
            >
              <option value="active">{t('نشط', 'Retained')}</option>
              <option value="archived">{t('مؤرشف', 'Archived')}</option>
              <option value="all">{t('الكل', 'All Status')}</option>
            </select>
            <input
              type="search"
              aria-label={t('بحث في المشتركين', 'Search subscribers')}
              placeholder={t('بحث بالاسم أو الهاتف أو البريد…', 'Search by name, phone or email…')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </section>
          <div className={styles.filterActions}>
            <button className="btn" type="button" onClick={() => setToolsOpen(true)}>
              {t('إضافة فلتر', 'Add Filter')}
            </button>
            <span>
              {contacts.data.total} {t('نتيجة', 'subscribers')}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQ('');
                setStage('');
                setTag('');
                setArchiveFilter('active');
                setChannelId('');
                setListId('');
                setSequenceId('');
                setSequenceStatus('');
                setConsentStatus('');
                setPage(1);
              }}
            >
              {t('مسح التصفية', 'Clear All')}
            </button>
          </div>
          {summary.error && (
            <p className="notice error" role="alert">
              {summary.error}
            </p>
          )}
          <div
            className={styles.statistics}
            aria-label={t('إحصائيات نتائج التصفية', 'Filtered subscriber statistics')}
          >
            {(
              [
                ['total', t('إجمالي المشتركين', 'Total Subscribers')],
                ['retained', t('النشطون', 'Retained')],
                ['subscribed', t('موافقة تسويق موثقة', 'Marketing Opt-ins')],
                ['in_sequences', t('في تسلسلات نشطة', 'In Active Sequences')],
              ] as const
            ).map(([key, label]) => (
              <article key={key}>
                <span className={styles.statIcon} data-tone={key}>
                  <NavIcon
                    name={
                      key === 'total'
                        ? 'crm'
                        : key === 'retained'
                          ? 'check'
                          : key === 'subscribed'
                            ? 'user'
                            : 'sequences'
                    }
                  />
                </span>
                <span>{label}</span>
                <strong>{summary.loading ? '…' : summary.error ? '—' : summary.data[key]}</strong>
                <small>
                  {key === 'total'
                    ? t('ضمن نتائج التصفية', 'Within current filters')
                    : `${summary.data.total ? Math.round((summary.data[key] / summary.data.total) * 100) : 0}% ${t('من الإجمالي', 'of total')}`}
                </small>
              </article>
            ))}
          </div>
          <Dialog
            open={toolsOpen}
            onClose={() => setToolsOpen(false)}
            title={t('الفلاتر والإجراءات الجماعية', 'Filters and Bulk Actions')}
          >
            <Link href="/dashboard/crm/work" className="btn">
              {t('إدارة المبيعات والمتابعات المتقدمة', 'Manage sales and follow-ups')}
            </Link>
            <Link href="/dashboard/crm/lists" className="btn">
              {t('قوائم المشتركين', 'Subscriber lists')}
            </Link>
            <div className="form-grid">
              <label className="field">
                {t('مرحلة العميل', 'Lifecycle')}
                <select value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">{t('الكل', 'All')}</option>
                  {['lead', 'qualified', 'customer', 'inactive'].map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('حالة التسلسل', 'Sequence status')}
                <select value={sequenceStatus} onChange={(e) => setSequenceStatus(e.target.value)}>
                  <option value="">{t('الكل', 'All')}</option>
                  {['active', 'completed', 'stopped'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('موافقة التسويق', 'Marketing consent')}
                <select value={consentStatus} onChange={(e) => setConsentStatus(e.target.value)}>
                  <option value="">{t('الكل', 'All')}</option>
                  {['opted_in', 'opted_out', 'unknown'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <details className="col-picker">
              <summary className="btn">{t('الأعمدة', 'Columns')}</summary>
              <div className="col-picker-menu">
                {COLUMNS.map((column) => (
                  <label key={column}>
                    <input
                      type="checkbox"
                      checked={cols.includes(column)}
                      onChange={(e) => toggleCol(column, e.target.checked)}
                    />
                    {
                      {
                        contact: t('التواصل', 'Contact'),
                        lifecycle: t('المرحلة', 'Lifecycle'),
                        tags: t('الوسوم', 'Labels'),
                        id: t('المعرّف', 'ID'),
                      }[column]
                    }
                  </label>
                ))}
              </div>
            </details>
            {canManage && <ContactLifecycle act={act} busy={busy} />}

            {canManage && bulkIds.length > 0 && (
              <form
                className="card space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const lifecycle = String(data.get('lifecycle') || '');
                  const owner = String(data.get('owner') || '');
                  try {
                    await act('/crm/contacts/bulk', {
                      ids: bulkIds,
                      attributes: Object.fromEntries(
                        fields.data
                          .filter((field) => data.get('apply-' + field.key))
                          .map((field) => {
                            const value = String(data.get('custom-' + field.key) || '');
                            return [
                              field.key,
                              value === ''
                                ? null
                                : field.type === 'number'
                                  ? Number(value)
                                  : field.type === 'boolean'
                                    ? value === 'true'
                                    : value,
                            ];
                          }),
                      ),
                      ...(lifecycle ? { lifecycle } : {}),
                      ...(owner ? { ownerId: owner === 'unassigned' ? null : owner } : {}),
                      addTags: String(data.get('tags') || '')
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    });
                    setBulkIds([]);
                  } catch {
                    /* Shared error banner. */
                  }
                }}
              >
                <h2>
                  {t('تعديل العملاء المحددين', 'Edit selected contacts')} ({bulkIds.length})
                </h2>
                <div className="form-grid">
                  <label className="field">
                    {t('المرحلة', 'Lifecycle')}
                    <select name="lifecycle">
                      <option value="">{t('دون تغيير', 'Keep current')}</option>
                      {['lead', 'qualified', 'customer', 'inactive'].map((value) => (
                        <option key={value} value={value}>
                          {statusLabel(value, t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t('المسؤول', 'Owner')}
                    <select name="owner">
                      <option value="">{t('دون تغيير', 'Keep current')}</option>
                      <option value="unassigned">{t('إلغاء التعيين', 'Unassign')}</option>
                      {team.data.members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t('إضافة وسوم مفصولة بفاصلة', 'Add comma-separated tags')}
                    <input name="tags" />
                  </label>
                </div>
                <fieldset className="form-grid">
                  <legend>
                    {t(
                      'حقول مخصصة (حدد ما تريد تغييره فقط)',
                      'Custom fields (select only fields to change)',
                    )}
                  </legend>
                  {fields.data.map((field) => (
                    <label className="field" key={field.key}>
                      <span>
                        <input type="checkbox" name={'apply-' + field.key} /> {field.label}
                      </span>
                      {field.type === 'boolean' ? (
                        <select name={'custom-' + field.key}>
                          <option value="">{t('مسح القيمة', 'Clear value')}</option>
                          <option value="true">{t('نعم', 'Yes')}</option>
                          <option value="false">{t('لا', 'No')}</option>
                        </select>
                      ) : (
                        <input
                          name={'custom-' + field.key}
                          type={
                            field.type === 'number'
                              ? 'number'
                              : field.type === 'date'
                                ? 'date'
                                : 'text'
                          }
                          step={field.type === 'number' ? 'any' : undefined}
                          maxLength={2000}
                        />
                      )}
                    </label>
                  ))}
                </fieldset>
                <button className="btn btn-primary" disabled={busy || !bulkIds.length}>
                  {t('تطبيق على المحددين', 'Apply to selected')}
                </button>
                <button type="button" className="btn" onClick={() => setBulkIds([])}>
                  {t('مسح التحديد', 'Clear selection')}
                </button>
              </form>
            )}
          </Dialog>
          <div className={styles.workspace}>
            <section className={styles.subscriberList} data-view={viewMode}>
              <div className={styles.listToolbar}>
                <label>
                  <input
                    type="checkbox"
                    checked={
                      contacts.data.items.length > 0 &&
                      contacts.data.items.every((contact) => bulkIds.includes(contact.id))
                    }
                    onChange={(e) =>
                      setBulkIds(
                        e.target.checked ? contacts.data.items.map((contact) => contact.id) : [],
                      )
                    }
                  />
                  {t('تحديد الكل', 'Select all')}
                </label>
                <span>
                  {bulkIds.length > 0 ? `${bulkIds.length} ${t('محدد', 'selected')}` : ''}
                </span>
                <button
                  className="btn"
                  disabled={!bulkIds.length}
                  onClick={() => setToolsOpen(true)}
                >
                  {t('إجراءات جماعية', 'Bulk Actions')}
                  <NavIcon name="chevron" />
                </button>
                <button className="btn" onClick={() => setToolsOpen(true)}>
                  {t('خيارات', 'Options')}
                  <NavIcon name="chevron" />
                </button>
                <select
                  aria-label={t('ترتيب المشتركين', 'Sort subscribers')}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="latest">{t('الأحدث', 'Latest')}</option>
                  <option value="oldest">{t('الأقدم', 'Oldest')}</option>
                  <option value="name">{t('الاسم', 'Name')}</option>
                </select>
                <button
                  className="btn"
                  type="button"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                >
                  <span className="sr-only">{t('قائمة', 'List')}</span>
                  <NavIcon name="inbox" />
                </button>
                <button
                  className="btn"
                  type="button"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                >
                  <span className="sr-only">{t('شبكة', 'Grid')}</span>
                  <NavIcon name="" />
                </button>
              </div>
              <div className={styles.tableScroll}>
                <table className="product-table">
                  <thead className="sr-only">
                    <tr>
                      <th>{t('تحديد', 'Select')}</th>
                      <th>{t('المشترك', 'Subscriber')}</th>
                      <th>{t('الحالة', 'Status')}</th>
                      <th>{t('الإجراءات', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.data.items.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={t('تحديد ', 'Select ') + c.name}
                            checked={bulkIds.includes(c.id)}
                            disabled={!bulkIds.includes(c.id) && bulkIds.length >= 100}
                            onChange={(event) =>
                              setBulkIds((ids) =>
                                event.target.checked
                                  ? [...ids, c.id]
                                  : ids.filter((id) => id !== c.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <div className={styles.identity}>
                            <span className={styles.rowAvatar} aria-hidden="true">
                              {c.name.slice(0, 2)}
                            </span>
                            <div>
                              <button
                                className={styles.subscriberName}
                                onClick={() => {
                                  profileDismissed.current = false;
                                  setSelected(c);
                                }}
                              >
                                {c.name}
                              </button>
                              {cols.includes('contact') && (
                                <small dir="ltr">{c.phone || c.email || '—'}</small>
                              )}
                              {cols.includes('tags') && (
                                <div className={styles.inlineTags}>
                                  {c.tags.map((x) => (
                                    <button
                                      type="button"
                                      key={x}
                                      title={t('تصفية بهذا الوسم', 'Filter by this label')}
                                      onClick={() => {
                                        setTag(x);
                                        setPage(1);
                                      }}
                                    >
                                      {x}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {cols.includes('id') && <small dir="ltr">{c.id}</small>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.statePills}>
                            <span data-tone={c.archived_at ? 'muted' : 'green'}>
                              {c.archived_at ? t('مؤرشف', 'Archived') : t('نشط', 'Retained')}
                            </span>
                            <span
                              data-tone={
                                (c.consents || []).some(
                                  (consent) =>
                                    (!channelId || consent.channelId === channelId) &&
                                    consent.status === 'opted_in',
                                )
                                  ? 'blue'
                                  : 'muted'
                              }
                            >
                              {(c.consents || []).some(
                                (consent) =>
                                  (!channelId || consent.channelId === channelId) &&
                                  consent.status === 'opted_in',
                              )
                                ? t('مشترك', 'Subscribed')
                                : t('موافقة غير موثقة', 'No opt-in')}
                            </span>
                            {cols.includes('lifecycle') && (
                              <small>{statusLabel(c.lifecycle, t)}</small>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className="btn"
                              aria-label={t('ملف المشترك: ', 'Subscriber actions: ') + c.name}
                              onClick={() => {
                                profileDismissed.current = false;
                                setSelected(c);
                              }}
                            >
                              <NavIcon name="user" />
                            </button>
                            <button
                              type="button"
                              className="btn"
                              aria-label={t('تعديل: ', 'Edit: ') + c.name}
                              onClick={() => editContact(c)}
                            >
                              <NavIcon name="edit" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {contacts.loading ? (
                  <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
                ) : (
                  !contacts.data.items.length && (
                    <p className="empty">
                      {t(
                        'أضف أول عميل، أو استورد قائمة جهات اتصالك.',
                        'Add your first contact or import your contact list.',
                      )}
                    </p>
                  )
                )}
              </div>
              <footer className={styles.listFooter}>
                <label>
                  {t('الصفوف', 'Rows')}{' '}
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('السابق', 'Previous')}
                </button>
                <span>{page}</span>
                <button
                  className="btn"
                  type="button"
                  disabled={page * pageSize >= contacts.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  {t('التالي', 'Next')}
                </button>
              </footer>
            </section>
            {selected ? (
              <SubscriberProfile
                key={selected.id}
                contactId={selected.id}
                canManage={canManage}
                onClose={() => {
                  profileDismissed.current = true;
                  setSelected(null);
                }}
                onChanged={() => {
                  void contacts.reload();
                  void summary.reload();
                }}
              />
            ) : (
              <aside className={styles.profileEmpty}>
                <h2>{t('ملف المشترك', 'Subscriber Profile')}</h2>
                <p>
                  {t(
                    'اختر مشتركًا لعرض بياناته وإدارته.',
                    'Select a subscriber to view and manage their profile.',
                  )}
                </p>
              </aside>
            )}
          </div>
          <Dialog
            open={showCreate || !!edit}
            onClose={() => {
              setShowCreate(false);
              setEdit(null);
            }}
            title={edit ? t('تعديل العميل', 'Edit contact') : t('إضافة عميل', 'Add contact')}
          >
            <form className="card" onSubmit={save}>
              <h2>
                {edit
                  ? t('تعديل ملف العميل', 'Edit customer profile')
                  : t('عميل جديد', 'New contact')}
              </h2>
              <div className="form-grid">
                {(['name', 'email', 'phone', 'tags'] as const).map((k) => (
                  <label className="field" key={k}>
                    {
                      {
                        name: t('الاسم', 'Name'),
                        email: t('البريد', 'Email'),
                        phone: t('الهاتف', 'Phone'),
                        tags: t('وسوم مفصولة بفاصلة', 'Comma-separated tags'),
                      }[k]
                    }
                    <input
                      type={k === 'email' ? 'email' : 'text'}
                      required={k === 'name'}
                      value={form[k]}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </label>
                ))}
                <label className="field">
                  {t('المرحلة', 'Lifecycle')}
                  <select
                    value={form.lifecycle}
                    onChange={(e) => setForm({ ...form, lifecycle: e.target.value })}
                  >
                    {['lead', 'qualified', 'customer', 'inactive'].map((x) => (
                      <option key={x} value={x}>
                        {statusLabel(x, t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t('مسؤول العميل', 'Owner')}
                  <select
                    value={form.ownerId}
                    onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                  >
                    <option value="">{t('غير معيّن', 'Unassigned')}</option>
                    {team.data.members.map((x) => (
                      <option value={x.user_id} key={x.user_id}>
                        {x.full_name || x.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid mt-4">
                {fields.data.map((field) => {
                  let attributes: Record<string, unknown> = {};
                  try {
                    attributes = JSON.parse(form.attributes);
                  } catch {
                    /* Advanced JSON editor validates on submit. */
                  }
                  const value = attributes[field.key];
                  return (
                    <label className="field" key={field.id}>
                      {field.label}
                      {field.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={value === true}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              attributes: JSON.stringify({
                                ...attributes,
                                [field.key]: e.target.checked,
                              }),
                            })
                          }
                        />
                      ) : (
                        <input
                          type={
                            field.type === 'number'
                              ? 'number'
                              : field.type === 'date'
                                ? 'date'
                                : 'text'
                          }
                          value={value === undefined || value === null ? '' : String(value)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              attributes: JSON.stringify({
                                ...attributes,
                                [field.key]:
                                  e.target.value === ''
                                    ? null
                                    : field.type === 'number'
                                      ? Number(e.target.value)
                                      : e.target.value,
                              }),
                            })
                          }
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <details className="mt-4">
                <summary className="muted">
                  {t('بيانات إضافية متقدمة', 'Advanced additional attributes')}
                </summary>
                <label className="field mt-4">
                  {t('حقول العميل المخصصة (JSON)', 'Custom attributes (JSON)')}
                  <textarea
                    rows={3}
                    dir="ltr"
                    value={form.attributes}
                    onChange={(e) => setForm({ ...form, attributes: e.target.value })}
                  />
                </label>
              </details>
              <div className="form-actions">
                <button disabled={busy} className="btn btn-primary">
                  {t('حفظ العميل', 'Save contact')}
                </button>
                {edit && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEdit(null);
                      setForm(blank);
                      setShowCreate(false);
                    }}
                  >
                    {t('إلغاء', 'Cancel')}
                  </button>
                )}
              </div>
            </form>{' '}
          </Dialog>
        </>
      )}
      {tab === 'deals' && (
        <>
          <section className="card">
            <h2>{t('الصفقات وخطوط المبيعات', 'Deals & pipelines')}</h2>
            <div className="table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>{t('الصفقة', 'Deal')}</th>
                    <th>{t('العميل', 'Contact')}</th>
                    <th>{t('القيمة', 'Value')}</th>
                    <th>{t('المرحلة', 'Stage')}</th>
                    <th>{t('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.data.items.map((d) => (
                    <tr key={d.id}>
                      <td>{d.title}</td>
                      <td>{d.contact_name}</td>
                      <td>
                        {Number(d.value_cents) / 100} {d.currency}
                      </td>
                      <td>
                        <select
                          value={d.stage}
                          onChange={(e) =>
                            act(
                              '/crm/deals/' + d.id,
                              { stage: e.target.value, status: d.status },
                              'PATCH',
                            ).catch(() => {})
                          }
                        >
                          {pipelines.data
                            .find((p) => p.id === d.pipeline_id)
                            ?.stages.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={d.status}
                          onChange={(e) =>
                            act(
                              '/crm/deals/' + d.id,
                              { stage: d.stage, status: e.target.value },
                              'PATCH',
                            ).catch(() => {})
                          }
                        >
                          {['open', 'won', 'lost'].map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s, t)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!deals.data.items.length && (
              <p className="empty">{t('لا توجد صفقات بعد.', 'No deals yet.')}</p>
            )}
          </section>
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const b = new FormData(f);
              const pipeline = pipelines.data.find((p) => p.id === b.get('pipelineId'));
              try {
                await act('/crm/deals', {
                  title: b.get('title'),
                  contactId: b.get('contactId'),
                  pipelineId: pipeline?.id,
                  stage: pipeline?.stages[0],
                  valueCents: Math.round(Number(b.get('value')) * 100),
                  currency: b.get('currency'),
                });
                f.reset();
              } catch {
                /* The action helper displays the error. */
              }
            }}
          >
            <h2>{t('صفقة جديدة', 'New deal')}</h2>
            <div className="form-grid">
              <label className="field">
                {t('العنوان', 'Title')}
                <input name="title" required />
              </label>
              <ContactSelect items={contacts.data.items} />
              <label className="field">
                {t('خط المبيعات', 'Pipeline')}
                <select name="pipelineId" required>
                  {pipelines.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('القيمة', 'Value')}
                <input name="value" type="number" min="0" step="0.01" required />
              </label>
              <label className="field">
                {t('العملة', 'Currency')}
                <input name="currency" defaultValue="USD" pattern="[A-Z]{3}" required />
              </label>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy || !pipelines.data.length}>
              {t('إنشاء الصفقة', 'Create deal')}
            </button>
          </form>
          <section className="card space-y-4">
            <h2>{t('إدارة مراحل المبيعات', 'Manage sales stages')}</h2>
            <p className="text-sm text-slate-500">
              {t(
                'عند إزالة مرحلة تحتوي صفقات، اختر المرحلة البديلة قبل الحفظ.',
                'When removing a stage with deals, choose its replacement before saving.',
              )}
            </p>
            {pipelines.data.map((pipeline) => (
              <details key={pipeline.id} className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">{pipeline.name}</summary>
                <form
                  className="stack mt-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    await act(
                      '/crm/pipelines/' + pipeline.id + '/owner',
                      {
                        ownerId: form.get('owner') || null,
                        revision: pipeline.ownership_revision,
                        transferOpenDeals: form.has('transfer'),
                      },
                      'PATCH',
                    ).catch(() => {});
                  }}
                >
                  <label className="field">
                    {t('مسؤول خط المبيعات', 'Pipeline owner')}
                    <select
                      name="owner"
                      key={pipeline.ownership_revision}
                      defaultValue={pipeline.owner_id || ''}
                    >
                      <option value="">{t('بدون مسؤول', 'Unassigned')}</option>
                      {team.data.members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" name="transfer" />{' '}
                    {t(
                      'نقل الصفقات المفتوحة التابعة للمسؤول السابق فقط (يشمل غير المعيّنة إذا كان الخط بدون مسؤول)',
                      'Also transfer open deals owned by the previous pipeline owner (includes unassigned deals if the pipeline was unassigned)',
                    )}
                  </label>
                  <button className="btn" disabled={busy}>
                    {t('حفظ المسؤول', 'Save ownership')}
                  </button>
                </form>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const stages = String(form.get('stages'))
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const replacements = Object.fromEntries(
                      pipeline.stages
                        .map((stage, index) => [
                          stage,
                          String(form.get('replacement-' + index) || ''),
                        ])
                        .filter(([, value]) => value),
                    );
                    try {
                      await act(
                        '/crm/pipelines/' + pipeline.id,
                        { name: form.get('name'), stages, replacements },
                        'PATCH',
                      );
                    } catch {
                      /* Shared error banner. */
                    }
                  }}
                >
                  <label className="field">
                    {t('الاسم', 'Name')}
                    <input name="name" required maxLength={100} defaultValue={pipeline.name} />
                  </label>
                  <label className="field">
                    {t('المراحل بالترتيب، مفصولة بفاصلة', 'Stages in order, separated by commas')}
                    <input name="stages" required defaultValue={pipeline.stages.join(', ')} />
                  </label>
                  {pipeline.stages.map((stage, index) => (
                    <label key={stage} className="field">
                      {t('بديل عند حذف المرحلة: ', 'Replacement if removing: ') + stage}
                      <input
                        name={'replacement-' + index}
                        maxLength={60}
                        placeholder={t(
                          'اسم مرحلة في القائمة الجديدة',
                          'Stage name in the new list',
                        )}
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-primary" disabled={busy}>
                      {t('حفظ المراحل', 'Save stages')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            t('حذف خط المبيعات الفارغ؟', 'Delete this empty pipeline?'),
                          )
                        )
                          void act('/crm/pipelines/' + pipeline.id, undefined, 'DELETE').catch(
                            () => {},
                          );
                      }}
                    >
                      {t('حذف الخط الفارغ', 'Delete empty pipeline')}
                    </button>
                  </div>
                </form>
              </details>
            ))}
          </section>
          <SimpleForm
            title={t('خط مبيعات جديد', 'New pipeline')}
            fields={[
              ['name', t('الاسم', 'Name')],
              ['stages', t('مراحل مفصولة بفاصلة', 'Comma-separated stages')],
            ]}
            onSave={(b) =>
              act('/crm/pipelines', {
                name: b.name,
                stages: b.stages
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </>
      )}
      {tab === 'tasks' && (
        <>
          <section className="card table-wrap">
            <table className="product-table">
              <thead>
                <tr>
                  <th>{t('المهمة', 'Task')}</th>
                  <th>{t('العميل', 'Contact')}</th>
                  <th>{t('الموعد', 'Due')}</th>
                  <th>{t('الحالة', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.data.items.map((x) => (
                  <tr key={x.id}>
                    <td>{x.title}</td>
                    <td>{x.contact_name}</td>
                    <td
                      className={
                        x.status === 'open' && new Date(x.due_at) < new Date() ? 'text-red-700' : ''
                      }
                    >
                      {new Date(x.due_at).toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          act(
                            '/crm/tasks/' + x.id,
                            { status: x.status === 'open' ? 'done' : 'open' },
                            'PATCH',
                          ).catch(() => {})
                        }
                      >
                        {x.status === 'open' ? t('إكمال', 'Complete') : t('إعادة فتح', 'Reopen')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tasks.data.items.length && (
              <p className="empty">{t('لا توجد متابعات.', 'No follow-ups yet.')}</p>
            )}
          </section>
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const b = new FormData(f);
              try {
                await act('/crm/tasks', {
                  title: b.get('title'),
                  contactId: b.get('contactId'),
                  dueAt: new Date(String(b.get('dueAt'))).toISOString(),
                  assignedTo: b.get('assignedTo') || null,
                });
                f.reset();
              } catch {
                /* The action helper displays the error. */
              }
            }}
          >
            <h2>{t('متابعة جديدة', 'New follow-up')}</h2>
            <div className="form-grid">
              <label className="field">
                {t('المهمة', 'Task')}
                <input required name="title" />
              </label>
              <ContactSelect items={contacts.data.items} />
              <label className="field">
                {t('الموعد', 'Due')}
                <input required name="dueAt" type="datetime-local" />
              </label>
              <label className="field">
                {t('المسؤول', 'Assignee')}
                <select name="assignedTo">
                  <option value="">{t('غير معيّن', 'Unassigned')}</option>
                  {team.data.members.map((x) => (
                    <option key={x.user_id} value={x.user_id}>
                      {x.full_name || x.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy}>
              {t('حفظ المتابعة', 'Save follow-up')}
            </button>
          </form>
        </>
      )}
      {tab === 'config' && (
        <>
          <div className="card-grid">
            <section className="card">
              <h2>{t('الحقول المخصصة', 'Custom fields')}</h2>
              {fields.data.map((x) => (
                <p className="muted" key={x.id}>
                  {x.label} ·{' '}
                  {(
                    {
                      text: t('نص', 'Text'),
                      number: t('رقم', 'Number'),
                      date: t('تاريخ', 'Date'),
                      boolean: t('نعم / لا', 'Yes / no'),
                    } as Record<string, string>
                  )[x.type] || x.type}{' '}
                  · {x.key}
                </p>
              ))}
            </section>
            <section className="card">
              <h2>{t('الشرائح المحفوظة', 'Saved segments')}</h2>
              {segments.data.map((x) => (
                <div className="step" key={x.id}>
                  <button
                    onClick={() => {
                      setQ(x.filters.q || '');
                      setChannelId(x.filters.channelId || '');
                      setListId(x.filters.listId || '');
                      setSequenceId(x.filters.sequenceId || '');
                      setSequenceStatus(x.filters.sequenceStatus || '');
                      setConsentStatus(x.filters.consentStatus || '');
                      setStage(x.filters.lifecycle || '');
                      setTag(x.filters.tag || '');
                      setArchiveFilter(x.filters.archived || 'active');
                      setTab('contacts');
                      setPage(1);
                    }}
                  >
                    {x.name} ↗
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() =>
                      confirm(t('حذف الشريحة؟', 'Delete segment?')) &&
                      act('/crm/segments/' + x.id, undefined, 'DELETE').catch(() => {})
                    }
                  >
                    {t('حذف', 'Delete')}
                  </button>
                </div>
              ))}
            </section>
          </div>
          <CustomFieldForm onSave={(body) => act('/crm/fields', body)} />
          <section className="card stack">
            <h2>{t('مراجعة شروط الشريحة', 'Review segment conditions')}</h2>
            <p>
              {contacts.data.total}{' '}
              {t(
                'عميل مطابق حاليًا — تُحفظ الشروط لا قائمة ثابتة من العملاء',
                'contacts match now — saves conditions, not a fixed contact list',
              )}
            </p>
            <div className="form-grid">
              <label>
                {t('البحث', 'Search')}
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                {t('المرحلة', 'Lifecycle')}
                <select
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('كل المراحل', 'All stages')}</option>
                  {['lead', 'qualified', 'customer', 'inactive'].map((x) => (
                    <option key={x} value={x}>
                      {statusLabel(x, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('الوسم', 'Tag')}
                <input
                  value={tag}
                  onChange={(e) => {
                    setTag(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                {t('حالة الملفات', 'Profile status')}
                <select
                  value={archiveFilter}
                  onChange={(e) => {
                    setArchiveFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {['active', 'archived', 'all'].map((x) => (
                    <option key={x} value={x}>
                      {x === 'all' ? t('الكل', 'All') : statusLabel(x, t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <SimpleForm
            title={t('احفظ التصفية الحالية كشريحة', 'Save current filters as a segment')}
            fields={[['name', t('اسم الشريحة', 'Segment name')]]}
            onSave={(b) =>
              act('/crm/segments', { name: b.name, filters: Object.fromEntries(filter) })
            }
          />
          <section className="card">
            <h2>{t('بريد مكرر', 'Duplicate emails')}</h2>
            {duplicates.data.map((x) => (
              <p className="muted" key={x.kind + x.value}>
                {x.kind}: {x.value} · {x.count} · {x.ids.join(', ')}
              </p>
            ))}
            {!duplicates.data.length && (
              <p className="muted">
                {t('لا توجد عناوين بريد مكررة.', 'No duplicate email addresses.')}
              </p>
            )}
          </section>
        </>
      )}
      {tab !== 'config' && tab !== 'contacts' && (
        <div className="form-actions">
          <button disabled={page === 1} className="btn" onClick={() => setPage((p) => p - 1)}>
            {t('السابق', 'Previous')}
          </button>
          <span>{page}</span>
          <button
            className="btn"
            disabled={
              page * 25 >=
              (tab === 'contacts'
                ? contacts.data.total
                : tab === 'deals'
                  ? deals.data.total
                  : tasks.data.total)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      )}
    </main>
  );
}
function ContactSelect({ items }: { items: Contact[] }) {
  const { t } = useLocale();
  return (
    <label className="field">
      {t('العميل (من نتائج البحث الحالية)', 'Contact (current search results)')}
      <select name="contactId" required>
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function SimpleForm({
  title,
  fields,
  options = {},
  help = {},
  onSave,
}: {
  title: string;
  fields: string[][];
  options?: Record<string, string[][]>;
  help?: Record<string, string>;
  onSave: (body: Record<string, string>) => Promise<unknown>;
}) {
  const { t } = useLocale();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError('');
        try {
          await onSave(Object.fromEntries(new FormData(form)) as Record<string, string>);
          form.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{title}</h2>
      <div className="form-grid">
        {fields.map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            {options[key] ? (
              <select required name={key}>
                {options[key].map(([value, title]) => (
                  <option key={value} value={value}>
                    {title}
                  </option>
                ))}
              </select>
            ) : (
              <input required name={key} />
            )}
            {help[key] && <small>{help[key]}</small>}
          </label>
        ))}
      </div>
      {error && <p className="notice error">{error}</p>}
      <button disabled={busy} className="btn mt-4">
        {t('حفظ', 'Save')}
      </button>
    </form>
  );
}

function CustomFieldForm({
  onSave,
}: {
  onSave: (body: Record<string, string>) => Promise<unknown>;
}) {
  const { t } = useLocale();
  const [label, setLabel] = useState(''),
    [key, setKey] = useState(''),
    [type, setType] = useState('text'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const generated =
    'field_' +
    Array.from(label.trim())
      .map((c) => c.codePointAt(0)!.toString(16))
      .join('')
      .slice(0, 32);
  const fieldKey = key || generated;
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await onSave({ label, key: fieldKey, type });
          setLabel('');
          setKey('');
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{t('إضافة حقل مخصص', 'Add custom field')}</h2>
      <label>
        {t('العنوان', 'Label')}
        <input required maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label>
        {t('نوع البيانات', 'Data type')}
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {[
            ['text', t('نص', 'Text')],
            ['number', t('رقم', 'Number')],
            ['date', t('تاريخ', 'Date')],
            ['boolean', t('نعم / لا', 'Yes / no')],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <p>
        {t('معاينة', 'Preview')}: {label || t('عنوان الحقل', 'Field label')} —{' '}
        {type === 'boolean'
          ? t('نعم / لا', 'Yes / no')
          : type === 'number'
            ? '123'
            : type === 'date'
              ? '2026-10-24'
              : t('قيمة نصية', 'Text value')}
      </p>
      <details>
        <summary>{t('متقدم: مفتاح التكامل', 'Advanced: integration key')}</summary>
        <input
          aria-label={t('مفتاح الحقل', 'Field key')}
          dir="ltr"
          pattern="[a-z][a-z0-9_]{0,40}"
          maxLength={41}
          placeholder={generated}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <code dir="ltr">{fieldKey}</code>
      </details>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الحقل', 'Save field')}
      </button>
    </form>
  );
}
