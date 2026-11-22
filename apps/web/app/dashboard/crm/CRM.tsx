'use client';
import { PipelineStages } from '../../../components/business/PipelineStages';
import product from '../../../components/business/crm-product.module.css';
import design from '../../../components/business/crm-design.module.css';
import { DisclosureSummary } from '../../../components/product/DisclosureSummary';

import type { ContactField } from '../../../lib/inbox-contact-fields';
import { ContactEditor } from '../../../components/business/ContactEditor';
import { CrmScoring } from '../../../components/business/CrmScoring';
import { CrmAutomation } from '../../../components/business/CrmAutomation';
import { CrmSegments } from '../../../components/business/CrmSegments';
import { CrmImport } from '../../../components/business/CrmImport';
import { NavIcon } from '../../../components/product/NavIcon';
import SubscriberProfile from '../../../components/business/SubscriberProfile';
import styles from '../../../components/business/subscribers.module.css';
import { useChannelContext } from '../../../components/product/useChannelContext';
import { Dialog } from '../../../components/product/ProductUI';
import { statusLabel } from '../../../components/product/status';
import { CrmJobs } from '../../../components/business/CrmJobs';
import { ContactLifecycle } from '../../../components/business/ContactLifecycle';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useCrmEditBody } from '../../../components/business/useCrmEditBody';
import { useCrmDraftGuard } from '../../../components/business/useCrmDraftGuard';
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
  created_at: string;
  updated_at: string;
  attributes: Record<string, string | number | boolean | null>;
};
type Pipeline = {
  id: string;
  name: string;
  stages: string[];
  owner_id: string | null;
  ownership_revision: number;
};
const COLUMNS = ['contact', 'lifecycle', 'tags', 'id'] as const;
type Column = (typeof COLUMNS)[number];

