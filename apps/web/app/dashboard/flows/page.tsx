'use client';
import { statusLabel } from '../../../components/product/status';

import Link from 'next/link';
import AccountPanel from '../../../components/workspace/AccountPanel';
import { AccountWorkspaceContext } from '../../../components/product/AccountWorkspaceContext';
import {
  ACCOUNT_GROUPS,
  ACCOUNT_SECTION_LABELS,
  accountSection,
} from '../../../lib/account-sections';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useData } from '../../../components/business/useData';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import { useLocale } from '../../../components/product/locale';
import { useChannelContext } from '../../../components/product/useChannelContext';
import { api } from '../../../lib/api';
import { channelHref, matchesFlowChannel } from '../../../lib/channel-context';
import styles from './manager.module.css';

type Channel = { id: string; name: string; type: string; status: string; external_id?: string };
type Flow = {
  id: string;
  name: string;
  status: 'draft' | 'published';
  published_version: number | null;
  updated_at: string;
  folder_name: string | null;
  channel_ids: string[];
  node_types?: string[];
  triggers: { type: string; keywords?: string[] }[];
};
const channelTypes = ['whatsapp', 'telegram', 'facebook', 'instagram', 'web'];

export default function BotManager() {
  const { t, language } = useLocale();
  const channels = useData<Channel[]>('/channels', []);
  const flows = useData<Flow[]>('/flows', []);
  const [channelId, setChannelId] = useChannelContext();
  const [section, setSection] = useState('bot_reply');
  useEffect(() => {
    const read = () => {
      const next = accountSection(window.location.search);
      if (['autoresponder', 'integrations'].includes(next)) {
        window.location.replace('/dashboard/settings?tab=integrations&action=emailauto-tab');
        return;
      }
      setSection(next);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const selectSection = (value: string) => {
    if (['autoresponder', 'integrations'].includes(value)) {
      window.location.assign('/dashboard/settings?tab=integrations&action=emailauto-tab');
      return;
    }
    setSection(value);
    const url = new URL(window.location.href);
    url.searchParams.set('section', value);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  };
  const activeGroup = ACCOUNT_GROUPS.find((group) => group.sections.includes(section));
  const isFlowList = ['bot_reply', 'entry_points'].includes(section);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelType, setChannelType] = useState('all');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('*');
  const [sort, setSort] = useState<{ key: 'name' | 'id' | 'updated_at'; ascending: boolean }>({
    key: 'updated_at',
    ascending: false,
  });
  const sortBy = (key: 'name' | 'id' | 'updated_at') =>
    setSort((current) => ({ key, ascending: current.key === key ? !current.ascending : true }));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Flow | null>(null);
  const [deleting, setDeleting] = useState<Flow | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    if (
      !channels.loading &&
      channels.data.length &&
      !new URLSearchParams(window.location.search).has('channelId')
    )
      setChannelId(channels.data[0].id);
  }, [channels.loading, channels.data, setChannelId]);
  const selected = channels.data.find((c) => c.id === channelId);
  const visibleChannels = channels.data.filter(
    (c) =>
      (channelType === 'all' || channelType === c.type) &&
      `${c.name} ${c.external_id ?? ''}`.toLowerCase().includes(channelSearch.toLowerCase()),
  );
  const filtered = flows.data
    .filter(
      (f) =>
        (section === 'entry_points'
          ? f.node_types?.some((type) => ['user_input', 'question'].includes(type))
          : true) &&
        matchesFlowChannel(f.channel_ids, channelId) &&
        (folder === '*' || (f.folder_name ?? '') === folder) &&
        f.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort.ascending ? 1 : -1) *
        a[sort.key].localeCompare(b[sort.key], language, { numeric: true }),
    );
  const folders = [
    ...new Set(flows.data.map((f) => f.folder_name).filter((f): f is string => !!f)),
  ];
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => {
    setPage(1);
    setOptionsOpen(false);
  }, [search, folder, channelId, pageSize, section, sort]);
  useEffect(() => {
    if (!optionsOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('[data-flow-actions]')) setOptionsOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOptionsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [optionsOpen]);

  async function act(run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setOptionsOpen(false);
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError(t('اختر بوتًا أولًا.', 'Select a bot first.'));
      return;
    }
    const data = new FormData(event.currentTarget);
    void act(async () => {
      const flow = await api<Flow>('/flows', {
        method: 'POST',
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          language,
          channelIds: channelId ? [channelId] : [],
          initialNodeType: section === 'entry_points' ? 'user_input' : 'message',
        }),
      });
      window.location.assign(channelHref(`/dashboard/flows/${flow.id}`, channelId));
    });
  }
  async function exportFlow(flow: Flow) {
    const data = await api(`/flows/${flow.id}/export`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `boat-flow-${flow.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFlow(file: File) {
    if (file.size > 1024 * 1024)
      throw new Error(t('حجم الملف يتجاوز 1 ميجابايت.', 'File exceeds 1 MB.'));
    let body: unknown;
    try {
      body = JSON.parse(await file.text());
    } catch {
      throw new Error(t('الملف ليس JSON صالحًا.', 'Invalid JSON file.'));
    }
    const flow = await api<Flow>('/flows/import', { method: 'POST', body: JSON.stringify(body) });
    window.location.assign(`/dashboard/flows/${flow.id}`);
  }
  return (
    <main className={styles.manager} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <aside className={styles.accounts} aria-label={t('البوتات والحسابات', 'Bots and accounts')}>
        <header>
          <h1>{t('البوتات / الحسابات', 'Bots / Accounts')}</h1>
          <Link href="/dashboard/channels">+ {t('إضافة', 'Add Bot')}</Link>
        </header>
        <label className={styles.search}>
          <NavIcon name="search" />
          <input
            type="search"
            value={channelSearch}
            onChange={(e) => setChannelSearch(e.target.value)}
            aria-label={t('بحث في الحسابات', 'Search accounts')}
            placeholder={t('ابحث بالاسم أو الرقم…', 'Search by name or number…')}
          />
        </label>
        <div
          className={styles.channelFilters}
          role="group"
          aria-label={t('تصفية حسب القناة', 'Filter by channel')}
        >
          {['all', ...channelTypes].map((type) => (
            <button
              type="button"
              key={type}
              aria-pressed={channelType === type}
              onClick={() => setChannelType(type)}
              title={type === 'all' ? t('الكل', 'All') : type}
            >
              {type === 'all'
                ? t('الكل', 'All')
                : type === 'whatsapp'
                  ? 'WA'
                  : type === 'telegram'
                    ? 'TG'
                    : type === 'facebook'
                      ? 'f'
                      : type === 'instagram'
                        ? 'IG'
                        : 'Web'}
              <small>
                {type === 'all'
                  ? channels.data.length
                  : channels.data.filter((c) => c.type === type).length}
              </small>
            </button>
          ))}
        </div>
        <div className={styles.accountList}>
          {visibleChannels.map((c) => (
            <button
              type="button"
              className={styles.account}
              key={c.id}
              aria-pressed={channelId === c.id}
              onClick={() => setChannelId(c.id)}
            >
              <span className={styles.avatar} data-channel={c.type}>
                <NavIcon name={c.type === 'web' ? 'globe' : 'channels'} />
              </span>
              <span>
                <strong>{c.name}</strong>
                <small dir="ltr">
                  {c.type}
                  {c.external_id ? ` · ${c.external_id}` : ''}
                </small>
              </span>
            </button>
          ))}
          {channels.loading && (
            <p role="status">{t('جارٍ تحميل الحسابات…', 'Loading accounts…')}</p>
          )}
          {!channels.loading && !visibleChannels.length && (
            <p>{t('لا توجد حسابات مطابقة.', 'No matching accounts.')}</p>
          )}
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <span className={styles.avatar} data-channel={selected?.type}>
            <NavIcon name="channels" />
          </span>
          <div>
            <h2>
              {selected?.name ??
                (channelId
                  ? t('حساب غير متاح', 'Account unavailable')
                  : t('كل الحسابات', 'All accounts'))}
            </h2>
            <p>
              {selected ? (
                <>
                  <span dir="ltr">{selected.external_id || '—'}</span> ·{' '}
                  <span>{statusLabel(selected.status, t)}</span>
                </>
              ) : (
                t('إدارة الأتمتة والتدفقات', 'Manage automations and flows')
              )}
            </p>
          </div>
          <button type="button" className="btn" onClick={() => selectSection('settings')}>
            <NavIcon name="settings" />
            {t('إعدادات البوت', 'Bot Settings')}
          </button>
          <div className={styles.managerOptions} data-flow-actions>
            <button
              type="button"
              className="btn"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen(!optionsOpen)}
            >
              {t('خيارات', 'Options')} <NavIcon name="chevron" />
            </button>
            {optionsOpen && (
              <div className={styles.optionsMenu}>
                <button type="button" disabled={busy} onClick={() => importInput.current?.click()}>
                  {t('استيراد تدفق', 'Flow Import')}
                </button>
              </div>
            )}
            <input
              ref={importInput}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void act(() => importFlow(file));
              }}
            />
          </div>
        </header>
        <nav className={styles.sections} aria-label={t('أقسام الحساب', 'Account sections')}>
          {ACCOUNT_GROUPS.map((group) => (
            <button
              type="button"
              key={group.key}
              aria-pressed={activeGroup?.key === group.key}
              onClick={() => selectSection(group.sections[0])}
            >
              <NavIcon name={group.icon} />
              {t(group.ar, group.en)}
            </button>
          ))}
        </nav>
        {activeGroup && (
          <nav className={styles.subsections} aria-label={t('وظائف القسم', 'Section tools')}>
            {activeGroup.sections.map((key) => (
              <button
                type="button"
                key={key}
                aria-pressed={section === key}
                onClick={() => selectSection(key)}
              >
                {t(...ACCOUNT_SECTION_LABELS[key])}
              </button>
            ))}
          </nav>
        )}
        <AccountWorkspaceContext.Provider value={true}>
          {!isFlowList && (
            <div className={styles.panelSurface}>
              <AccountPanel
                key={`${section}:${channelId}`}
                section={section}
                channelId={channelId}
              />
            </div>
          )}
          {isFlowList && (
            <>
              <section
                className={styles.content}
                aria-labelledby="flow-list-title"
                aria-busy={flows.loading}
              >
                <header className={styles.contentHeader}>
                  <div>
                    <h2 id="flow-list-title">
                      {section === 'entry_points'
                        ? t('تدفق إدخال البيانات', 'Input Flow')
                        : t(...ACCOUNT_SECTION_LABELS[section])}
                    </h2>
                    <p>
                      {t(
                        section === 'entry_points'
                          ? 'إدارة تدفقات إدخال البيانات ونقاط الدخول.'
                          : 'إنشاء وإدارة الردود بالكلمات المفتاحية وأتمتة المحادثات.',
                        section === 'entry_points'
                          ? 'Manage input flows for data collection and entry points.'
                          : 'Create and manage keyword based replies and automate conversations.',
                      )}
                    </p>
                  </div>
                  <div className={styles.headerActions}>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || flows.loading}
                      onClick={() => void flows.reload()}
                      aria-label={t('تحديث التدفقات', 'Refresh flows')}
                    >
                      <NavIcon name="redo" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!selected || busy}
                      onClick={() => setCreating(true)}
                    >
                      + {t('إنشاء', 'Create')}
                    </button>
                  </div>
                </header>
                {(error || flows.error || channels.error) && (
                  <p role="alert" className="notice error">
                    {error || flows.error || channels.error}
                  </p>
                )}
                {channelId && !channels.loading && !selected && (
                  <p role="alert">
                    {t(
                      'الحساب المحدد غير متاح. اختر حسابًا من القائمة.',
                      'The selected account is unavailable. Choose an account from the list.',
                    )}
                  </p>
                )}
                <div className={styles.filters}>
                  {section === 'bot_reply' && (
                    <select
                      aria-label={t('المجلد', 'Folder')}
                      value={folder}
                      onChange={(e) => setFolder(e.target.value)}
                    >
                      <option value="*">{t('كل المجلدات', 'All Folders')}</option>
                      <option value="">{t('دون مجلد', 'Unfiled')}</option>
                      {folders.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  )}
                  <label className={styles.search}>
                    <NavIcon name="search" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label={t('البحث في التدفقات', 'Search flows')}
                      placeholder={t('بحث باسم التدفق…', 'Search flows…')}
                    />
                  </label>
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        {section === 'bot_reply' && (
                          <th
                            scope="col"
                            aria-sort={
                              sort.key === 'id'
                                ? sort.ascending
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button onClick={() => sortBy('id')}>
                              {t('المعرّف الفريد', 'Unique ID')} <span aria-hidden="true">↕</span>
                            </button>
                          </th>
                        )}
                        <th
                          scope="col"
                          aria-sort={
                            sort.key === 'name'
                              ? sort.ascending
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          <button onClick={() => sortBy('name')}>
                            {section === 'entry_points'
                              ? t('اسم التدفق', 'Flow Name')
                              : t('الاسم المرجعي', 'Reference Name')}{' '}
                            <span aria-hidden="true">↕</span>
                          </button>
                        </th>
                        {section === 'bot_reply' && (
                          <th
                            scope="col"
                            aria-sort={
                              sort.key === 'updated_at'
                                ? sort.ascending
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button onClick={() => sortBy('updated_at')}>
                              {t('آخر تعديل', 'Updated At')} <span aria-hidden="true">↕</span>
                            </button>
                          </th>
                        )}
                        <th scope="col">{t('الإجراءات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f, index) => (
                        <tr key={f.id}>
                          <td>{(currentPage - 1) * pageSize + index + 1}</td>
                          {section === 'bot_reply' && (
                            <td title={f.id}>
                              <span className={styles.uniqueId}>{f.id}</span>
                            </td>
                          )}
                          <td>
                            <Link
                              className={styles.flowName}
                              href={channelHref(`/dashboard/flows/${f.id}`, channelId)}
                            >
                              {f.name}
                            </Link>
                          </td>
                          {section === 'bot_reply' && (
                            <td>
                              <time dateTime={f.updated_at}>
                                {new Date(f.updated_at).toLocaleDateString(
                                  language === 'ar' ? 'ar-EG' : 'en-GB',
                                )}
                              </time>
                            </td>
                          )}
                          <td>
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                title={t('نسخ التدفق', 'Duplicate')}
                                aria-label={`${t('نسخ التدفق', 'Duplicate')}: ${f.name}`}
                                onClick={() =>
                                  void act(async () => {
                                    await api(`/flows/${f.id}/duplicate`, { method: 'POST' });
                                    await flows.reload();
                                  })
                                }
                              >
                                <NavIcon name="copy" />
                              </button>

                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void act(() => exportFlow(f))}
                                aria-label={`${t('تصدير', 'Export')}: ${f.name}`}
                                title={t('تصدير', 'Export')}
                              >
                                <NavIcon name="export" />
                              </button>
                              <Link
                                className="btn"
                                href={channelHref(`/dashboard/flows/${f.id}`, channelId)}
                                aria-label={`${t('تعديل', 'Edit')}: ${f.name}`}
                                title={t('تعديل', 'Edit')}
                              >
                                <NavIcon name="edit" />
                              </Link>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                title={t('حذف', 'Delete')}
                                aria-label={`${t('حذف', 'Delete')}: ${f.name}`}
                                onClick={() => setDeleting(f)}
                              >
                                <NavIcon name="trash" />
                              </button>
                              <button
                                type="button"
                                className="btn"
                                title={t('نقل إلى مجلد', 'Move to Folder')}
                                aria-label={`${t('نقل إلى مجلد', 'Move to Folder')}: ${f.name}`}
                                onClick={() => setMoving(f)}
                              >
                                <NavIcon name="folder" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td colSpan={section === 'entry_points' ? 3 : 5} className={styles.empty}>
                            {flows.loading
                              ? t('جارٍ تحميل التدفقات…', 'Loading flows…')
                              : flows.error
                                ? t(
                                    'تعذر تحميل التدفقات. أعد المحاولة.',
                                    'Flows could not be loaded. Try again.',
                                  )
                                : t(
                                    'لا توجد تدفقات مطابقة. أنشئ تدفقًا أو غيّر التصفية.',
                                    'No matching flows. Create a flow or change the filters.',
                                  )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <footer className={styles.pagination}>
                  <label>
                    {t('الصفوف', 'Rows')}{' '}
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <span>
                    {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–
                    {Math.min(currentPage * pageSize, filtered.length)} / {filtered.length}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="btn"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {t('السابق', 'Previous')}
                    </button>
                    <span aria-live="polite">
                      {currentPage} / {pages}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={currentPage >= pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {t('التالي', 'Next')}
                    </button>
                  </div>
                </footer>
              </section>
            </>
          )}
        </AccountWorkspaceContext.Provider>
      </div>
      <Dialog
        open={creating}
        onClose={() => {
          if (!busy) setCreating(false);
        }}
        title={t('إنشاء تدفق', 'Create Flow')}
      >
        <form className={styles.form} onSubmit={create}>
          <p>
            {selected
              ? `${t('الحساب', 'Account')}: ${selected.name}`
              : t(
                  'سيكون التدفق متاحًا لكل الحسابات، ويمكن تخصيص قنواته من إعدادات المصمم قبل النشر.',
                  'The flow will be available to all accounts. You can restrict channels in builder settings before publishing.',
                )}
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <label>
            {t('اسم التدفق', 'Flow name')}
            <input
              name="name"
              required
              maxLength={120}
              pattern=".*\S.*"
              autoFocus
              placeholder={t('مثال: القائمة الرئيسية', 'Example: Main menu')}
            />
          </label>
          <div className={styles.formActions}>
            <button className="btn btn-primary" disabled={busy || !selected}>
              {busy ? t('جارٍ الإنشاء…', 'Creating…') : t('فتح المصمم', 'Open Builder')}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!moving}
        onClose={() => {
          if (!busy) setMoving(null);
        }}
        title={t('نقل إلى مجلد', 'Move to Folder')}
      >
        {moving && (
          <form
            key={moving.id}
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('folder') ?? '').trim();
              void act(async () => {
                await api(`/flows/${moving.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    folderName: name || null,
                    expectedUpdatedAt: moving.updated_at,
                  }),
                });
                setMoving(null);
                await flows.reload();
              });
            }}
          >
            {error && <p role="alert">{error}</p>}
            <label>
              {t('اسم المجلد — فارغ للإزالة', 'Folder name — leave empty to remove')}
              <input name="folder" defaultValue={moving.folder_name ?? ''} maxLength={80} />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {t('حفظ', 'Save')}
            </button>
          </form>
        )}
      </Dialog>
      <Dialog
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('حذف التدفق', 'Delete Flow')}
      >
        {deleting && (
          <div className={styles.form}>
            <p>
              {t('هل تريد حذف هذا التدفق؟', 'Delete this flow?')} <strong>{deleting.name}</strong>
            </p>
            {error && <p role="alert">{error}</p>}
            <div className={styles.formActions}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api(`/flows/${deleting.id}`, { method: 'DELETE' });
                    setDeleting(null);
                    await flows.reload();
                  })
                }
              >
                {t('حذف', 'Delete')}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </main>
  );
}
