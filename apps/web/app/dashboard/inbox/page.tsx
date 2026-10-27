'use client';
import { InboxFilters, EMPTY_INBOX_FILTERS } from '../../../components/inbox/InboxFilters';
import { InboxCustomerPanel } from '../../../components/inbox/InboxCustomerPanel';
import styles from './inbox.module.css';
import { useChannelContext } from '../../../components/product/useChannelContext';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ConversationDrafts, sameConversationDraft } from '../../../lib/conversation-drafts';
import { useLocale } from '../../../components/product/locale';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import MessageBubble from '../../../components/inbox/MessageBubble';
import { api, getSession } from '../../../lib/api';
import { useRealtime } from '../../../lib/realtime';

type Tab =
  | 'active'
  | 'mine'
  | 'unassigned'
  | 'unread'
  | 'bot'
  | 'closed'
  | 'important'
  | 'archived'
  | 'blocked';
const TABS: [Tab, string, string][] = [
  ['active', 'الكل', 'active'],
  ['mine', 'لي', 'mine'],
  ['unassigned', 'غير معيّنة', 'unassigned'],
  ['unread', 'غير مقروءة', 'unread'],
  ['bot', 'عند البوت', 'bot'],
  ['important', 'مهمة', 'important'],
  ['archived', 'مؤرشفة', 'archived'],
  ['blocked', 'محظورة', 'blocked'],
  ['closed', 'محلولة', 'closed'],
];
const TAB_QUERY: Record<Tab, string> = {
  active: 'status=active',
  mine: 'status=active&assignee=me',
  unassigned: 'status=active&assignee=unassigned',
  unread: 'status=active&unread=true',
  bot: 'status=active&handledBy=bot',
  closed: 'status=closed',
  important: 'view=important',
  archived: 'view=archived',
  blocked: 'view=blocked',
};
const CH: Record<string, string> = {
  telegram: 'Telegram',
  web: 'Web',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
};
const preview = (c: any) =>
  c ? (c.reply?.title ?? c.text ?? (c.media ? `[${c.media.kind}]` : c.location ? '📍' : '')) : '';

