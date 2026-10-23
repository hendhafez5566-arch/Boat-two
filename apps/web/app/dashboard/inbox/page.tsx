'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '../../../components/product/locale';
import { Dialog } from '../../../components/product/ProductUI';
import { NavIcon } from '../../../components/product/NavIcon';
import MessageBubble from '../../../components/inbox/MessageBubble';
import { api, getSession } from '../../../lib/api';
import { useRealtime } from '../../../lib/realtime';

type Tab = 'active' | 'mine' | 'unassigned' | 'unread' | 'bot' | 'closed';
const TABS: [Tab, string, string][] = [
  ['active', 'الكل', 'active'],
  ['mine', 'لي', 'mine'],
  ['unassigned', 'غير معيّنة', 'unassigned'],
  ['unread', 'غير مقروءة', 'unread'],
  ['bot', 'عند البوت', 'bot'],
  ['closed', 'مغلقة', 'closed'],
];
const TAB_QUERY: Record<Tab, string> = {
  active: 'status=active',
  mine: 'status=active&assignee=me',
  unassigned: 'status=active&assignee=unassigned',
  unread: 'status=active&unread=true',
  bot: 'status=active&handledBy=bot',
  closed: 'status=closed',
};
const CH: Record<string, string> = {
  web: 'Web',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
};
const preview = (c: any) =>
  c ? (c.reply?.title ?? c.text ?? (c.media ? `[${c.media.kind}]` : c.location ? '📍' : '')) : '';

