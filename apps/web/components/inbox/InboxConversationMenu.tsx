'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './inbox-conversation-menu.module.css';
export function InboxConversationMenu({
  conversation,
  disabled,
  onAction,
}: {
  conversation: {
    id: string;
    important?: boolean;
    archived_at?: string | null;
    blocked?: boolean;
    status: string;
    unread_count?: number;
  };
  disabled: boolean;
  onAction: (path: string, method: string, body?: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useLocale();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!position) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPosition(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPosition(null);
        trigger.current?.focus();
      }
    };
    const close = () => setPosition(null);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [position]);
  async function action(kind: 'read' | 'unread' | 'update', body?: Record<string, unknown>) {
    if(body?.blocked===true&&!window.confirm(t('حظر العميل ومنع المحادثة؟','Block this customer?')))return;
    const ok = await onAction(
      `/conversations/${conversation.id}${kind === 'update' ? '' : '/' + kind}`,
      kind === 'update' ? 'PATCH' : 'POST',
      body,
    );
    if (ok) {
      setPosition(null);
      setError('');
    } else setError(t('تعذر تنفيذ الإجراء. حاول مرة أخرى.', 'The action failed. Try again.'));
  }
  return (
    <div
      ref={root}
      className={styles.root}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {event.stopPropagation();if(event.key==='Escape'){setPosition(null);trigger.current?.focus();}}}
    >
      <button className={styles.quickStar} type="button" disabled={disabled} aria-pressed={!!conversation.important} title={conversation.important?t('إلغاء التمييز','Remove important flag'):t('تمييز كمهمة','Mark important')} aria-label={conversation.important?t('إلغاء التمييز','Remove important flag'):t('تمييز كمهمة','Mark important')} onClick={()=>void action('update',{important:!conversation.important})}><NavIcon name="star"/></button>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={t('إجراءات المحادثة في القائمة', 'Conversation row actions')}
        title={t('خيارات المحادثة', 'Conversation options')}
        aria-expanded={!!position}
        onClick={(event) => {
          if (position) {
            setPosition(null);
            return;
          }
          const r = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: r.bottom + 250 < window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - 250),
            left: Math.max(8,Math.min(r.right-216,window.innerWidth-224)),
          });
          setError('');
        }}
      >
        <NavIcon name="moreVertical" />
      </button>
      {position && (
        <div
          className={styles.menu}
          style={position}
          role="group"
          aria-label={t('حالات المحادثة', 'Conversation status actions')}
        >
          {error && <p role="alert">{error}</p>}
          <button type="button" disabled={disabled || !(conversation.unread_count ?? 0)} onClick={() => void action('read')}>
            <NavIcon name="eye" />
            {t('تحديد كمقروءة', 'Mark as read')}
          </button>
          <button type="button" disabled={disabled || (conversation.unread_count ?? 0) > 0} onClick={() => void action('unread')}>
            <NavIcon name="mail" />
            {t('تحديد كغير مقروءة', 'Mark as unread')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void action('update', { archived: !conversation.archived_at })}
          >
            <NavIcon name="archive" />
            {conversation.archived_at
              ? t('إلغاء الأرشفة', 'Unarchive')
              : t('أرشفة', 'Mark As Archived')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              void action('update', { status: conversation.status === 'closed' ? 'open' : 'closed' })
            }
          >
            <NavIcon name="check" />
            {conversation.status === 'closed'
              ? t('إعادة فتح', 'Reopen')
              : t('حل المحادثة', 'Mark As Resolve')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void action('update', { blocked: !conversation.blocked })}
          >
            <NavIcon name="blocked" />
            {conversation.blocked
              ? t('إلغاء حظر العميل', 'Unblock User')
              : t('حظر العميل', 'Block User')}
          </button>
        </div>
      )}
    </div>
  );
}