export default function Inbox() {
  const { t, language } = useLocale();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('tab');
    if (key && key in TAB_QUERY) setTab(key as Tab);
  }, []);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_INBOX_FILTERS);
  const [infoOpen, setInfoOpen] = useState(true);
  const [messageSearch, setMessageSearch] = useState('');
  const [searchMessages, setSearchMessages] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const skipBottom = useRef(false);
  const threadScroll = useRef<HTMLDivElement>(null);
  const [channelId, setChannelId] = useChannelContext();
  const [items, setItems] = useState<any[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState('agent');
  const [counts, setCounts] = useState<any>({});
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [team, setTeam] = useState<any[]>([]);
  const [departments, setDepartments] = useState<
    { id: string; name: string; sla_minutes: number }[]
  >([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [canned, setCanned] = useState<any[]>([]);
  const [me, setMe] = useState<string>('');
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [attach, setAttach] = useState<any>(null);
  const drafts = useRef(new ConversationDrafts());
  const composerState = useRef({ text, internal, attach });
  composerState.current = { text, internal, attach };
  const sendLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  // A ref locks immediately; React state alone can batch two rapid clicks.
  const actingRef = useRef(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [error, setError] = useState('');
  const [notifPerm, setNotifPerm] = useState<string>('granted');

  const queryParams = new URLSearchParams(TAB_QUERY[tab]);
  if (q.trim()) queryParams.set('q', q.trim());
  if (channelId) queryParams.set('channelId', channelId);
  for (const key of ['tag', 'sequenceId', 'assignee', 'handledBy', 'orderBy'] as const)
    if (filters[key]) queryParams.set(key, filters[key]);
  if (filters.from) queryParams.set('from', filters.from + 'T00:00:00.000Z');
  if (filters.to) queryParams.set('to', filters.to + 'T23:59:59.999Z');
  const queryKey = queryParams.toString();
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;
  const [listLoading, setListLoading] = useState(true);
  const selRef = useRef<string | null>(null);
  const msgsRef = useRef<any[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  selRef.current = selId;
  msgsRef.current = msgs;

  const names = useMemo(
    () => Object.fromEntries(team.map((m) => [m.user_id, m.full_name || m.email])),
    [team],
  );
  const nameOf = useCallback((id?: string) => (id ? (names[id] ?? 'موظف') : 'النظام'), [names]);
  const myAvailability = team.find((m) => m.user_id === me)?.available ?? true;

  const loadList = useCallback(async () => {
    const qs = queryKey;
    setListLoading(true);
    try {
      const r = await api<any>(`/conversations?${qs}`);
      if (currentQuery.current !== qs) return;
      setItems(r.items);
      setNextBefore(r.nextCursor);
      setChecked([]);
    } catch (e: any) {
      if (currentQuery.current === qs) setError(e.message);
    } finally {
      if (currentQuery.current === qs) setListLoading(false);
    }
  }, [queryKey]);
  const countsGeneration = useRef(0);
  const countsChannel = useRef(channelId);
  countsChannel.current = channelId;
  const loadCounts = useCallback(async () => {
    const request = ++countsGeneration.current;
    try {
      const counts = await api(
        '/conversations/counts' + (channelId ? '?channelId=' + channelId : ''),
      );
      if (request === countsGeneration.current && countsChannel.current === channelId)
        setCounts(counts);
    } catch {
      /* Retain the last successful counts. */
    }
  }, [channelId]);

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    api<{ role: string }>('/workspace')
      .then((w) => setWorkspaceRole(w.role))
      .catch(() => {});
    api<any>('/auth/me')
      .then((r) => setMe(r.user.id))
      .catch(() => {});
    api<any>('/team')
      .then((r) => setTeam(r.members))
      .catch(() => {});
    api<typeof departments>('/departments')
      .then(setDepartments)
      .catch(() => {});
    const requested = new URLSearchParams(window.location.search).get('conversation');
    if (requested) setTimeout(() => open(requested), 0);
    api<any[]>('/channels')
      .then(setChannels)
      .catch(() => {});
    api<any[]>('/canned-replies')
      .then(setCanned)
      .catch(() => {});
    if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission);
  }, []);

  useEffect(() => {
    const t = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);
  useEffect(() => {
    if (skipBottom.current) {
      skipBottom.current = false;
      return;
    }
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, selId]);

  const open = useCallback(async (id: string) => {
    if (selRef.current) drafts.current.write(selRef.current, composerState.current);
    const draft = drafts.current.read(id);
    selRef.current = id;
    setDetail(null);
    setDetailLoading(true);
    setMessageSearch('');
    setMsgs([]);
    setSelId(id);
    setError('');
    setNotice('');
    setText(draft.text);
    setAttach(draft.attach);
    setInternal(draft.internal);
    try {
      const [d, m] = await Promise.all([
        api<any>(`/conversations/${id}`),
        api<any>(`/conversations/${id}/messages?limit=50`),
      ]);
      if (selRef.current !== id) return;
      setDetail(d);
      setMsgs(m.items);
      setHasMore(m.hasMore);
      if (d.unread_count > 0) api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    } catch (e: any) {
      if (selRef.current === id) setError(e.message);
    } finally {
      if (selRef.current === id) setDetailLoading(false);
    }
  }, []);

  async function moreConversations() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    const qs = `${queryKey}&cursor=${encodeURIComponent(nextBefore)}`;
    try {
      const r = await api<any>(`/conversations?${qs}`);
      if (currentQuery.current !== qs.split('&cursor=')[0]) return;
      setItems((cur) => [...cur, ...r.items.filter((x: any) => !cur.some((y) => y.id === x.id))]);
      setNextBefore(r.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  async function bulkClose() {
    if (!checked.length || !confirm(`إغلاق ${checked.length} محادثة؟`)) return;
    setBusy(true);
    try {
      const r = await api<{ results: { id: string; ok: boolean; error?: string }[] }>(
        '/conversations/bulk',
        { method: 'POST', body: JSON.stringify({ ids: checked, patch: { status: 'closed' } }) },
      );
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length) setError(failed.map((x) => x.error).join('، '));
      setChecked([]);
      await loadList();
      loadCounts();
      if (selId)
        api<any>(`/conversations/${selId}`)
          .then(setDetail)
          .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Reconcile missed SSE events after reconnects and while a tab is visible.
  useEffect(() => {
    const sync = () => {
      loadList();
      loadCounts();
      const id = selRef.current;
      if (id) {
        const last = msgsRef.current.reduce((n, x) => Math.max(n, Number(x.seq) || 0), 0);
        api<any>(`/conversations/${id}/messages?afterSeq=${last}&limit=200`)
          .then((r) => {
            if (selRef.current === id)
              setMsgs((cur) => [
                ...cur,
                ...r.items.filter((x: any) => !cur.some((y) => y.id === x.id)),
              ]);
          })
          .catch(() => {});
        api<any>(`/conversations/${id}`)
          .then((d) => {
            if (selRef.current === id) setDetail(d);
          })
          .catch(() => {});
      }
    };
    const interval = setInterval(() => {
      if (!document.hidden) sync();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadList, loadCounts]);

  const loadOlder = async () => {
    if (!selId || !msgs.length || olderLoading) return;
    const id = selId;
    const before = msgs[0].seq;
    setOlderLoading(true);
    try {
      const m = await api<any>(`/conversations/${id}/messages?beforeSeq=${before}&limit=50`);
      if (selRef.current !== id) return;
      const height = threadScroll.current?.scrollHeight || 0;
      const older = m.items.filter((x: any) => !msgsRef.current.some((y) => y.id === x.id));
      if (older.length) {
        skipBottom.current = true;
        setMsgs((cur) => [...older, ...cur]);
      }
      setHasMore(m.hasMore);
      requestAnimationFrame(() => {
        if (threadScroll.current && selRef.current === id)
          threadScroll.current.scrollTop += threadScroll.current.scrollHeight - height;
      });
    } catch (e) {
      if (selRef.current === id) setError((e as Error).message);
    } finally {
      setOlderLoading(false);
    }
  };

  // تحديثات لحظية
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      loadList();
      loadCounts();
    }, 400);
  }, [loadList, loadCounts]);

  useRealtime(async (e) => {
    const cur = selRef.current;
    if (e.type === 'message') {
      const m = e.message;
      if (e.conversationId === cur) {
        setMsgs((list) =>
          list.some((x) => x.id === m.id)
            ? list
            : [
                ...list,
                {
                  ...m,
                  sender_type: m.senderType,
                  sender_user_id: m.senderUserId,
                  is_internal: m.isInternal,
                  created_at: m.createdAt,
                },
              ],
        );
        if (m.direction === 'in')
          api(`/conversations/${cur}/read`, { method: 'POST' }).catch(() => {});
      }
      if (
        m.direction === 'in' &&
        (document.hidden || e.conversationId !== cur) &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('رسالة جديدة', {
          body: preview(m.content) || 'رسالة جديدة',
          tag: e.conversationId,
        });
      }
      refreshSoon();
    } else if (e.type === 'message_status') {
      if (e.conversationId === cur)
        setMsgs((list) =>
          list.map((x) =>
            x.id === e.messageId ? { ...x, status: e.status, error: e.error ?? x.error } : x,
          ),
        );
    } else if (e.type === 'conversation') {
      refreshSoon();
      if (e.conversationId === cur) {
        api<any>(`/conversations/${cur}`)
          .then((updated) => {
            if (selRef.current === cur) setDetail(updated);
          })
          .catch(() => {});
        const last = msgsRef.current.reduce((n, x) => Math.max(n, Number(x.seq) || 0), 0);
        api<any>(`/conversations/${cur}/messages?afterSeq=${last}`)
          .then((r) => {
            if (selRef.current === cur)
              setMsgs((list) => [
                ...list,
                ...r.items.filter((x: any) => !list.some((y) => y.id === x.id)),
              ]);
          })
          .catch(() => {});
      }
    }
  });

  const act = async (path: string, method = 'POST', body?: any, okMsg?: string) => {
    if (actingRef.current) return false;
    actingRef.current = true;
    const actionConversationId = selRef.current;
    setActing(true);
    setError('');
    setNotice('');
    let ok = false;
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      ok = true;
      if (okMsg && selRef.current === actionConversationId) setNotice(okMsg);
    } catch (e: any) {
      if (selRef.current === actionConversationId) setError(e.message);
    } finally {
      actingRef.current = false;
      setActing(false);
    }
    refreshSoon();
    if (actionConversationId && selRef.current === actionConversationId)
      api<any>(`/conversations/${actionConversationId}`)
        .then((updated) => {
          if (selRef.current === actionConversationId) setDetail(updated);
        })
        .catch(() => {});
    return ok;
  };

  async function upload(file: File) {
    const uploadingId = selRef.current;
    setError('');
    setUploading(true);
    const f = new FormData();
    f.append('file', file);
    try {
      const result = await api<any>('/uploads', { method: 'POST', body: f });
      if (selRef.current === uploadingId) setAttach(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (
      !selId ||
      sendLock.current ||
      busy ||
      uploading ||
      (!internal &&
        (detail?.blocked ||
          (detail?.channel_type === 'whatsapp' &&
            (!detail?.whatsapp_window_expires_at ||
              new Date(detail.whatsapp_window_expires_at) <= new Date()))))
    )
      return;
    const sendingId = selId;
    const sentDraft = { ...composerState.current };
    const t = text.trim();
    // Internal notes require non-empty text, even when a reply attachment was selected earlier.
    if (!t && (internal || !attach)) return;
    sendLock.current = true;
    setBusy(true);
    setError('');
    try {
      if (internal)
        await api(`/conversations/${selId}/notes`, {
          method: 'POST',
          body: JSON.stringify({ text: t }),
        });
      else if (attach)
        await api(`/conversations/${selId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            media: {
              kind: attach.kind,
              url: attach.url,
              filename: attach.filename,
              ...(t ? { caption: t } : {}),
            },
          }),
        });
      else
        await api(`/conversations/${selId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text: t }),
        });
      drafts.current.clearSent(sendingId, sentDraft);
      if (selRef.current === sendingId && sameConversationDraft(composerState.current, sentDraft)) {
        setText('');
        setAttach(null);
      }
    } catch (e: any) {
      if (selRef.current === sendingId) setError(e.details?.message ?? e.message);
    } finally {
      sendLock.current = false;
      setBusy(false);
    }
  }

  const windowExpired =
    detail?.channel_type === 'whatsapp' &&
    (!detail?.whatsapp_window_expires_at ||
      new Date(detail.whatsapp_window_expires_at) <= new Date());
  const suggestions =
    text.startsWith('/') && !internal
      ? canned
          .filter(
            (c) =>
              c.shortcut.startsWith(text.slice(1).toLowerCase()) || c.title.includes(text.slice(1)),
          )
          .slice(0, 6)
      : [];
  const fill = (c: any) =>
    setText(c.content.replace(/\{\{\s*(contact\.)?name\s*\}\}/g, detail?.contact_name ?? ''));
  const title = (c: any) => c.contact_name || c.contact_phone || t('زائر', 'Visitor');

  const customerPanel = detail && selId && (
    <InboxCustomerPanel
      key={detail.id}
      detail={detail}
      notes={msgs.filter(
        (m) => (m.is_internal ?? m.isInternal) && (m.sender_type ?? m.senderType) !== 'system',
      )}
      team={team}
      departments={departments}
      acting={acting}
      canManage={workspaceRole !== 'agent'}
      act={act}
      onNote={() => {
        setInternal(true);
        setShowContext(false);
        requestAnimationFrame(() => composerInput.current?.focus());
      }}
      onRefresh={async () => {
        const id = selRef.current;
        if (id) {
          const d = await api(`/conversations/${id}`);
          if (selRef.current === id) setDetail(d);
        }
      }}
      onError={setError}
    />
  );

  return (
    <div className={`premium-inbox ${styles.inbox}`}>
      <nav className={styles.rail} aria-label={t('تصفية المحادثات', 'Filter conversations')}>
        <button
          type="button"
          aria-label={t('القائمة', 'Menu')}
          title={t('القائمة', 'Menu')}
          onClick={() => window.dispatchEvent(new Event('boat:toggle-navigation'))}
        >
          <NavIcon name="menu" />
        </button>
        <div className={styles.railTabs}>
          {(
            ['mine', 'active', 'important', 'unread', 'archived', 'blocked', 'closed'] as Tab[]
          ).map((key) => {
            const definition = TABS.find(([value]) => value === key)!;
            const label =
              language === 'ar'
                ? definition[1]
                : {
                    mine: 'Mine',
                    active: 'All',
                    important: 'Important',
                    unread: 'Unread',
                    archived: 'Archived',
                    blocked: 'Blocked',
                    closed: 'Resolved',
                    unassigned: 'Unassigned',
                    bot: 'With bot',
                  }[key];
            return (
              <button
                type="button"
                key={key}
                aria-pressed={tab === key}
                aria-label={label}
                title={`${label}${typeof counts[definition[2]] === 'number' ? ` (${counts[definition[2]]})` : ''}`}
                onClick={() => setTab(key)}
              >
                <NavIcon
                  name={
                    {
                      mine: 'user',
                      active: 'chat',
                      important: 'star',
                      unread: 'unread',
                      archived: 'archive',
                      blocked: 'blocked',
                      closed: 'check',
                      unassigned: 'team',
                      bot: 'agents',
                    }[key]
                  }
                />
              </button>
            );
          })}
        </div>
        <Link
          href="/dashboard/inbox/settings"
          aria-label={t('الإعدادات', 'Settings')}
          title={t('الإعدادات', 'Settings')}
        >
          <NavIcon name="settings" />
        </Link>
      </nav>
      <div className={styles.body}>
        {error && (
          <p role="alert" className="bg-red-50 px-4 py-2 text-red-700">
            {error}
          </p>
        )}
        <div className="flex min-h-0 flex-1">
          {/* ---------- القائمة ---------- */}
          <aside
            className={`${selId ? 'hidden md:flex' : 'flex'} inbox-list w-full flex-col border-l bg-white md:w-80`}
          >
            <form
              className={styles.searchBar}
              onSubmit={(e) => {
                e.preventDefault();
                setQ(search);
              }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('بحث المحادثات', 'Search conversations')}
                placeholder={t('اكتب واضغط Enter للبحث', 'Type and submit to search')}
                className="inbox-search w-full rounded border p-1.5"
              />
              <button
                type="button"
                className={styles.filterButton}
                data-inbox-filter-toggle
                aria-expanded={optionsOpen}
                aria-label={t('الفلاتر', 'Filters')}
                onClick={() => setOptionsOpen((value) => !value)}
              >
                <NavIcon name="filter" />
              </button>
              <button
                type="button"
                aria-label={t('تحديث المحادثات', 'Refresh conversations')}
                onClick={() => {
                  void loadList();
                  void loadCounts();
                }}
              >
                <NavIcon name="refresh" />
              </button>
            </form>
            <InboxFilters
              open={optionsOpen}
              onClose={() => setOptionsOpen(false)}
              value={{ ...filters, channelId }}
              onChange={({ channelId, ...next }) => {
                setChannelId(channelId);
                setFilters(next);
              }}
              channels={channels}
              team={team}
            >
              <label>
                <input
                  type="checkbox"
                  checked={myAvailability}
                  onChange={async (e) => {
                    const available = e.target.checked;
                    try {
                      await api('/team/me/availability', {
                        method: 'PATCH',
                        body: JSON.stringify({ available }),
                      });
                      setTeam((rows) =>
                        rows.map((m) => (m.user_id === me ? { ...m, available } : m)),
                      );
                    } catch (error) {
                      setError((error as Error).message);
                    }
                  }}
                />
                {t('متاح لاستلام المحادثات', 'Available for assignment')}
              </label>
              {notifPerm === 'default' && (
                <button
                  type="button"
                  onClick={() => Notification.requestPermission().then(setNotifPerm)}
                >
                  {t('تفعيل الإشعارات', 'Enable notifications')}
                </button>
              )}
            </InboxFilters>
            {workspaceRole !== 'agent' && checked.length > 0 && (
              <div className="p-2 flex gap-2 items-center">
                <span>{checked.length} محدد</span>
                <button disabled={busy} onClick={bulkClose} className="rounded border p-1">
                  {t('إغلاق المحدد', 'Close selected')}
                </button>
              </div>
            )}
            <ul className="flex-1 overflow-y-auto">
              {items.map((c) => (
                <li
                  key={c.id}
                  onClick={() => open(c.id)}
                  role="button"
                  tabIndex={0}
                  aria-current={selId === c.id ? 'true' : undefined}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      open(c.id);
                    }
                  }}
                  className={`inbox-item cursor-pointer border-b px-3 py-2 hover:bg-gray-50 ${selId === c.id ? 'is-selected' : ''} ${c.unread_count > 0 ? 'is-unread' : ''}`}
                >
                  <div className="inbox-row">
                    {workspaceRole !== 'agent' && (
                      <input
                        aria-label={`تحديد ${title(c)}`}
                        type="checkbox"
                        checked={checked.includes(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setChecked((ids) =>
                            e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id),
                          )
                        }
                      />
                    )}
                    <span className="inbox-avatar" aria-hidden="true">
                      {String(title(c)).trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <div className="inbox-body">
                      <div className="inbox-line">
                        <strong className="inbox-name truncate">{title(c)}</strong>
                        <time className="inbox-time" dateTime={c.last_message_at}>
                          {new Date(c.last_message_at).toLocaleTimeString(
                            language === 'ar' ? 'ar-EG' : 'en-US',
                            { hour: '2-digit', minute: '2-digit' },
                          )}
                        </time>
                      </div>
                      <div className="inbox-line">
                        <span className="inbox-preview truncate">
                          {preview(c.last_message) || t('لا توجد رسائل', 'No messages')}
                        </span>
                        {c.unread_count > 0 && (
                          <span
                            className="inbox-badge"
                            aria-label={`${c.unread_count} ${t('غير مقروءة', 'unread')}`}
                          >
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="inbox-chips">
                        <span className="inbox-chip is-channel">
                          {CH[c.channel_type] ?? c.channel_type}
                        </span>
                        <span
                          className={`inbox-chip ${c.handled_by === 'bot' ? 'is-bot' : 'is-agent'}`}
                        >
                          {c.handled_by === 'bot' ? t('بوت', 'Bot') : t('موظف', 'Agent')}
                        </span>
                        <span className={`inbox-chip ${c.assignee_name ? '' : 'is-warn'}`}>
                          {c.assignee_name ? c.assignee_name : t('غير معيّنة', 'Unassigned')}
                        </span>
                        {tab === 'closed' && (
                          <span className="inbox-chip">{t('مغلقة', 'Closed')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {!items.length && (
                <li className="empty" role="status">
                  {listLoading ? (
                    t('جارٍ التحميل…', 'Loading…')
                  ) : q.trim() ||
                    Object.entries(filters).some(([key, value]) => key !== 'orderBy' && !!value) ||
                    channelId ||
                    tab !== 'active' ||
                    Number(counts.active || 0) + Number(counts.closed || 0) > 0 ? (
                    <div className="stack">
                      <p>
                        {t(
                          'لا توجد محادثات تطابق الفلاتر.',
                          'No conversations match these filters.',
                        )}
                      </p>
                      <button
                        className="btn"
                        onClick={() => {
                          setQ('');
                          setSearch('');
                          setFilters(EMPTY_INBOX_FILTERS);
                          setChannelId('');
                          setTab('active');
                        }}
                      >
                        {t('مسح البحث والفلاتر', 'Clear search and filters')}
                      </button>
                      {Number(counts.closed) > 0 && (
                        <button
                          className="btn"
                          onClick={() => {
                            setQ('');
                            setChannelId('');
                            setTab('closed');
                          }}
                        >
                          {t('عرض المحادثات المغلقة', 'View closed conversations')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="stack">
                      <p>
                        {t(
                          'لا توجد محادثات بعد. ابدأ بربط قناة أو تجربة ويدجت الموقع.',
                          'No conversations yet. Connect a channel or try your website widget.',
                        )}
                      </p>
                      <Link className="btn" href="/dashboard/channels">
                        {t('القنوات وتجربة الويدجت', 'Channels and widget demo')}
                      </Link>
                    </div>
                  )}
                </li>
              )}
            </ul>
            {nextBefore && (
              <button className="p-3 border-t" disabled={loadingMore} onClick={moreConversations}>
                {loadingMore
                  ? t('جارٍ التحميل…', 'Loading…')
                  : t('تحميل محادثات أقدم', 'Load older conversations')}
              </button>
            )}
          </aside>

          {/* ---------- الخيط ---------- */}
          <section className={`${selId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
            {detailLoading ? (
              <div className={styles.empty} role="status">
                {t('جارٍ تحميل المحادثة…', 'Loading conversation…')}
              </div>
            ) : !detail || !selId ? (
              <div className={styles.empty}>
                <img src="/navigation/shared-inbox.svg" alt="" />
                <h1>{t('صندوق الوارد المشترك', 'Shared Inbox')}</h1>
                <h2>
                  {t(
                    'كل قنواتك في صندوق وارد واحد',
                    'Connect Multiple Platforms – all in one inbox!',
                  )}
                </h2>
                <p>
                  {t(
                    'إدارة الرسائل من منصات متعددة في مكان واحد.',
                    'Easily manage messages from multiple platforms in a single inbox.',
                  )}
                </p>
              </div>
            ) : (
              <>
                <header className={styles.threadHeader}>
                  <button
                    type="button"
                    className={styles.back}
                    aria-label={t('رجوع للقائمة', 'Back to list')}
                    onClick={() => {
                      if (selRef.current)
                        drafts.current.write(selRef.current, composerState.current);
                      selRef.current = null;
                      setSelId(null);
                      setDetail(null);
                    }}
                  >
                    <NavIcon name="undo" />
                  </button>
                  <span className={styles.threadAvatar}>
                    {String(title(detail)).trim().slice(0, 2)}
                  </span>
                  <div className={styles.threadIdentity}>
                    <strong>{title(detail)}</strong>
                    <small>{detail.contact_phone || detail.channel_name}</small>
                  </div>
                  <div className={styles.threadTools}>
                    <button
                      type="button"
                      aria-label={t('بحث الرسائل', 'Search messages')}
                      aria-expanded={searchMessages}
                      onClick={() => setSearchMessages((v) => !v)}
                    >
                      <NavIcon name="search" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('إجراءات المحادثة', 'Chat actions')}
                      onClick={() => setShowContext(true)}
                    >
                      <NavIcon name="more" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('إظهار معلومات العميل', 'Toggle customer info')}
                      aria-expanded={infoOpen}
                      onClick={() => setInfoOpen((v) => !v)}
                    >
                      <NavIcon name="chevron" />
                    </button>
                  </div>
                </header>
                {infoOpen && (
                  <dl className={styles.customerStrip}>
                    {[
                      [
                        t('عميل منذ', 'Customer Since'),
                        detail.contact_since
                          ? new Date(detail.contact_since).toLocaleDateString(
                              language === 'ar' ? 'ar-EG' : 'en-US',
                            )
                          : '—',
                        'user',
                      ],
                      [
                        t('آخر ظهور', 'Last Seen'),
                        detail.last_inbound_at
                          ? new Date(detail.last_inbound_at).toLocaleString(
                              language === 'ar' ? 'ar-EG' : 'en-US',
                            )
                          : '—',
                        'sessions',
                      ],
                      [t('اللغة', 'Language'), detail.contact_attributes?.language || '—', 'globe'],
                      [t('البلد', 'Country'), detail.contact_attributes?.country || '—', 'globe'],
                      [
                        t('المنطقة الزمنية', 'Timezone'),
                        detail.contact_attributes?.timezone || '—',
                        'sessions',
                      ],
                    ].map(([label, value, icon]) => (
                      <div key={label}>
                        <NavIcon name={icon} />
                        <dt>{label}</dt>
                        <dd title={value}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {searchMessages && (
                  <input
                    className={styles.messageSearch}
                    aria-label={t('بحث داخل الرسائل المحملة', 'Search loaded messages')}
                    placeholder={t('بحث داخل الرسائل المحملة…', 'Search loaded messages…')}
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                  />
                )}

                {notice && (
                  <p className="handoff-notice" role="status">
                    ✓ {notice}
                  </p>
                )}
                {acting && (
                  <p className="handoff-notice is-busy" role="status">
                    {t('جارٍ التنفيذ…', 'Working…')}
                  </p>
                )}
                <div ref={threadScroll} className="thread-msgs flex-1 overflow-y-auto p-3">
                  {hasMore && (
                    <button
                      onClick={loadOlder}
                      disabled={olderLoading}
                      className="mx-auto mb-2 block rounded border bg-white px-3 py-1 text-xs"
                    >
                      {t('تحميل رسائل أقدم', 'Load older messages')}
                    </button>
                  )}
                  {msgs
                    .filter(
                      (m) =>
                        !messageSearch.trim() ||
                        preview(m.content)
                          .toLocaleLowerCase()
                          .includes(messageSearch.trim().toLocaleLowerCase()),
                    )
                    .map((m) => (
                      <MessageBubble key={m.id} m={m} conversationId={selId} name={nameOf} />
                    ))}
                  <div ref={bottom} />
                </div>

                <div className={`composer border-t bg-white p-2 ${internal ? 'is-note' : ''}`}>
                  <div
                    className="composer-modes"
                    role="group"
                    aria-label={t('نوع الرسالة', 'Message type')}
                  >
                    <button
                      type="button"
                      aria-pressed={!internal}
                      className={!internal ? 'is-on' : ''}
                      onClick={() => setInternal(false)}
                    >
                      {t('رد', 'Reply')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={internal}
                      className={internal ? 'is-on is-note' : ''}
                      onClick={() => setInternal(true)}
                    >
                      {t('ملاحظة', 'Note')}
                    </button>
                  </div>
                  {internal && (
                    <p className="composer-note-banner" role="status">
                      {t(
                        'ملاحظة داخلية — لن يراها العميل.',
                        'Internal note — the customer will not see this.',
                      )}
                    </p>
                  )}
                  {error && (
                    <p className="mb-1 text-xs text-red-600" role="alert">
                      {error}
                    </p>
                  )}
                  {windowExpired && !internal && (
                    <p className="mb-1 rounded bg-amber-50 p-2 text-xs text-amber-800">
                      {t(
                        'انتهت نافذة واتساب. الرد الحر معطّل؛ يمكنك كتابة ملاحظة داخلية أو استخدام قالب معتمد من مسار الحملات.',
                        'The WhatsApp window has expired. Free-form replies are disabled; add an internal note or use an approved template through campaigns.',
                      )}
                    </p>
                  )}
                  {detail.handled_by === 'bot' && (
                    <p className="mb-1 text-xs text-gray-500">
                      {t(
                        'البوت يتولى هذه المحادثة. إرسال رد يستلمها تلقائيًا.',
                        'The bot handles this conversation. Sending a reply takes over automatically.',
                      )}
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <ul
                      className="composer-suggest mb-1 rounded border bg-white shadow"
                      aria-label={t('الردود الجاهزة', 'Saved replies')}
                    >
                      {suggestions.map((s) => (
                        <li
                          key={s.id}
                          onClick={() => fill(s)}
                          className="cursor-pointer px-2 py-1 hover:bg-gray-100"
                        >
                          <strong>/{s.shortcut}</strong> — {s.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  {attach && (
                    <div className="composer-attached mb-1 flex items-center gap-2 rounded bg-gray-100 px-2 py-1 text-xs">
                      <NavIcon name="knowledge" /> {attach.filename}
                      <button
                        aria-label={t('إزالة المرفق', 'Remove attachment')}
                        onClick={() => setAttach(null)}
                        className="text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="composer-row">
                    <textarea
                      ref={composerInput}
                      aria-label={t('محرر الرد', 'Reply composer')}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={2}
                      disabled={!internal && (!!windowExpired || !!detail?.blocked)}
                      placeholder={
                        internal
                          ? t(
                              'اكتب ملاحظة داخلية (لا يراها العميل)…',
                              'Write an internal note (hidden from customer)…',
                            )
                          : t(
                              'اكتب ردّاً… (اكتب / للردود الجاهزة)',
                              'Write a reply… (type / for saved replies)',
                            )
                      }
                      className="composer-input flex-1 rounded border p-2"
                    />
                    <div className="composer-actions">
                      <label
                        className={`composer-attach ${internal ? 'is-disabled' : ''}`}
                        title={t('إرفاق ملف', 'Attach file')}
                      >
                        <NavIcon name="plus" />
                        <span className="sr-only">{t('إرفاق', 'Attach')}</span>
                        <input
                          aria-label={t('إرفاق ملف', 'Attach file')}
                          type="file"
                          hidden
                          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                          disabled={internal || uploading || !!windowExpired || !!detail.blocked}
                        />
                      </label>
                      <button
                        onClick={send}
                        disabled={
                          busy ||
                          uploading ||
                          (!text.trim() && (internal || !attach)) ||
                          (!internal && (!!detail?.blocked || !!windowExpired))
                        }
                        className={`composer-send ${internal ? 'is-note' : ''}`}
                      >
                        {busy ? (
                          '…'
                        ) : internal ? (
                          t('حفظ الملاحظة', 'Save note')
                        ) : (
                          <>
                            <NavIcon name="campaigns" />
                            <span className="sr-only">{t('إرسال', 'Send')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ---------- تفاصيل العميل ---------- */}
          <div className="hidden lg:contents">{!showContext && customerPanel}</div>
          <Dialog
            open={showContext && !!detail}
            onClose={() => setShowContext(false)}
            title={t('ملف العميل', 'Customer profile')}
          >
            {customerPanel}
          </Dialog>
        </div>
      </div>
    </div>
  );
}
