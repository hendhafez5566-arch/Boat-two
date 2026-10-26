'use client';

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
type Template = { id: string; name: string; description: string };
const channelTypes = ['whatsapp', 'telegram', 'facebook', 'instagram', 'web'];

export default function BotManager() {
  const { t, language } = useLocale();
  const channels = useData<Channel[]>('/channels', []);
  const flows = useData<Flow[]>('/flows', []);
  const templates = useData<Template[]>('/flows/templates?language=' + language, []);
  const [channelId, setChannelId] = useChannelContext();
  const [section, setSection] = useState('bot_reply');
  useEffect(() => {
    const read = () => setSection(accountSection(window.location.search));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const selectSection = (value: string) => {
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
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Flow | null>(null);
  const [deleting, setDeleting] = useState<Flow | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const selected = channels.data.find((c) => c.id === channelId);
  const visibleChannels = channels.data.filter(
    (c) =>
      (channelType === 'all' || channelType === c.type) &&
      `${c.name} ${c.external_id ?? ''}`.toLowerCase().includes(channelSearch.toLowerCase()),
  );
  const filtered = flows.data.filter(
    (f) =>
      (section === 'entry_points'
        ? f.node_types?.some((type) => ['user_input', 'question'].includes(type))
        : true) &&
      matchesFlowChannel(f.channel_ids, channelId) &&
      (folder === '*' || (f.folder_name ?? '') === folder) &&
      (status === 'all' || f.status === status) &&
      f.name.toLowerCase().includes(search.toLowerCase()),
  );
  const folders = [
    ...new Set(flows.data.map((f) => f.folder_name).filter((f): f is string => !!f)),
  ];
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => {
    setPage(1);
    setMenu(null);
  }, [search, folder, status, channelId, pageSize, section]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('[data-flow-actions]')) setMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);

  async function act(run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMenu(null);
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
    const data = new FormData(event.currentTarget);
    void act(async () => {
      const flow = await api<Flow>('/flows', {
        method: 'POST',
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          language,
          channelIds: channelId ? [channelId] : [],
          initialNodeType: section === 'entry_points' ? 'user_input' : 'message',
          ...(data.get('templateId') ? { templateId: data.get('templateId') } : {}),
          isComponent: data.get('isComponent') === 'on',
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
  const href = (path: string) => channelHref('/dashboard/' + path, channelId);
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
          <button
            type="button"
            className={styles.account}
            aria-pressed={!channelId}
            onClick={() => setChannelId('')}
          >
            <span className={styles.avatar}>
              <NavIcon name="flows" />
            </span>
            <span>
              <strong>{t('كل الحسابات', 'All accounts')}</strong>
              <small>{t('عرض جميع التدفقات', 'Show every flow')}</small>
            </span>
          </button>
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
                  <span>{selected.type}</span> · <span>{selected.status}</span>
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
            <AccountPanel key={`${section}:${channelId}`} section={section} channelId={channelId} />
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
                    <h2 id="flow-list-title">{t(...ACCOUNT_SECTION_LABELS[section])}</h2>
                    <p>
                      {t(
                        'أنشئ ردودًا تلقائية وتدفقات محادثة لهذا الحساب.',
                        'Create automated replies and conversation flows for this account.',
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
                  <select
                    aria-label={t('الحالة', 'Status')}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">{t('كل الحالات', 'All statuses')}</option>
                    <option value="published">{t('منشور', 'Published')}</option>
                    <option value="draft">{t('مسودة', 'Draft')}</option>
                  </select>
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">{t('اسم التدفق', 'Reference Name')}</th>
                        <th scope="col">{t('الحالة', 'Status')}</th>
                        <th scope="col">{t('آخر تعديل', 'Updated At')}</th>
                        <th scope="col">{t('الإجراءات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f, index) => (
                        <tr key={f.id}>
                          <td>{(currentPage - 1) * pageSize + index + 1}</td>
                          <td>
                            <Link
                              className={styles.flowName}
                              href={channelHref(`/dashboard/flows/${f.id}`, channelId)}
                            >
                              {f.name}
                            </Link>
                            <small className={styles.flowDetail}>
                              {f.triggers
                                .filter((x) => x.type === 'keyword')
                                .flatMap((x) => x.keywords ?? [])
                                .join(' · ') || t('تدفق محادثة', 'Conversation flow')}
                              {!f.channel_ids.length &&
                                ` · ${t('متاح لكل الحسابات', 'Available to all accounts')}`}
                            </small>
                          </td>
                          <td>
                            <span className={styles.status} data-live={f.status === 'published'}>
                              {f.status === 'published'
                                ? `${t('منشور', 'Published')} v${f.published_version}`
                                : t('مسودة', 'Draft')}
                            </span>
                          </td>
                          <td>
                            <time dateTime={f.updated_at}>
                              {new Date(f.updated_at).toLocaleDateString(
                                language === 'ar' ? 'ar-EG' : 'en-GB',
                              )}
                            </time>
                          </td>
                          <td>
                            <div className={styles.actions}>
                              <Link
                                className="btn"
                                href={channelHref(`/dashboard/flows/${f.id}`, channelId)}
                                aria-label={`${t('تعديل', 'Edit')}: ${f.name}`}
                                title={t('تعديل', 'Edit')}
                              >
                                <NavIcon name="flows" />
                              </Link>
                              <button
                                type="button"
                                className="btn"
                                disabled={busy}
                                onClick={() => void act(() => exportFlow(f))}
                                aria-label={`${t('تصدير', 'Export')}: ${f.name}`}
                                title={t('تصدير', 'Export')}
                              >
                                <NavIcon name="delivery" />
                              </button>
                              <div className={styles.actionMenu} data-flow-actions>
                                <button
                                  type="button"
                                  className="btn"
                                  aria-label={`${t('إجراءات', 'Actions')}: ${f.name}`}
                                  aria-expanded={menu === f.id}
                                  onClick={(event) => {
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setMenuPosition({
                                      left: Math.max(
                                        8,
                                        Math.min(window.innerWidth - 208, rect.left),
                                      ),
                                      top: Math.max(
                                        8,
                                        Math.min(window.innerHeight - 250, rect.bottom + 6),
                                      ),
                                    });
                                    setMenu(menu === f.id ? null : f.id);
                                  }}
                                >
                                  <NavIcon name="more" />
                                </button>
                                {menu === f.id && (
                                  <div className={styles.menu} style={menuPosition}>
                                    <Link
                                      href={channelHref(
                                        `/dashboard/flows/${f.id}/workspace`,
                                        channelId,
                                      )}
                                    >
                                      {t('تفاصيل التدفق', 'Flow details')}
                                    </Link>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void act(async () => {
                                          await api(`/flows/${f.id}/duplicate`, { method: 'POST' });
                                          await flows.reload();
                                        })
                                      }
                                    >
                                      {t('نسخ التدفق', 'Duplicate flow')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenu(null);
                                        setMoving(f);
                                      }}
                                    >
                                      {t('نقل إلى مجلد', 'Move to folder')}
                                    </button>
                                    {f.status === 'published' && (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void act(async () => {
                                            await api(`/flows/${f.id}/unpublish`, {
                                              method: 'POST',
                                            });
                                            await flows.reload();
                                          })
                                        }
                                      >
                                        {t('إيقاف النشر', 'Unpublish')}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenu(null);
                                        setDeleting(f);
                                      }}
                                    >
                                      {t('حذف', 'Delete')}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td colSpan={5} className={styles.empty}>
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
              <div className={styles.import}>
                <label className="btn">
                  {t('استيراد تدفق Boat Two', 'Import Boat Two flow')}
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void act(() => importFlow(file));
                    }}
                  />
                </label>
                <span>
                  {t(
                    'الاستيراد ينشئ مسودة غير منشورة ودون ربط حساب.',
                    'Imports create an unpublished draft without account bindings.',
                  )}
                </span>
              </div>
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
          <label>
            {t('ابدأ من', 'Start from')}
            <select name="templateId" disabled={section !== 'bot_reply'}>
              <option value="">{t('تدفق فارغ', 'Blank flow')}</option>
              {templates.data.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {templates.error && <p role="alert">{templates.error}</p>}
          <label className={styles.checkbox}>
            <input name="isComponent" type="checkbox" />
            {t('مكوّن قابل لإعادة الاستخدام', 'Reusable component')}
          </label>
          <div className={styles.formActions}>
            <Link href={href('flows/new')}>{t('استخدام المعالج الموجّه', 'Use guided setup')}</Link>
            <button className="btn btn-primary" disabled={busy || (!!channelId && !selected)}>
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