export default function Inbox() {
  const { t, language } = useLocale();
  const [showContext, setShowContext] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [channelId, setChannelId] = useState('');
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notifPerm, setNotifPerm] = useState<string>('granted');

  const queryKey = `${TAB_QUERY[tab]}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}${channelId ? `&channelId=${channelId}` : ''}`;
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;
  const [listLoading, setListLoading] = useState(true);
  const selRef = useRef<string | null>(null);
  const msgsRef = useRef<any[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
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
      setError(e.message);
    } finally {
      if (currentQuery.current === qs) setListLoading(false);
    }
  }, [queryKey]);
  const loadCounts = useCallback(
    () =>
      api('/conversations/counts')
        .then(setCounts)
        .catch(() => {}),
    [],
  );

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
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, selId]);

  const open = useCallback(async (id: string) => {
    setDetail(null);
    setMsgs([]);
    setSelId(id);
    setError('');
    setText('');
    setAttach(null);
    setInternal(false);
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
      setError(e.message);
    }
  }, []);

  async function moreConversations() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    const qs = `${TAB_QUERY[tab]}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}${channelId ? `&channelId=${channelId}` : ''}&cursor=${encodeURIComponent(nextBefore)}`;
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
    if (!selId || !msgs.length) return;
    const m = await api<any>(`/conversations/${selId}/messages?beforeSeq=${msgs[0].seq}&limit=50`);
    setMsgs((cur) => [...m.items, ...cur]);
    setHasMore(m.hasMore);
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
          .then(setDetail)
          .catch(() => {});
        const last = msgsRef.current.reduce((n, x) => Math.max(n, Number(x.seq) || 0), 0);
        api<any>(`/conversations/${cur}/messages?afterSeq=${last}`)
          .then((r) =>
            setMsgs((list) => [
              ...list,
              ...r.items.filter((x: any) => !list.some((y) => y.id === x.id)),
            ]),
          )
          .catch(() => {});
      }
    }
  });

  const act = async (path: string, method = 'POST', body?: any) => {
    setError('');
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
    } catch (e: any) {
      setError(e.message);
    }
    refreshSoon();
    if (selId)
      api<any>(`/conversations/${selId}`)
        .then(setDetail)
        .catch(() => {});
  };

  async function upload(file: File) {
    setError('');
    const f = new FormData();
    f.append('file', file);
    try {
      setAttach(await api<any>('/uploads', { method: 'POST', body: f }));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function send() {
    if (!selId || busy) return;
    const t = text.trim();
    if (!t && !attach) return;
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
      setText('');
      setAttach(null);
    } catch (e: any) {
      setError(e.details?.message ?? e.message);
    }
    setBusy(false);
  }

  const windowExpired =
    detail?.whatsapp_window_expires_at && new Date(detail.whatsapp_window_expires_at) < new Date();
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
    <aside className="customer-panel w-full lg:w-72 overflow-y-auto bg-white p-4">
      <h3 className="mb-2 font-semibold">{t('بيانات العميل', 'Customer details')}</h3>
      <Link href="/dashboard/crm" className="btn mb-3">
        {t('فتح CRM', 'Open CRM')}
      </Link>
      <div className="mb-3 flex flex-wrap gap-1">
        {(detail.contact_tags || []).map((tag: string) => (
          <span className="badge" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <form
        className="mb-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const contact = await api<any>(`/crm/contacts/${detail.contact_id}`);
            await api(`/crm/contacts/${detail.contact_id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                name: contact.name || 'Visitor',
                email: contact.email,
                phone: contact.phone,
                lifecycle: contact.lifecycle,
                tags: String(f.get('tags') || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                attributes: contact.attributes,
                ownerId: contact.owner_id,
                allowDuplicate: true,
              }),
            });
            setDetail(await api(`/conversations/${selId}`));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label className="field">
          {t('وسوم العميل', 'Customer tags')}
          <input
            name="tags"
            key={detail.contact_id + (detail.contact_tags || []).join(',')}
            defaultValue={(detail.contact_tags || []).join(', ')}
            placeholder={t('وسوم مفصولة بفاصلة', 'Comma-separated tags')}
          />
        </label>
        <button className="btn mt-2">{t('حفظ الوسوم', 'Save tags')}</button>
      </form>
      <label className="field mb-3">
        {t('القسم', 'Department')}
        <select
          value={detail.department_id || ''}
          onChange={(e) =>
            act(`/conversations/${selId}`, 'PATCH', { departmentId: e.target.value || null })
          }
        >
          <option value="">{t('غير معيّن', 'Unassigned')}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      {detail.sla_minutes && detail.last_inbound_at && detail.status !== 'closed' && (
        <p className="notice">
          SLA:{' '}
          {detail.unread_count > 0 &&
          Date.now() - new Date(detail.last_inbound_at).getTime() > detail.sla_minutes * 60000
            ? 'تجاوز هدف الرد'
            : 'ضمن هدف الرد'}{' '}
          · {detail.sla_minutes} دقيقة
        </p>
      )}

      <dl className="space-y-1 text-xs">
        <div>
          <dt className="text-gray-400">{t('الاسم', 'Name')}</dt>
          <dd>{detail.contact_name || '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-400">{t('الهاتف', 'Phone')}</dt>
          <dd dir="ltr" className="text-right">
            {detail.contact_phone || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">{t('الإيميل', 'Email')}</dt>
          <dd>{detail.contact_email || '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-400">{t('القناة', 'Channel')}</dt>
          <dd>
            {CH[detail.channel_type]} {detail.channel_name}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">{t('عميل منذ', 'Customer since')}</dt>
          <dd>
            {new Date(detail.contact_since).toLocaleDateString(
              language === 'ar' ? 'ar-EG' : 'en-US',
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">{t('المتولّي', 'Handled by')}</dt>
          <dd>
            {detail.handled_by === 'bot'
              ? `🤖 البوت${detail.flow_waiting ? ' (ينتظر ردّ العميل)' : ''}`
              : '🧑 موظف'}
          </dd>
        </div>
        {detail.whatsapp_window_expires_at && (
          <div>
            <dt className="text-gray-400">{t('نافذة واتساب', 'WhatsApp window')}</dt>
            <dd>
              {windowExpired
                ? 'انتهت'
                : `حتى ${new Date(detail.whatsapp_window_expires_at).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`}
            </dd>
          </div>
        )}
      </dl>
      {Object.keys(detail.contact_attributes ?? {}).length > 0 && (
        <>
          <h4 className="mb-1 mt-3 font-semibold">{t('بيانات مخصصة', 'Custom fields')}</h4>
          <dl className="space-y-1 text-xs">
            {Object.entries(detail.contact_attributes).map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-400">{k}</dt>
                <dd className="break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <div className="mt-3 text-xs">
        <span className="text-gray-400">{t('الحالة:', 'Status:')} </span>
        <select
          value={detail.status}
          onChange={(e) => act(`/conversations/${selId}`, 'PATCH', { status: e.target.value })}
          className="rounded border p-1"
        >
          <option value="open">{t('مفتوحة', 'Open')}</option>
          <option value="pending">{t('معلّقة', 'Pending')}</option>
          <option value="closed">{t('مغلقة', 'Closed')}</option>
        </select>
      </div>
    </aside>
  );
  return (
    <div className="premium-inbox flex flex-col text-sm">
      <header className="flex items-center gap-3 border-b bg-white px-3 py-2">
        <a href="/dashboard" className="underline">
          {t('الرئيسية', 'Overview')}
        </a>
        <strong className="flex-1">{t('صندوق الوارد', 'Inbox')}</strong>
        {selId && (
          <button className="btn lg:hidden" onClick={() => setShowContext(true)}>
            {t('ملف العميل', 'Customer profile')}
          </button>
        )}
        {notifPerm === 'default' && (
          <button
            onClick={() => Notification.requestPermission().then(setNotifPerm)}
            className="rounded border px-2 py-1 text-xs"
          >
            {t('تفعيل الإشعارات', 'Enable notifications')}
          </button>
        )}
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={myAvailability}
            onChange={(e) => {
              api('/team/me/availability', {
                method: 'PATCH',
                body: JSON.stringify({ available: e.target.checked }),
              }).then(() =>
                setTeam((t) =>
                  t.map((m) => (m.user_id === me ? { ...m, available: e.target.checked } : m)),
                ),
              );
            }}
          />{' '}
          {t('متاح', 'Available')}
        </label>
        <a href="/dashboard/inbox/settings" className="text-xs underline">
          {t('الإعدادات', 'Settings')}
        </a>
      </header>

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
          <div className="space-y-2 border-b p-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('بحث المحادثات', 'Search conversations')}
              placeholder={t(
                'بحث بالاسم أو الرقم أو نص الرسالة…',
                'Search name, phone or messages…',
              )}
              className="w-full rounded border p-1.5"
            />
            <select
              aria-label={t('القناة', 'Channel')}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded border p-1.5"
            >
              <option value="">{t('كل القنوات', 'All channels')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {CH[c.type]} {c.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {TABS.map(([k, label, ck]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-full px-2 py-0.5 text-xs ${tab === k ? 'bg-black text-white' : 'border'}`}
                >
                  {language === 'ar'
                    ? label
                    : (
                        {
                          active: 'All',
                          mine: 'Mine',
                          unassigned: 'Unassigned',
                          unread: 'Unread',
                          bot: 'With bot',
                          closed: 'Closed',
                        } as Record<string, string>
                      )[k]}
                  {counts[ck] ? ` (${counts[ck]})` : ''}
                </button>
              ))}
            </div>
          </div>
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
                className={`cursor-pointer border-b px-3 py-2 hover:bg-gray-50 ${selId === c.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
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
                  <strong className="truncate">
                    {CH[c.channel_type]} {title(c)}
                  </strong>
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(c.last_message_at).toLocaleTimeString(
                      language === 'ar' ? 'ar-EG' : 'en-US',
                      {
                        hour: '2-digit',
                        minute: '2-digit',
                      },
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-gray-500">{preview(c.last_message)}</span>
                  {c.unread_count > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  {c.handled_by === 'bot' ? t('بوت', 'Bot') : t('موظف', 'Agent')}
                  {c.assignee_name ? ` · ${c.assignee_name}` : t(' · غير معيّنة', ' · Unassigned')}
                </div>
              </li>
            ))}
            {!items.length && (
              <li className="empty" role="status">
                {listLoading
                  ? t('جارٍ التحميل…', 'Loading…')
                  : t('لا توجد محادثات تطابق الفلاتر.', 'No conversations match these filters.')}
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
          {!detail || !selId ? (
            <div className="m-auto text-gray-400">
              {t('اختر محادثة لبدء المتابعة', 'Choose a conversation to follow up')}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
                <button
                  onClick={() => {
                    setSelId(null);
                    setDetail(null);
                  }}
                  className="md:hidden"
                >
                  →
                </button>
                <strong className="flex-1">
                  {CH[detail.channel_type]} {detail.contact_name || detail.contact_phone || 'زائر'}
                </strong>
                <select
                  value={detail.assigned_to ?? ''}
                  onChange={(e) =>
                    act(`/conversations/${selId}`, 'PATCH', { assignedTo: e.target.value || null })
                  }
                  className="rounded border p-1"
                >
                  <option value="">{t('غير معيّنة', 'Unassigned')}</option>
                  {team.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email}
                      {m.available ? '' : ' (غير متاح)'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => act(`/conversations/${selId}/auto-assign`)}
                  className="rounded border px-2 py-1 text-xs"
                >
                  {t('توزيع تلقائي', 'Auto assign')}
                </button>
                {detail.handled_by === 'bot' ? (
                  <button
                    onClick={() => act(`/conversations/${selId}/takeover`)}
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                  >
                    {t('استلام من البوت', 'Take over')}
                  </button>
                ) : (
                  <button
                    onClick={() => act(`/conversations/${selId}/release`)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    {t('إعادة للبوت', 'Return to bot')}
                  </button>
                )}
                {detail.status === 'closed' ? (
                  <button
                    onClick={() => act(`/conversations/${selId}`, 'PATCH', { status: 'open' })}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    {t('إعادة فتح', 'Reopen')}
                  </button>
                ) : (
                  <button
                    onClick={() => act(`/conversations/${selId}`, 'PATCH', { status: 'closed' })}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    {t('إغلاق', 'Close')}
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {hasMore && (
                  <button
                    onClick={loadOlder}
                    className="mx-auto mb-2 block rounded border bg-white px-3 py-1 text-xs"
                  >
                    {t('تحميل رسائل أقدم', 'Load older messages')}
                  </button>
                )}
                {msgs.map((m) => (
                  <MessageBubble key={m.id} m={m} conversationId={selId} name={nameOf} />
                ))}
                <div ref={bottom} />
              </div>

              <div className="border-t bg-white p-2">
                {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
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
                  <ul className="mb-1 rounded border bg-white shadow">
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
                  <div className="mb-1 flex items-center gap-2 rounded bg-gray-100 px-2 py-1 text-xs">
                    <NavIcon name="knowledge" /> {attach.filename}
                    <button onClick={() => setAttach(null)} className="text-red-600">
                      ×
                    </button>
                  </div>
                )}
                <div className={`flex items-end gap-2 rounded ${internal ? 'bg-yellow-50' : ''}`}>
                  <textarea
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
                    disabled={!internal && !!windowExpired}
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
                    className="flex-1 rounded border p-2"
                  />
                  <div className="flex flex-col gap-1">
                    <label className="cursor-pointer rounded border px-2 py-1 text-center text-xs">
                      <NavIcon name="knowledge" />
                      <input
                        aria-label={t('إرفاق ملف', 'Attach file')}
                        type="file"
                        hidden
                        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                        disabled={internal}
                      />
                    </label>
                    <button
                      aria-label={t('ملاحظة داخلية', 'Internal note')}
                      aria-pressed={internal}
                      onClick={() => setInternal(!internal)}
                      className={`rounded border px-2 py-1 text-xs ${internal ? 'bg-yellow-200' : ''}`}
                    >
                      <NavIcon name="settings" />
                    </button>
                    <button
                      onClick={send}
                      disabled={busy}
                      className="rounded bg-blue-600 px-3 py-1 text-white"
                    >
                      {busy ? '…' : t('إرسال', 'Send')}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---------- تفاصيل العميل ---------- */}
        <div className="hidden lg:contents">{customerPanel}</div>
        <Dialog
          open={showContext && !!detail}
          onClose={() => setShowContext(false)}
          title={t('ملف العميل', 'Customer profile')}
        >
          {customerPanel}
        </Dialog>
      </div>
    </div>
  );
}
