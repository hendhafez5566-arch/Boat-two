'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useLocale } from '../product/locale';
import {safeMediaUrl} from '../../lib/media-url';
import { apiBlob } from '../../lib/api';

function ProviderMedia({
  conversationId,
  messageId,
  kind,
}: {
  conversationId: string;
  messageId: string;
  kind: string;
}) {
  const { t } = useLocale();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    apiBlob(`/conversations/${conversationId}/messages/${messageId}/media`)
      .then((b) => {
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => setFailed(true));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [conversationId, messageId]);
  if (failed)
    return <div className="text-xs opacity-70">{t('تعذّر تحميل الوسائط (قد تكون انتهت صلاحيتها)', 'Unable to load media; it may have expired')}</div>;
  if (!src) return <div className="text-xs opacity-70">{t('جارٍ التحميل…', 'Loading…')}</div>;
  if (kind === 'image') return <img src={src} alt="" className="mb-1 max-h-64 rounded" />;
  if (kind === 'video') return <video src={src} controls className="mb-1 max-h-64 rounded" />;
  if (kind === 'audio') return <audio src={src} controls className="mb-1" />;
  return (
    <a href={src} download className="msg-file">
      📎 {t('تنزيل الملف', 'Download file')}
    </a>
  );
}

const TICKS: Record<string, string> = { queued: '⏳', sent: '✓', delivered: '✓✓', read: '✓✓' };

export function eventText(c: any, name: (id?: string) => string, language = 'ar'): string {
  switch (c?.event) {
    case 'assignment_waiting':
      return c.reason === 'awaiting_service'
        ? language === 'ar'
          ? 'بانتظار تحديد نوع الخدمة من العميل'
          : 'Waiting for the customer to choose a service'
        : language === 'ar'
          ? 'بانتظار موظف مؤهل؛ راجع قائمة التوزيع'
          : 'Waiting for an eligible employee; check the assignment queue';
    case 'assigned':
      return c.auto
        ? (language === 'ar' ? `عُيّنت تلقائياً إلى ${name(c.userId)}` : `Automatically assigned to ${name(c.userId)}`)
        : (language === 'ar' ? `عيّن ${name(c.by)} المحادثة إلى ${name(c.userId)}` : `${name(c.by)} assigned the conversation to ${name(c.userId)}`);
    case 'unassigned':
      return language === 'ar' ? `ألغى ${name(c.by)} التعيين` : `${name(c.by)} removed the assignment`;
    case 'status':
      if (language !== 'ar') return `${name(c.by)} changed the status to ${c.status}`;
      return `${name(c.by)} غيّر الحالة إلى ${({ open: 'مفتوحة', pending: 'معلّقة', closed: 'مغلقة' } as any)[c.status] ?? c.status}`;
    case 'taken_over':
      return language === 'ar' ? `استلم ${name(c.by)} المحادثة` : `${name(c.by)} took over the conversation`;
    case 'returned_to_bot':
      if (language !== 'ar') return `Conversation returned to the bot${c.by ? ` by ${name(c.by)}` : ''}`;
      return `أُعيدت المحادثة إلى البوت${c.by ? ` بواسطة ${name(c.by)}` : ''}`;
    case 'human_session_expired':
      return language === 'ar' ? 'انتهت جلسة الموظف وأعيدت المحادثة إلى البوت' : 'The employee session expired; conversation returned to the bot';
    case 'sla_escalated':
      if (language !== 'ar') return `Response time exceeded; conversation escalated${c.assignedTo ? ' to '+name(c.assignedTo) : ''}`;
      return `تجاوز وقت SLA؛ جرى التصعيد${c.assignedTo ? ' إلى ' + name(c.assignedTo) : ''}`;
    case 'handoff':
      return language === 'ar' ? 'حوّل البوت المحادثة إلى موظف' : 'The bot transferred the conversation to an employee';
    case 'blocked': return language === 'ar' ? 'حُظر العميل على هذه القناة' : 'Customer blocked on this channel';
    case 'unblocked': return language === 'ar' ? 'أُلغي حظر العميل على هذه القناة' : 'Customer unblocked on this channel';
    default:
      return String(c?.event ?? '');
  }
}

