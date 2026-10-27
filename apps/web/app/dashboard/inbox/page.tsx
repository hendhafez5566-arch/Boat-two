'use client';
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
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, selId]);

  const open = useCallback(async (id: string) => {
    if (selRef.current) drafts.current.write(selRef.current, composerState.current);
    const draft = drafts.current.read(id);
    selRef.current = id;
    setDetail(null);
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
  const ownerName = (d: any): string | null => {
    if (!d?.assigned_to) return d?.assignee_name || null;
    const m = team.find((x) => x.user_id === d.assigned_to);
    return m?.full_name || m?.email || d.assignee_name || names[d.assigned_to] || null;
  };

  async function upload(file: File) {
    const uploadingId = selRef.current;
    setError('');
    const f = new FormData();
    f.append('file', file);
    try {
      const result = await api<any>('/uploads', { method: 'POST', body: f });
      if (selRef.current === uploadingId) setAttach(result);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function send() {
    if (!selId || sendLock.current || busy || (!internal && detail?.blocked)) return;
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

  const slaOver = !!(
    detail &&
    detail.sla_minutes &&
    detail.last_inbound_at &&
    detail.status !== 'closed' &&
    detail.unread_count > 0 &&
    Date.now() - new Date(detail.last_inbound_at).getTime() > detail.sla_minutes * 60000
  );
  const showSla = !!(
    detail &&
    detail.sla_minutes &&
    detail.last_inbound_at &&
    detail.status !== 'closed'
  );
  const fmtTime = (v: string) =>
    new Date(v).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  const customerPanel = detail && selId && (
    <aside
      className="customer-panel cp w-full lg:w-72 overflow-y-auto bg-white p-4"
      aria-label={t('بيانات العميل', 'Customer details')}
    >
      <section className="cp-card cp-id">
        <span className="cp-avatar" aria-hidden="true">
          {String(title(detail)).trim().charAt(0).toUpperCase() || '?'}
        </span>
        <strong className="cp-name">
          {detail.contact_name || detail.contact_phone || t('زائر', 'Visitor')}
        </strong>
        <div className="inbox-chips">
          <span className="inbox-chip is-channel">
            {CH[detail.channel_type] ?? detail.channel_type}
            {detail.channel_name ? ` · ${detail.channel_name}` : ''}
          </span>
          <span className={`inbox-chip ${detail.handled_by === 'bot' ? 'is-bot' : 'is-agent'}`}>
            {detail.handled_by === 'bot' ? t('البوت', 'Bot') : t('موظف', 'Agent')}
          </span>
        </div>
        <dl className="cp-list">
          <div>
            <dt>{t('الهاتف', 'Phone')}</dt>
            <dd dir="ltr" className="cp-ltr">
              {detail.contact_phone || '—'}
            </dd>
          </div>
          <div>
            <dt>{t('الإيميل', 'Email')}</dt>
            <dd dir="ltr" className="cp-ltr">
              {detail.contact_email || '—'}
            </dd>
          </div>
          {detail.contact_since && (
            <div>
              <dt>{t('عميل منذ', 'Customer since')}</dt>
              <dd>
                {new Date(detail.contact_since).toLocaleDateString(
                  language === 'ar' ? 'ar-EG' : 'en-US',
                )}
              </dd>
            </div>
          )}
        </dl>
        <Link href="/dashboard/crm" className="btn cp-crm">
          {t('فتح CRM', 'Open CRM')}
        </Link>
      </section>

      <section className="cp-card" aria-labelledby="cp-conv">
        <h3 id="cp-conv" className="cp-h">
          {t('المحادثة', 'Conversation')}
        </h3>
        <div className="cp-statusrow">
          <span className={`inbox-chip ${detail.status === 'closed' ? '' : 'is-agent'}`}>
            {detail.status === 'closed'
              ? t('مغلقة', 'Closed')
              : detail.status === 'pending'
                ? t('معلّقة', 'Pending')
                : t('مفتوحة', 'Open')}
          </span>
          {detail.status !== 'closed' && (
            <button
              type="button"
              className="thread-btn"
              disabled={acting}
              onClick={() =>
                act(
                  `/conversations/${selId}`,
                  'PATCH',
                  { status: detail.status === 'pending' ? 'open' : 'pending' },
                  detail.status === 'pending'
                    ? t('أُلغي التعليق.', 'Hold removed.')
                    : t('عُلّقت المحادثة.', 'Conversation put on hold.'),
                )
              }
            >
              {detail.status === 'pending'
                ? t('إلغاء التعليق', 'Remove hold')
                : t('تعليق', 'Put on hold')}
            </button>
          )}
        </div>
        <label className="cp-field">
          <span>{t('القسم', 'Department')}</span>
          <select
            value={detail.department_id || ''}
            disabled={acting}
            onChange={(e) =>
              act(
                `/conversations/${selId}`,
                'PATCH',
                { departmentId: e.target.value || null },
                t('تم تحديث القسم.', 'Department updated.'),
              )
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
        <dl className="cp-list">
          <div>
            <dt>{t('المسؤول', 'Handled by')}</dt>
            <dd>
              {detail.handled_by === 'bot'
                ? `🤖 ${t('البوت', 'Bot')}${detail.flow_waiting ? ` (${t('ينتظر ردّ العميل', 'waiting for the customer')})` : ''}`
                : `🧑 ${ownerName(detail) || t('موظف (غير معيّنة)', 'Agent (unassigned)')}`}
            </dd>
          </div>
        </dl>
        {showSla && (
          <p className={`cp-status ${slaOver ? 'is-bad' : 'is-ok'}`} role="status">
            <b>SLA</b> ·{' '}
            {slaOver
              ? t('تجاوز هدف الرد', 'Response target exceeded')
              : t('ضمن هدف الرد', 'Within response target')}{' '}
            · {detail.sla_minutes} {t('دقيقة', 'min')}
          </p>
        )}
        {detail.whatsapp_window_expires_at && (
          <p className={`cp-status ${windowExpired ? 'is-bad' : 'is-ok'}`} role="status">
            <b>{t('نافذة واتساب', 'WhatsApp window')}</b> ·{' '}
            {windowExpired
              ? t('انتهت — الرد الحر معطّل', 'Expired — free-form replies are off')
              : `${t('مفتوحة حتى', 'Open until')} ${fmtTime(detail.whatsapp_window_expires_at)}`}
          </p>
        )}
      </section>

      <section className="cp-card" aria-labelledby="cp-tags">
        <h3 id="cp-tags" className="cp-h">
          {t('الوسوم', 'Tags')}
        </h3>
        <div className="cp-tags">
          {(detail.contact_tags || []).length ? (
            (detail.contact_tags || []).map((tag: string) => (
              <span className="badge cp-tag" key={tag}>
                {tag}
              </span>
            ))
          ) : (
            <span className="cp-empty">{t('لا توجد وسوم بعد', 'No tags yet')}</span>
          )}
        </div>
        <form
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
          <label className="cp-field">
            <span>{t('تعديل الوسوم', 'Edit tags')}</span>
            <input
              name="tags"
              key={detail.contact_id + (detail.contact_tags || []).join(',')}
              defaultValue={(detail.contact_tags || []).join(', ')}
              placeholder={t('وسوم مفصولة بفاصلة', 'Comma-separated tags')}
            />
          </label>
          <small className="cp-hint">
            {t('افصل بين الوسوم بفاصلة، ثم احفظ.', 'Separate tags with commas, then save.')}
          </small>
          <button className="btn btn-primary cp-save">{t('حفظ الوسوم', 'Save tags')}</button>
        </form>
      </section>

      <section className="cp-card" aria-labelledby="cp-fields">
        <h3 id="cp-fields" className="cp-h">
          {t('بيانات مخصصة', 'Custom fields')}
        </h3>
        {Object.keys(detail.contact_attributes ?? {}).length > 0 ? (
          <dl className="cp-list">
            {Object.entries(detail.contact_attributes).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="cp-empty">
            {t('لا توجد بيانات مخصصة لهذا العميل.', 'No custom fields for this customer.')}
          </p>
        )}
      </section>
    </aside>
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
            [
              'mine',
              'active',
              'important',
              'unread',
              'archived',
              'blocked',
              'closed',
              'unassigned',
              'bot',
            ] as Tab[]
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
                      active: 'inbox',
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
        <Dialog
          open={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          title={t('تصفية وإعدادات الوارد', 'Inbox filters and options')}
        >
          <header className="inbox-top flex items-center gap-3 border-b bg-white px-3 py-2">
            <a href="/dashboard" className="underline">
              {t('الرئيسية', 'Overview')}
            </a>
            <h1 className="inbox-title flex-1 text-sm font-semibold">
              {t('صندوق الوارد', 'Inbox')}
              {typeof counts.unread === 'number' && counts.unread > 0 && (
                <span
                  className="inbox-unread-total"
                  aria-label={t('محادثات غير مقروءة', 'Unread conversations')}
                >
                  {counts.unread}
                </span>
              )}
            </h1>
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
        </Dialog>

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
            <div className={styles.searchBar}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={t('بحث المحادثات', 'Search conversations')}
                placeholder={t(
                  'بحث بالاسم أو الرقم أو نص الرسالة…',
                  'Search name, phone or messages…',
                )}
                className="inbox-search w-full rounded border p-1.5"
              />
              <button
                type="button"
                className={styles.filterButton}
                aria-label={t('الفلاتر', 'Filters')}
                onClick={() => setOptionsOpen(true)}
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
                <NavIcon name="redo" />
              </button>
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
            {!detail || !selId ? (
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
                <div className="thread-head flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
                  <button
                    aria-label={t('رجوع للقائمة', 'Back to list')}
                    onClick={() => {
                      setSelId(null);
                      setDetail(null);
                    }}
                    className="thread-back md:hidden"
                  >
                    {language === 'ar' ? '→' : '←'}
                  </button>
                  <div className="thread-who">
                    <strong className="truncate">
                      {detail.contact_name || detail.contact_phone || t('زائر', 'Visitor')}
                    </strong>
                    <div className="inbox-chips">
                      <span className="inbox-chip is-channel">
                        {CH[detail.channel_type] ?? detail.channel_type}
                      </span>
                      <span
                        className={`inbox-chip ${detail.handled_by === 'bot' ? 'is-bot' : 'is-agent'}`}
                      >
                        {detail.handled_by === 'bot'
                          ? t('البوت يتولى', 'Handled by bot')
                          : t('موظف يتولى', 'Handled by agent')}
                      </span>
                      <span
                        className={`inbox-chip ${detail.status === 'closed' ? '' : 'is-agent'}`}
                      >
                        {detail.status === 'closed' ? t('مغلقة', 'Closed') : t('مفتوحة', 'Open')}
                      </span>
                    </div>
                  </div>
                  <div
                    className="handoff"
                    role="group"
                    aria-label={t('الإسناد والتحويل', 'Assignment and handoff')}
                  >
                    <div
                      className={`handoff-owner ${detail.handled_by === 'bot' ? 'is-bot' : 'is-agent'}`}
                    >
                      <small>{t('المسؤول الآن', 'Responsible now')}</small>
                      <b>
                        {detail.handled_by === 'bot'
                          ? `🤖 ${t('البوت', 'Bot')}`
                          : `🧑 ${ownerName(detail) || t('موظف (غير معيّنة)', 'Agent (unassigned)')}`}
                      </b>
                    </div>
                    <select
                      value={detail.assigned_to ?? ''}
                      disabled={acting}
                      onChange={(e) =>
                        act(
                          `/conversations/${selId}`,
                          'PATCH',
                          { assignedTo: e.target.value || null },
                          t('تم تحديث الموظف المسؤول.', 'Assignee updated.'),
                        )
                      }
                      aria-label={t('إسناد إلى موظف', 'Assign to agent')}
                      className="thread-assign rounded border p-1"
                    >
                      <option value="">{t('غير معيّنة', 'Unassigned')}</option>
                      {team.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name || m.email}
                          {m.available ? '' : t(' (غير متاح)', ' (unavailable)')}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={acting}
                      onClick={() =>
                        act(
                          `/conversations/${selId}/auto-assign`,
                          'POST',
                          undefined,
                          t('تم التوزيع التلقائي.', 'Auto-assigned.'),
                        )
                      }
                      className="thread-btn"
                    >
                      {t('توزيع تلقائي', 'Auto assign')}
                    </button>
                    {detail.handled_by === 'bot' ? (
                      <button
                        disabled={acting}
                        onClick={() => {
                          if (
                            confirm(
                              t(
                                'استلام المحادثة؟ سيتوقف البوت عن الرد على هذا العميل حتى تعيدها له.',
                                'Take over? The bot will stop replying to this customer until you hand it back.',
                              ),
                            )
                          )
                            void act(
                              `/conversations/${selId}/takeover`,
                              'POST',
                              undefined,
                              t(
                                'استلمت المحادثة. البوت متوقف عنها.',
                                'You took over. The bot is paused for this chat.',
                              ),
                            );
                        }}
                        className="thread-btn is-primary"
                      >
                        {acting ? '…' : t('استلام من البوت', 'Take over')}
                      </button>
                    ) : (
                      <button
                        disabled={acting}
                        onClick={() => {
                          if (
                            confirm(
                              t(
                                'إعادة إدارة المحادثة للبوت؟ سيستأنف التعامل مع الرسائل الجديدة حسب إعدادات التدفق.',
                                'Return this chat to the bot? It will handle new messages according to its flow settings.',
                              ),
                            )
                          )
                            void act(
                              `/conversations/${selId}/release`,
                              'POST',
                              undefined,
                              t('أُعيدت المحادثة للبوت.', 'Handed back to the bot.'),
                            );
                        }}
                        className="thread-btn"
                      >
                        {acting ? '…' : t('إعادة للبوت', 'Return to bot')}
                      </button>
                    )}
                    <button
                      disabled={acting}
                      type="button"
                      className="thread-btn"
                      onClick={() =>
                        void act(
                          `/conversations/${selId}`,
                          'PATCH',
                          { important: !detail.important },
                          t('حُدّثت الأهمية.', 'Importance updated.'),
                        )
                      }
                    >
                      {detail.important
                        ? t('إزالة من المهمة', 'Remove Important')
                        : t('تمييز كمهمة', 'Mark Important')}
                    </button>
                    <button
                      disabled={acting}
                      type="button"
                      className="thread-btn"
                      onClick={() =>
                        void act(
                          `/conversations/${selId}`,
                          'PATCH',
                          { archived: !detail.archived_at },
                          t('حُدّثت الأرشفة.', 'Archive updated.'),
                        )
                      }
                    >
                      {detail.archived_at ? t('استعادة', 'Unarchive') : t('أرشفة', 'Archive')}
                    </button>
                    <button
                      disabled={acting}
                      type="button"
                      className="thread-btn"
                      onClick={() =>
                        void act(
                          `/conversations/${selId}`,
                          'PATCH',
                          { blocked: !detail.blocked },
                          t('حُدّث الحظر لهذا الحساب.', 'Account block updated.'),
                        )
                      }
                    >
                      {detail.blocked ? t('إلغاء الحظر', 'Unblock') : t('حظر', 'Block')}
                    </button>
                    {detail.status === 'closed' ? (
                      <button
                        disabled={acting}
                        onClick={() =>
                          act(
                            `/conversations/${selId}`,
                            'PATCH',
                            { status: 'open' },
                            t('أُعيد فتح المحادثة.', 'Conversation reopened.'),
                          )
                        }
                        className="thread-btn is-primary"
                      >
                        {t('إعادة فتح', 'Reopen')}
                      </button>
                    ) : (
                      <button
                        disabled={acting}
                        onClick={() => {
                          if (confirm(t('إغلاق هذه المحادثة؟', 'Close this conversation?')))
                            void act(
                              `/conversations/${selId}`,
                              'PATCH',
                              { status: 'closed' },
                              t('أُغلقت المحادثة.', 'Conversation closed.'),
                            );
                        }}
                        className="thread-btn is-danger"
                      >
                        {t('إغلاق', 'Close')}
                      </button>
                    )}
                  </div>
                </div>

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
                <div className="thread-msgs flex-1 overflow-y-auto p-3">
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
                      {t('رد للعميل', 'Reply to customer')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={internal}
                      className={internal ? 'is-on is-note' : ''}
                      onClick={() => setInternal(true)}
                    >
                      🔒 {t('ملاحظة داخلية', 'Internal note')}
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
                        <NavIcon name="knowledge" />{' '}
                        <span className="composer-attach-label">{t('إرفاق', 'Attach')}</span>
                        <input
                          aria-label={t('إرفاق ملف', 'Attach file')}
                          type="file"
                          hidden
                          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                          disabled={internal}
                        />
                      </label>
                      <button
                        onClick={send}
                        disabled={busy || (!internal && !!detail?.blocked)}
                        className={`composer-send ${internal ? 'is-note' : ''}`}
                      >
                        {busy
                          ? '…'
                          : internal
                            ? t('حفظ الملاحظة', 'Save note')
                            : t('إرسال', 'Send')}
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
    </div>
  );
}
