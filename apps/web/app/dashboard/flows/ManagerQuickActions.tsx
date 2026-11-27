'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { channelHref } from '../../../lib/channel-context';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
import { Dialog } from '../../../components/product/ProductUI';
import SystemActionsPanel from '../../../components/workspace/SystemActionsPanel';
import { managerError } from './manager-feedback';
import styles from './manager.module.css';

const actions = [
  [
    'get_started',
    'بدء المحادثة',
    'Get-started',
    'التدفق الافتراضي عند بدء المحادثة.',
    'Default flow when a user starts the bot.',
    'circleCheck',
  ],
  [
    'no_match',
    'لا يوجد تطابق',
    'No Match',
    'الرد عندما لا تطابق الرسالة أي كلمة مفتاحية.',
    'Reply when no keywords match the message.',
    'unread',
  ],
  [
    'location_reply',
    'الرد على الموقع',
    'Location Reply',
    'الرد عندما يرسل المستخدم موقعًا.',
    'Reply when a user sends a location.',
    'pin',
  ],
  [
    'unsubscribe',
    'إلغاء الاشتراك',
    'Un-subscribe',
    'الرد عند إلغاء الاشتراك في الرسائل.',
    'Reply when a user opts out of messages.',
    'blocked',
  ],
  [
    'resubscribe',
    'إعادة الاشتراك',
    'Re-subscribe',
    'الرد عند طلب الاشتراك مرة أخرى.',
    'Reply when a user opts back in to messages.',
    'user',
  ],
  [
    'human',
    'التحدث لموظف',
    'Chat with Human',
    'تحويل المحادثة إلى أحد أعضاء الفريق.',
    'Hand over the chat to a live agent.',
    'support',
  ],
  [
    'bot',
    'العودة للبوت',
    'Chat with Bot',
    'إعادة المحادثة إلى المساعد الآلي.',
    'Switch the chat back to the bot.',
    'agents',
  ],
] as const;
type Config = {
  revision: number;
  actions: Record<string, { enabled: boolean; flowId: string | null }>;
};

export default function ManagerQuickActions({
  channelId,
  flowQuota,
}: {
  channelId: string;
  flowQuota: { used: number; limit: number };
}) {
  const { t, language } = useLocale();
  const config = useData<Config>(channelId ? `/channels/${channelId}/system-actions` : null, {
    revision: 0,
    actions: {},
  });
  const atFlowLimit = flowQuota.limit >= 0 && flowQuota.used >= flowQuota.limit;
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function create(kind: string) {
    if (lock.current || !channelId || atFlowLimit) return;
    lock.current = true;
    setBusy(kind);
    setError('');
    try {
      const flow = await api<{ id: string }>(
        `/channels/${channelId}/system-actions/${kind}/draft`,
        { method: 'POST', body: JSON.stringify({ language }) },
      );
      window.location.assign(channelHref(`/dashboard/flows/${flow.id}`, channelId));
    } catch (e) {
      setError(managerError(e, t));
      setBusy('');
      lock.current = false;
    }
  }
  const close = () => {
    setAdvanced(false);
    void config.reload();
  };
  return (
    <section className={styles.quickActions} aria-busy={config.loading || !!busy}>
      <header className={styles.contentHeader}>
        <div>
          <h2>{t('إجراءات البوت', 'Action Buttons')}</h2>
          <p>
            {t(
              'إدارة رسائل البداية وعدم التطابق والإجراءات السريعة.',
              'Manage system action buttons, get started, no match and quick actions.',
            )}
          </p>
        </div>
        <button type="button" className="btn" disabled={!channelId||config.loading||!!busy||!!config.error} onClick={() => setAdvanced(true)}>
          <NavIcon name="settings" />
          {t('إعداد الإجراءات', 'Configure Actions')}
        </button>
      </header>
      {(error || config.error) && (
        <p className="notice error" role="alert">
          {error || config.error} {config.error&&<button type="button" className="btn" disabled={config.loading} onClick={()=>void config.reload()}>{t("إعادة المحاولة","Retry")}</button>}
        </p>
      )}
      {config.loading ? (
        <p role="status">{t('جارٍ تحميل الإجراءات…', 'Loading actions…')}</p>
      ) : !config.error && channelId ? (
        <>
        {atFlowLimit && (
          <p className="notice" role="status">
            {t(
              'اكتملت سعة التدفقات في الباقة الحالية. يمكنك تعديل الإجراءات الموجودة أو مراجعة الباقات قبل إنشاء مسودة جديدة.',
              'Your flow quota is full. You can edit existing actions or review plans before creating a new draft.',
            )}{' '}
            <Link href="/dashboard/subscription?tab=plans">{t('عرض الباقات', 'View plans')}</Link>
          </p>
        )}
        <div className={styles.actionCards}>
          {actions.map(([key, ar, en, descriptionAr, descriptionEn, icon]) => {
            const entry = config.data.actions[key];
            const content = (
              <>
                <span className={styles.actionCardIcon}>
                  <NavIcon name={icon} />
                </span>
                <span className={styles.actionCardText}>
                  <strong>{t(ar, en)}</strong>
                  <small>{t(descriptionAr, descriptionEn)}</small>
                  <em>{entry?.flowId?(entry.enabled?t('مفعّل في الإعدادات','Enabled in settings'):t('مرتبط وغير مفعّل','Linked, disabled')):t('إنشاء مسودة','Create draft')}</em>
                </span>
                <span className={styles.actionCardArrow}>
                  <NavIcon name="chevron" />
                </span>
              </>
            );
            return entry?.flowId ? (
              <Link
                key={key}
                className={styles.actionCard}
                href={channelHref(`/dashboard/flows/${entry.flowId}`, channelId)}
              >
                {content}
              </Link>
            ) : (
              <button
                key={key}
                className={styles.actionCard}
                type="button"
                disabled={!!busy || !channelId || atFlowLimit}
                onClick={() => void create(key)}
              >
                {content}
              </button>
            );
          })}
        </div>
        </>
      ) : null}
      <p className={styles.actionHint}>
        {t(
          'المسودة الجديدة لا تفعّل الرد تلقائيًا. انشر التدفق ثم اختره من إعداد الإجراءات لربطه.',
          'A new draft does not activate replies automatically. Publish it, then choose it in Configure Actions to link it.',
        )}
      </p>
      <Dialog
        className={styles.managerDialog}
        open={advanced}
        onClose={close}
        title={t('إعداد الإجراءات السريعة', 'Configure Quick Actions')}
      >
        {advanced && <SystemActionsPanel channelId={channelId} />}
        <div className={styles.dialogFooter}>
          <button className="btn" type="button" onClick={close}>
            {t('إغلاق', 'Close')}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