export default function MessageBubble({
  m,
  conversationId,
  name,
}: {
  m: any;
  conversationId: string;
  name: (id?: string) => string;
}) {
  const { t, language } = useLocale();
  const c = m.content ?? {};
  const mediaUrl=safeMediaUrl(c.media?.url),headerUrl=safeMediaUrl(c.header?.url);
  const messageDate = new Date(m.created_at ?? m.createdAt);
  const time = messageDate.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const fullTimestamp = messageDate.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const senderType = m.sender_type ?? m.senderType;
  const isInternal = m.is_internal ?? m.isInternal;

  if (senderType === 'system') {
    return (
      <div className="msg-system" data-event={String(c.event || 'other')}>
        <span className="msg-system-label">{eventText(c, name, language)}</span>
        <time dateTime={messageDate.toISOString()} title={fullTimestamp}>{time}</time>
      </div>
    );
  }
  if (isInternal) {
    return (
      <div className="msg-note">
        <div className="msg-note-head">
          🔒 {t('ملاحظة داخلية', 'Internal note')} ·{' '}
          {m.sender_name ?? name(m.sender_user_id ?? m.senderUserId)} · <time title={fullTimestamp}>{time}</time>
        </div>
        <div className="whitespace-pre-wrap">{c.text}</div>
      </div>
    );
  }

  const mine = (m.direction ?? '') === 'out';
  const who =
    senderType === 'bot'
      ? t('البوت', 'Bot')
      : senderType === 'agent'
        ? (m.sender_name ?? name(m.sender_user_id ?? m.senderUserId))
        : null;
  const status = m.status;
  const failureReason = m.error === 'EXTERNAL_DELIVERY_DISABLED'
    ? t('الإرسال الخارجي غير مفعّل لهذه المحادثة.', 'External delivery is not enabled for this conversation.')
    : m.error === 'CHANNEL_INACTIVE'
      ? t('قناة المراسلة غير نشطة.', 'The messaging channel is inactive.')
      : m.error === 'RECIPIENT_UNAVAILABLE'
        ? t('بيانات المستلم غير متاحة.', 'Recipient details are unavailable.')
        : m.error ? String(m.error).slice(0, 100) : '';
  const options = [...(c.buttons ?? []), ...(c.list?.sections ?? []).flatMap((s: any) => s.rows)];

  return (
    <div className={`msg-row ${mine ? 'is-out' : 'is-in'}`}>
      <div className="msg-stack">
        <div
          className={`msg-bubble ${mine ? 'is-out' : 'is-in'} ${status === 'failed' ? 'is-failed' : ''}`}
        >
          {c.telegramSender && <small className="block">{c.telegramSender.name}</small>}
          {c.header?.type === 'text' && <strong className="block">{c.header.text}</strong>}
          {c.header?.type === 'image' && headerUrl && (
            <img src={headerUrl} alt="" className="mb-1 max-h-64 rounded" />
          )}
          {c.media &&
            (mediaUrl ? (
              c.media.kind === 'image' ? (
                <a href={mediaUrl} target="_blank" rel="noreferrer">
                  <img src={mediaUrl} alt="" className="mb-1 max-h-64 rounded" />
                </a>
              ) : c.media.kind === 'video' ? (
                <video src={mediaUrl} controls className="mb-1 max-h-64 rounded" />
              ) : c.media.kind === 'audio' ? (
                <audio src={mediaUrl} controls className="mb-1" />
              ) : (
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="msg-file">
                  📎 {c.media.filename ?? 'ملف'}
                </a>
              )
            ) : c.media.url ? <span>{t('رابط مرفق غير آمن — تم منعه','Unsafe attachment link blocked')}</span> : c.media.providerMediaId ? (
              <ProviderMedia conversationId={conversationId} messageId={m.id} kind={c.media.kind} />
            ) : null)}
          {c.media?.caption && <div className="whitespace-pre-wrap">{c.media.caption}</div>}
          {c.text && <div className="whitespace-pre-wrap break-words">{c.text}</div>}
          {c.footer && <small className="block opacity-80">{c.footer}</small>}
          {c.order && (
            <section>
              <strong>طلب من الكتالوج</strong>
              {c.order.items.map((item: any, i: number) => (
                <p key={i}>
                  {item.retailerId} × {item.quantity} · {item.price} {item.currency}
                </p>
              ))}
            </section>
          )}
          {c.flowReply && (
            <details>
              <DisclosureSummary>بيانات نموذج WhatsApp</DisclosureSummary>
              <pre dir="ltr">{JSON.stringify(c.flowReply, null, 2)}</pre>
            </details>
          )}
          {c.location && <div>📍 {c.location.name ?? `${c.location.lat}, ${c.location.lng}`}</div>}
          {c.reply && !c.text && <div>↩ {c.reply.title}</div>}
          {options.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {options.map((o: any) => (
                <span
                  key={o.id}
                  className="rounded-full border border-current px-2 py-0.5 text-xs opacity-80"
                >
                  {o.title}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={`msg-meta ${status === 'failed' ? 'is-delivery-failed' : ''}`} title={who || undefined}>
          <time dateTime={messageDate.toISOString()} title={fullTimestamp}>{time}</time>
          {mine && status && status !== 'failed' && (
            <span
              className={status === 'read' ? 'text-sky-200' : ''}
              title={status === 'queued'
                ? t('في انتظار الإرسال إلى القناة', 'Waiting for channel delivery')
                : status === 'sent'
                  ? t('تم الإرسال إلى القناة', 'Sent to channel')
                  : status === 'delivered'
                    ? t('وصلت للعميل', 'Delivered to customer')
                    : status === 'read'
                      ? t('قرأها العميل', 'Read by customer')
                      : undefined}
              aria-label={status === 'queued'
                ? t('الرسالة لم تُرسل بعد', 'Message not sent yet')
                : status === 'sent' ? t('مرسلة', 'Sent')
                  : status === 'delivered' ? t('تم التسليم', 'Delivered')
                  : status === 'read' ? t('مقروءة', 'Read') : undefined}
            >{TICKS[status] ?? ''}</span>
          )}
          {status === 'failed' && (
            <details className="msg-delivery-error" title={m.error || undefined}>
              <summary>
                <span className="msg-delivery-icon" aria-hidden="true">!</span>
                <strong>{t('لم تصل الرسالة', 'Message not delivered')}</strong>
                {failureReason && <span className="msg-delivery-more">{t('معرفة السبب', 'View reason')}</span>}
              </summary>
              {failureReason && <p>{failureReason}</p>}
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
