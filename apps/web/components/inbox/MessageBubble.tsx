'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { apiBlob } from '../../lib/api';

function ProviderMedia({ conversationId, messageId, kind }: { conversationId: string; messageId: string; kind: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    apiBlob(`/conversations/${conversationId}/messages/${messageId}/media`).then((b) => { url = URL.createObjectURL(b); setSrc(url); }).catch(() => setFailed(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [conversationId, messageId]);
  if (failed) return <div className="text-xs opacity-70">تعذّر تحميل الوسائط (قد تكون انتهت صلاحيتها)</div>;
  if (!src) return <div className="text-xs opacity-70">جارٍ التحميل…</div>;
  if (kind === 'image') return <img src={src} alt="" className="mb-1 max-h-64 rounded" />;
  if (kind === 'video') return <video src={src} controls className="mb-1 max-h-64 rounded" />;
  if (kind === 'audio') return <audio src={src} controls className="mb-1" />;
  return <a href={src} download className="underline">تنزيل الملف</a>;
}

const TICKS: Record<string, string> = { queued: '⏳', sent: '✓', delivered: '✓✓', read: '✓✓' };

export function eventText(c: any, name: (id?: string) => string): string {
  switch (c?.event) {
    case 'assigned': return c.auto ? `عُيّنت تلقائياً إلى ${name(c.userId)}` : `عيّن ${name(c.by)} المحادثة إلى ${name(c.userId)}`;
    case 'unassigned': return `ألغى ${name(c.by)} التعيين`;
    case 'status': return `${name(c.by)} غيّر الحالة إلى ${({ open: 'مفتوحة', pending: 'معلّقة', closed: 'مغلقة' } as any)[c.status] ?? c.status}`;
    case 'taken_over': return `استلم ${name(c.by)} المحادثة`;
    case 'returned_to_bot': return `أُعيدت المحادثة إلى البوت${c.by ? ` بواسطة ${name(c.by)}` : ''}`;
    case 'handoff': return 'حوّل البوت المحادثة إلى موظف';
    default: return String(c?.event ?? '');
  }
}

export default function MessageBubble({ m, conversationId, name }: { m: any; conversationId: string; name: (id?: string) => string }) {
  const c = m.content ?? {};
  const time = new Date(m.created_at ?? m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const senderType = m.sender_type ?? m.senderType;
  const isInternal = m.is_internal ?? m.isInternal;

  if (senderType === 'system') {
    return <div className="my-1 text-center text-xs text-gray-500">{eventText(c, name)} · {time}</div>;
  }
  if (isInternal) {
    return (
      <div className="mx-auto my-1 max-w-[80%] rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm">
        <div className="mb-0.5 text-xs text-yellow-700">🔒 ملاحظة داخلية · {m.sender_name ?? name(m.sender_user_id ?? m.senderUserId)} · {time}</div>
        <div className="whitespace-pre-wrap">{c.text}</div>
      </div>
    );
  }

  const mine = (m.direction ?? '') === 'out';
  const who = senderType === 'bot' ? '🤖 البوت' : senderType === 'agent' ? m.sender_name ?? name(m.sender_user_id ?? m.senderUserId) : null;
  const status = m.status;
  const options = [...(c.buttons ?? []), ...(c.list?.sections ?? []).flatMap((s: any) => s.rows)];

  return (
    <div className={`my-1 flex ${mine ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'border bg-white'}`}>
        {mine && who && <div className="mb-0.5 text-xs opacity-80">{who}</div>}
        {c.header?.type === 'text' && <strong className="block">{c.header.text}</strong>}
        {c.header?.type === 'image' && <img src={c.header.url} alt="" className="mb-1 max-h-64 rounded" />}
        {c.media &&
          (c.media.url ? (
            c.media.kind === 'image' ? <a href={c.media.url} target="_blank" rel="noreferrer"><img src={c.media.url} alt="" className="mb-1 max-h-64 rounded" /></a>
            : c.media.kind === 'video' ? <video src={c.media.url} controls className="mb-1 max-h-64 rounded" />
            : c.media.kind === 'audio' ? <audio src={c.media.url} controls className="mb-1" />
            : <a href={c.media.url} target="_blank" rel="noreferrer" className="underline">📎 {c.media.filename ?? 'ملف'}</a>
          ) : c.media.providerMediaId ? (
            <ProviderMedia conversationId={conversationId} messageId={m.id} kind={c.media.kind} />
          ) : null)}
        {c.media?.caption && <div className="whitespace-pre-wrap">{c.media.caption}</div>}
        {c.text && <div className="whitespace-pre-wrap break-words">{c.text}</div>}
        {c.footer && <small className="block opacity-80">{c.footer}</small>}
        {c.location && <div>📍 {c.location.name ?? `${c.location.lat}, ${c.location.lng}`}</div>}
        {c.reply && !c.text && <div>↩ {c.reply.title}</div>}
        {options.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{options.map((o: any) => <span key={o.id} className="rounded-full border border-current px-2 py-0.5 text-xs opacity-80">{o.title}</span>)}</div>}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
          <span>{time}</span>
          {mine && status && status !== 'failed' && <span className={status === 'read' ? 'text-sky-200' : ''}>{TICKS[status] ?? ''}</span>}
          {status === 'failed' && <span title={m.error}>⚠ فشل الإرسال{m.error ? `: ${String(m.error).slice(0, 60)}` : ''}</span>}
        </div>
      </div>
    </div>
  );
}