export default function CRM({ initialTab = 'contacts' }: { initialTab?: string }) {
  const { t } = useLocale();
  const workspace = useData<{ role: string }>('/workspace', { role: '' });
  const canManage = ['owner', 'admin'].includes(workspace.data.role);
  const [tab, setTab] = useState(initialTab);
  const [headMenu, setHeadMenu] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportFields, setExportFields] = useState(['name', 'email', 'phone', 'lifecycle', 'tags']);
  const exportPending = useRef(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const [cols, setCols] = useState<Column[]>(['contact', 'lifecycle']);
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
  const bulkPending = useRef(false);
  const [selectedBulkIds, setBulkIds] = useState<string[]>([]);
  const [stage, setStage] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  function chooseQuickFilter(value: string) {
    setQuickFilter(value);
    setStage('');
    setPage(1);
    setRouteFilters((previous) => {
      const next = { ...previous };
      for (const key of ['lifecycle', 'unassigned', 'withoutFollowup', 'hasOpenDeal'])
        delete next[key];
      if (value === 'lead' || value === 'qualified') next.lifecycle = value;
      if (value === 'unassigned') next.unassigned = 'true';
      if (value === 'withoutFollowup') next.withoutFollowup = 'true';
      return next;
    });
  }
  const [tag, setTag] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [routeFilters, setRouteFilters] = useState<Record<string, string>>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
      filters: Record<string, string> = {};
    for (const key of ['ownerId', 'source', 'createdFrom', 'createdTo']) {
      const v = q.get(key);
      if (v !== null) filters[key] = v;
    }
    const preset = q.get('preset');
    if (preset === 'leads') filters.lifecycle = 'lead';
    if (preset === 'qualified') filters.lifecycle = 'qualified';
    if (preset === 'unassigned') filters.unassigned = 'true';
    if (preset === 'unattended') filters.withoutFollowup = 'true';
    if (preset === 'openDeals') filters.hasOpenDeal = 'true';
    setRouteFilters(filters);
    setQuickFilter(
      filters.unassigned
        ? 'unassigned'
        : filters.withoutFollowup
          ? 'withoutFollowup'
          : filters.lifecycle || '',
    );
    if (q.get('create') === 'true') {
      setShowCreate(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('create');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);
  const [contactDraft, setContactDraft] = useState<Contact | null>(null);
  const editBody = useCrmEditBody();
  const createRequestId = useRef('');
  const [contactDirty, setContactDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  function closeContact() {
    if (busy) return;
    if (contactDirty) {
      setConfirmClose(true);
      return;
    }
    setShowCreate(false);
    setEdit(null);
  }
  function discardContact() {
    createRequestId.current = '';
    setContactDirty(false);
    setConfirmClose(false);
    setShowCreate(false);
    setEdit(null);
  }
  const [selected, setSelected] = useState<Contact | null>(null);
  const [recordSection, setRecordSection] = useState('overview');
  const [profileDirty, setProfileDirty] = useState(false);
  const hasDraft = contactDirty || profileDirty;
  function confirmDiscard() {
    return !hasDraft || window.confirm(t('تجاهل التعديلات غير المحفوظة؟', 'Discard unsaved changes?'));
  }
  useCrmDraftGuard(hasDraft, t('تجاهل التعديلات غير المحفوظة؟', 'Discard unsaved changes?'), () => {
    setProfileDirty(false);
    discardContact();
  });
  function openRecord(contact: Contact) {
    const url = new URL(location.href);
    url.searchParams.set('contact', contact.id);
    history.pushState(history.state, '', url);
    setRecordSection('overview');
    setSelected(contact);
  }
  function closeRecord() {
    if (!confirmDiscard()) return;
    setProfileDirty(false);
    const url = new URL(location.href);
    url.searchParams.delete('contact');
    url.searchParams.delete('section');
    history.replaceState(history.state, '', url);
    setSelected(null);
  }
  useEffect(() => {
    let revision = 0;
    function readRecord() {
      const request = ++revision;
      const query = new URLSearchParams(location.search);
      const id = query.get('contact');
      setRecordSection(query.get('section') === 'tasks' ? 'tasks' : 'overview');
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        setSelected(null);
        return;
      }
      api<Contact>('/crm/contacts/' + id)
        .then((contact) => {
          if (request === revision && new URLSearchParams(location.search).get('contact') === id)
            setSelected(contact);
        })
        .catch((error) => {
          if (request === revision && new URLSearchParams(location.search).get('contact') === id)
            setError(error.message);
        });
    }
    readRecord();
    window.addEventListener('popstate', readRecord);
    return () => {
      revision++;
      window.removeEventListener('popstate', readRecord);
    };
  }, []);
  const [viewMode, setViewMode] = useState('list');
  const [sort, setSort] = useState('latest');
  const [pageSize, setPageSize] = useState(10);
  const filter = new URLSearchParams({
    ...routeFilters,
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
  const contactsPath = `/crm/contacts?${filter}&page=${page}&limit=${pageSize}&sort=${sort}`;
  const contacts = useData<{ items: Contact[]; total: number }>(
    contactsPath,
    { items: [], total: 0 },
  );
  const [selectionPath, setSelectionPath] = useState('');
  const canSelect = canManage && !contacts.loading && !contacts.error && contacts.loadedPath === contactsPath;
  const bulkContacts = canSelect && selectionPath === contactsPath
    ? contacts.data.items.filter((contact) => selectedBulkIds.includes(contact.id))
    : [];
  const bulkIds = bulkContacts.map((contact) => contact.id);
  function selectBulk(update: (ids: string[]) => string[]) {
    if (!canSelect) return;
    setSelectionPath(contactsPath);
    setBulkIds((ids) => update(selectionPath === contactsPath ? ids : []));
  }
  useEffect(() => {
    setBulkIds([]);
  }, [contactsPath]);
  const editContact = (contact: Contact) => {
    setEdit(contact.id);
    setContactDraft(contact);
    setContactDirty(false);
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
  const fields = useData<ContactField[]>('/crm/fields', []);
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
      if (path.startsWith('/crm/contacts')) window.dispatchEvent(new Event('boat:crm-changed'));
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
  const exportOptions = [
    ['name', t('الاسم', 'Name')],
    ['email', t('البريد الإلكتروني', 'Email')],
    ['phone', t('الهاتف', 'Phone')],
    ['lifecycle', t('مرحلة العميل', 'Customer lifecycle')],
    ['tags', t('الوسوم', 'Tags')],
    ['owner_id', t('معرّف المسؤول', 'Owner ID')],
    ['lists', t('القوائم', 'Lists')],
    ['sequences', t('التسلسلات', 'Sequences')],
    ['consents', t('الموافقات التسويقية', 'Marketing consent')],
    ['created_at', t('تاريخ الإضافة', 'Added')],
    ['updated_at', t('آخر تحديث', 'Last updated')],
    ['archived_at', t('تاريخ الأرشفة', 'Archived at')],
    ...fields.data.map((field) => ['attribute:' + field.key, field.label]),
    ['attributes', t('كل بيانات الحقول المخصصة', 'All custom field data')],
  ];
  async function exportContacts() {
    if (exportPending.current || !exportFields.length) return;
    exportPending.current = true;
    setExporting(true);
    setExportError('');
    try {
      const r = await api<{ items: Contact[]; total: number }>(`/crm/contacts/export?${filter}`);
      if (r.total > r.items.length)
        throw new Error(
          t(
            'ضيّق التصفية إلى 10000 جهة اتصال أو أقل.',
            'Narrow the filter to 10,000 contacts or fewer.',
          ),
        );
      const headers = exportOptions.map(([key]) => key).filter((key) => exportFields.includes(key));
      const rows = r.items.map((contact) => Object.fromEntries(headers.map((key) => {
        if (key === 'attributes') return [key, JSON.stringify(contact.attributes ?? {})];
        if (key.startsWith('attribute:')) {
          const value = contact.attributes?.[key.slice('attribute:'.length)];
          return [key, value && typeof value === 'object' ? JSON.stringify(value) : value];
        }
        const value = contact[key as keyof Contact];
        return [key, ['lists', 'sequences', 'consents'].includes(key)
          ? JSON.stringify(value ?? [])
          : value];
      })));
      download('contacts.csv', exportCsv(rows, headers));
      setExportOpen(false);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      exportPending.current = false;
      setExporting(false);
    }
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tabs = [
    ['contacts', 'جهات الاتصال', 'Contacts'],
    ['pipeline-settings', 'خطوط المبيعات', 'Sales pipelines'],
    ['config', 'الحقول والشرائح', 'Fields & segments'],
  ];
  return (
    <main className={`${styles.page} ${design.workspace}`}>
      {selected && (
        <section className={product.record} aria-label={t('ملف العميل', 'Customer profile')}>
          <header>
            <button className="btn" type="button" onClick={closeRecord}>
              {t('العودة للعملاء', 'Back to customers')}
            </button>
          </header>
          <SubscriberProfile
            key={selected.id + recordSection}
            contactId={selected.id}
            initialTab={recordSection}
            canManage={canManage}
            onDraftChange={setProfileDirty}
            onChanged={() => {
              void contacts.reload();
              void summary.reload();
            }}
          />
        </section>
      )}
      <div className={product.list} hidden={!!selected}>
        <header className={`${styles.heading} ${design.heading}`}>
          <div>
            <h1>
              <span className={design.headingIcon}>
                <NavIcon name="crm" />
              </span>
              {initialTab === 'config'
                ? t('الإعدادات المتقدمة', 'Advanced settings')
                : t('العملاء', 'Customers')}
            </h1>
          </div>
          <div className={styles.headActions}>
            {tab === 'contacts' && (
              <Link className="btn" href="/dashboard/crm/tasks?ownerId=me">
                <NavIcon name="calendar" />
                {t('مهامي', 'My tasks')}
              </Link>
            )}
            <button
              className="btn btn-primary"
              onClick={() => {
                setEdit(null);
                setContactDraft(null);
                setShowCreate(true);
                setTab('contacts');
              }}
            >
              <NavIcon name="plus" />
              {t('إضافة عميل', 'Add customer')}
            </button>
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
                      setExportError('');
                      setExportOpen(true);
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
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setHeadMenu(null);
                        setDuplicateOpen(true);
                      }}
                    >
                      {t('ملفات مكررة ودمج', 'Duplicates and merge')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setHeadMenu(null);
                      refresh();
                    }}
                  >
                    {t('تحديث القائمة', 'Refresh list')}
                  </button>
                  <Link href="/dashboard/crm/pipeline">{t('فرص البيع', 'Pipeline')}</Link>
                  <Link href="/dashboard/crm/tasks">{t('المتابعات', 'Follow-ups')}</Link>
                  <Link href="/dashboard/crm/advanced">{t('الإعدادات المتقدمة', 'Advanced settings')}</Link>
                  <Link href="/dashboard/crm/lists">{t('القوائم', 'Lists')}</Link>
                </div>
              )}
            </div>
          </div>
        </header>
        {tab !== 'contacts' && (
          <nav className={styles.navigation}>
            <button className="btn" onClick={() => setTab('contacts')}>
              {t('العودة للعملاء', 'Back to customers')}
            </button>
            <span>{t(...(tabs.find(([key]) => key === tab)?.slice(1) as [string, string]))}</span>
          </nav>
        )}
        <Dialog
          open={exportOpen}
          onClose={() => { if (!exporting) setExportOpen(false); }}
          title={t('حقول تصدير العملاء', 'Customer export fields')}
        >
          <form onSubmit={(event) => { event.preventDefault(); void exportContacts(); }}>
            <fieldset className={product.formFields} disabled={exporting}>
              <legend>{t('الحقول', 'Fields')}</legend>
              {exportOptions.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={exportFields.includes(key)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setExportFields((current) => checked
                        ? [...current, key]
                        : current.filter((field) => field !== key));
                    }}
                  />{' '}{label}
                </label>
              ))}
            </fieldset>
            {exportError && <p role="alert">{exportError}</p>}
            <button type="submit" className="btn" disabled={exporting || !exportFields.length}>
              {exporting ? t('جارٍ التصدير…', 'Exporting…') : t('تنزيل CSV', 'Download CSV')}
            </button>
          </form>
        </Dialog>
        <Dialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title={t('تصدير واستيراد العملاء', 'Customer import and export')}
        >
          {canManage && (
            <>
              <CrmImport />
              <CrmJobs />
            </>
          )}
        </Dialog>
        <Dialog
          open={duplicateOpen}
          onClose={() => {
            if (!busy) setDuplicateOpen(false);
          }}
          title={t('ملفات مكررة ودمج', 'Duplicates and merge')}
        >
          {canManage && duplicateOpen && <ContactLifecycle act={act} busy={busy} />}
        </Dialog>
        {(error ||
          contacts.error ||
          fields.error ||
          segments.error) && (
          <p className="notice error" role="alert">
            {error ||
              contacts.error ||
                      fields.error ||
              segments.error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {tab === 'contacts' &&
          Object.keys(routeFilters).some(
            (key) => !quickFilter || !['lifecycle', 'unassigned', 'withoutFollowup'].includes(key),
          ) && (
            <p className="notice" role="status">
              {t('فلاتر نشطة', 'Active filters')}{' '}
              <button
                className="btn"
                onClick={() => {
                  setRouteFilters({});
                  setQuickFilter('');
                  setPage(1);
                }}
              >
                {t('مسح فلاتر العرض', 'Clear view filters')}
              </button>
            </p>
          )}
        {tab === 'contacts' && (
          <>
            <div className={`${styles.searchTools} ${design.searchBar}`}>
              <NavIcon name="search" />
              <input
                type="search"
                aria-label={t('بحث عن عميل', 'Search customers')}
                placeholder={t(
                  'بحث بالاسم أو الهاتف أو البريد…',
                  'Search by name, phone or email…',
                )}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <button
                type="button"
                className="btn"
                aria-expanded={filtersOpen}
                aria-controls="customer-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <NavIcon name="filter" />
                {t('التصفية', 'Filters')}
              </button>
            </div>
            <div
              className={design.quickFilters}
              role="group"
              aria-label={t('فلاتر سريعة', 'Quick filters')}
            >
              {[
                ['', t('الكل', 'All')],
                ['lead', t('عملاء محتملون', 'Leads')],
                ['qualified', t('عملاء مؤهلون', 'Qualified')],
                ['unassigned', t('دون مسؤول', 'Unassigned')],
                ['withoutFollowup', t('دون متابعة مفتوحة', 'No open follow-up')],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className="btn"
                  aria-pressed={archiveFilter === 'active' && quickFilter === value && !stage}
                  onClick={() => {
                    setArchiveFilter('active');
                    chooseQuickFilter(value);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="btn"
                aria-pressed={archiveFilter === 'archived'}
                onClick={() => {
                  chooseQuickFilter('');
                  setArchiveFilter('archived');
                }}
              >
                {t('الأرشيف', 'Archived')}
              </button>
            </div>
            <div className={design.filterPanel} id="customer-filters" hidden={!filtersOpen}>
              <section
                className={styles.filters}
                aria-label={t('تصفية العملاء', 'Customer filters')}
              >
                <select
                  aria-label={t('القناة', 'Channel')}
                  value={filterChannels.data.find((c) => c.id === channelId)?.type || ''}
                  onChange={(e) => {
                    setChannelId(
                      filterChannels.data.find((c) => c.type === e.target.value)?.id || '',
                    );
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
                  aria-label={t('حالة العميل', 'Customer status')}
                  value={archiveFilter}
                  onChange={(e) => setArchiveFilter(e.target.value)}
                >
                  <option value="active">{t('نشط', 'Active')}</option>
                  <option value="archived">{t('مؤرشف', 'Archived')}</option>
                  <option value="all">{t('الكل', 'All Status')}</option>
                </select>
              </section>
              <div className={styles.filterActions}>
                <button className="btn" type="button" onClick={() => setToolsOpen(true)}>
                  {t('إضافة فلتر', 'Add Filter')}
                </button>
                <span>
                  {contacts.data.total} {t('نتيجة', 'customers')}
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setQ('');
                    setRouteFilters({});
                    setQuickFilter('');
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
                {t('قوائم العملاء', 'Customer lists')}
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
                  <select
                    value={sequenceStatus}
                    onChange={(e) => setSequenceStatus(e.target.value)}
                  >
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
              <div className="form-actions">
                <select
                  aria-label={t('ترتيب العملاء', 'Sort customers')}
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
                  <span className={design.viewLabel}>{t('عرض القائمة', 'List view')}</span>
                  <NavIcon name="list" />
                </button>
                <button
                  className="btn"
                  type="button"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                >
                  <span className={design.viewLabel}>{t('عرض البطاقات', 'Card view')}</span>
                  <NavIcon name="grid" />
                </button>
              </div>
              <details className="col-picker">
                <DisclosureSummary className="btn">{t('الأعمدة', 'Columns')}</DisclosureSummary>
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

              {canManage && bulkIds.length > 0 && (
                <form
                  className="card space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const lifecycle = String(data.get('lifecycle') || '');
                    const owner = String(data.get('owner') || '');
                    if (!canSelect || !bulkIds.length || busy || bulkPending.current) return;
                    const scope = t(
                      `تطبيق التعديلات على ${bulkIds.length} عميل محدد في الصفحة ${page}؟`,
                      `Apply changes to ${bulkIds.length} selected customers on page ${page}?`,
                    );
                    if (!window.confirm(scope + '\n' + bulkContacts.map((contact) => contact.name).join('، '))) return;
                    bulkPending.current = true;
                    try {
                      await act('/crm/contacts/bulk', {
                        ids: bulkIds,
                        expectedVersions: Object.fromEntries(bulkContacts.map((contact) => [contact.id, contact.updated_at])),
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
                    } finally {
                      bulkPending.current = false;
                    }
                  }}
                >
                  <h2>
                    {t('تعديل العملاء المحددين', 'Edit selected contacts')} ({bulkIds.length})
                  </h2>
                  <p>{t('الصفحة', 'Page')} {page} · {bulkContacts.map((contact) => contact.name).join('، ')}</p>
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
              <section className={styles.subscriberList} data-crm-customers data-view={viewMode}>
                <div className={styles.listToolbar}>
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        contacts.data.items.length > 0 &&
                        contacts.data.items.every((contact) => bulkIds.includes(contact.id))
                      }
                      disabled={!canSelect}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        selectBulk(() => checked ? contacts.data.items.map((contact) => contact.id) : []);
                      }}
                    />
                    {t('تحديد عملاء الصفحة', 'Select this page')}
                  </label>
                  <span>
                    {bulkIds.length > 0 ? `${bulkIds.length} ${t('محدد', 'selected')}` : ''}
                  </span>
                  {canManage && bulkIds.length > 0 && (
                    <button className="btn" onClick={() => setToolsOpen(true)}>
                      {t('إجراءات جماعية', 'Bulk Actions')}
                      <NavIcon name="chevron" />
                    </button>
                  )}
                  <button className="btn" onClick={() => setToolsOpen(true)}>
                    {t('خيارات', 'Options')}
                    <NavIcon name="chevron" />
                  </button>
                </div>
                <div className={styles.tableScroll}>
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th>{t('تحديد', 'Select')}</th>
                        <th>{t('العميل', 'Customer')}</th>
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
                              disabled={!canSelect || (!bulkIds.includes(c.id) && bulkIds.length >= 100)}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                selectBulk((ids) => checked ? [...ids, c.id] : ids.filter((id) => id !== c.id));
                              }}
                            />
                          </td>
                          <td>
                            <div className={styles.identity}>
                              <span
                                className={styles.rowAvatar}
                                data-customer-avatar
                                aria-hidden="true"
                              >
                                {c.name.slice(0, 2)}
                              </span>
                              <div>
                                <button
                                  className={styles.subscriberName}
                                  data-customer-name
                                  onClick={() => {
                                    openRecord(c);
                                  }}
                                >
                                  {c.name}
                                </button>
                                {cols.includes('contact') && (
                                  <small dir="ltr">{c.phone || c.email || '—'}</small>
                                )}
                                {cols.includes('tags') && (
                                  <div className={styles.inlineTags} data-customer-tags>
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
                            <div className={styles.statePills} data-customer-state>
                              <span data-tone={c.archived_at ? 'muted' : 'green'}>
                                {c.archived_at ? t('مؤرشف', 'Archived') : t('نشط', 'Active')}
                              </span>
                              {cols.includes('tags') && (
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
                              )}
                              {cols.includes('lifecycle') && (
                                <small>{statusLabel(c.lifecycle, t)}</small>
                              )}
                              <small className={design.customerOwner}>
                                <NavIcon name="user" />
                                {team.data.members.find((member) => member.user_id === c.owner_id)
                                  ?.full_name ||
                                  (c.owner_id ? t('—', '—') : t('دون مسؤول', 'Unassigned'))}
                              </small>
                            </div>
                          </td>
                          <td>
                            <div className={styles.rowActions} data-customer-actions>
                              <button
                                type="button"
                                className="btn"
                                aria-label={t('فتح ملف ', 'Open profile for ') + c.name}
                                onClick={() => {
                                  openRecord(c);
                                }}
                              >
                                <NavIcon name="user" />
                                <span>{t('فتح الملف', 'Open profile')}</span>
                              </button>
                              <button
                                type="button"
                                className="btn"
                                aria-label={t('تعديل: ', 'Edit: ') + c.name}
                                onClick={() => editContact(c)}
                              >
                                <NavIcon name="edit" />
                                <span>{t('تعديل', 'Edit')}</span>
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
            </div>
            <details className={design.customerStats}>
              <summary>{t('إحصائيات العملاء', 'Customer statistics')}</summary>
              {summary.error && (
                <p className="notice error" role="alert">
                  {summary.error}
                </p>
              )}
              <div
                className={styles.statistics}
                aria-label={t('إحصائيات نتائج التصفية', 'Filtered customer statistics')}
              >
                {(
                  [
                    ['total', t('العملاء', 'Customers')],
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
                    <strong>
                      {summary.loading ? '…' : summary.error ? '—' : summary.data[key]}
                    </strong>
                    <small>
                      {key === 'total'
                        ? t('ضمن نتائج التصفية', 'Within current filters')
                        : `${summary.data.total ? Math.round((summary.data[key] / summary.data.total) * 100) : 0}% ${t('من الإجمالي', 'of total')}`}
                    </small>
                  </article>
                ))}
              </div>
            </details>
            <Dialog
              open={showCreate || !!edit}
              onClose={closeContact}
              title={edit ? t('تعديل العميل', 'Edit contact') : t('إضافة عميل', 'Add contact')}
              className={product.editorDialog}
            >
              {(showCreate || edit) && (
                <ContactEditor
                  key={edit || 'create'}
                  contact={contactDraft}
                  fields={fields.data}
                  members={team.data.members}
                  onCancel={closeContact}
                  onDirty={() => setContactDirty(true)}
                  onSave={async (draft) => {
                    if (!edit && !createRequestId.current) createRequestId.current = crypto.randomUUID();
                    const saved = await act(
                      '/crm/contacts' + (edit ? '/' + edit + '/profile' : ''),
                      edit ? editBody(edit, draft) : { ...draft, requestId: createRequestId.current },
                      edit ? 'PATCH' : 'POST',
                    );
                    discardContact();
                    setContactDraft(null);
                    if (!edit) openRecord(saved as Contact);
                  }}
                />
              )}
            </Dialog>
            <Dialog
              open={confirmClose}
              onClose={() => setConfirmClose(false)}
              title={t('تجاهل التغييرات؟', 'Discard changes?')}
            >
              <p>
                {t(
                  'لم يتم حفظ بيانات العميل. يمكنك العودة لإكمالها أو تجاهل التعديلات.',
                  'This contact has unsaved changes. Keep editing or discard your changes.',
                )}
              </p>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => setConfirmClose(false)}>
                  {t('متابعة التعديل', 'Keep editing')}
                </button>
                <button className="btn" onClick={discardContact}>
                  {t('تجاهل التغييرات', 'Discard changes')}
                </button>
              </div>
            </Dialog>
          </>
        )}
        {tab === 'pipeline-settings' && canManage && (
          <>
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
                  <DisclosureSummary className="cursor-pointer font-semibold">
                    {pipeline.name}
                  </DisclosureSummary>
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
                      const stages = form.getAll('stage').map((value) => String(value).trim());
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
                    <PipelineStages
                      key={JSON.stringify(pipeline.stages)}
                      original={pipeline.stages}
                    />
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
            {canManage && (
              <form
                className="card stack"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await act('/crm/pipelines', {
                      name: form.get('name'),
                      stages: form.getAll('stage').map((value) => String(value).trim()),
                    });
                  } catch {
                    // The action banner displays the error.
                  }
                }}
              >
                <h2>{t('خط مبيعات جديد', 'New pipeline')}</h2>
                <label className="field">
                  {t('الاسم', 'Name')}
                  <input name="name" maxLength={100} required />
                </label>
                <PipelineStages />
                <button className="btn btn-primary" disabled={busy}>
                  {t('إنشاء خط مبيعات', 'Create pipeline')}
                </button>
              </form>
            )}
          </>
        )}
        {tab === 'config' && (
          <>
            <div className="form-actions">
              {canManage && <button className="btn" onClick={() => setTab('pipeline-settings')}>
                {t('إعداد خطوط المبيعات', 'Configure pipelines')}
              </button>}
              <Link className="btn" href="/dashboard/automations">
                {t('إدارة الأتمتة', 'Manage automations')}
              </Link>
              <Link className="btn" href="/dashboard/crm/lists">
                {t('قوائم العملاء', 'Contact lists')}
              </Link>
            </div>
            {canManage && (
              <>
                <details className={product.group}>
                  <summary>{t('تقييم العملاء', 'Customer scoring')}</summary>
                  <CrmScoring />
                </details>
                <details className={product.group}>
                  <summary>{t('الشرائح الذكية', 'Smart segments')}</summary>
                  <CrmSegments />
                </details>
                <details className={product.group}>
                  <summary>{t('أتمتة CRM', 'CRM automation')}</summary>
                  <CrmAutomation />
                </details>
              </>
            )}
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
            {canManage && <CustomFieldForm onSave={(body) => act('/crm/fields', body)} />}
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
                  {x.kind}: {x.value} · {x.count}
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

      </div>
    </main>
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
        <DisclosureSummary>
          {t('متقدم: مفتاح التكامل', 'Advanced: integration key')}
        </DisclosureSummary>
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
