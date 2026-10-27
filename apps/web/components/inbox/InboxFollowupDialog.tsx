'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Dialog } from '../product/ProductUI';
import styles from './inbox-customer-panel.module.css';
export function InboxFollowupDialog({
  open,
  detail,
  onClose,
  onSaved,
}: {
  open: boolean;
  detail: { contact_id: string; assigned_to?: string | null };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLocale();
  const submitLock = useRef(false);
  const [followupBusy, setFollowupBusy] = useState(false);
  const [followupError, setFollowupError] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reason, setReason] = useState('');
  function quickTime(hours: number) {
    const date = new Date(Date.now() + hours * 3600000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setDueAt(date.toISOString().slice(0, 16));
  }
  async function saveFollowup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || !reason.trim() || !dueAt) return;
    submitLock.current = true;
    setFollowupBusy(true);
    setFollowupError('');
    try {
      await api('/crm/tasks', {
        method: 'POST',
        body: JSON.stringify({
          contactId: detail.contact_id,
          title: reason.trim(),
          dueAt: new Date(dueAt).toISOString(),
          assignedTo: detail.assigned_to || null,
        }),
      });
      setReason('');
      onClose();
      await onSaved();
    } catch (error) {
      setFollowupError((error as Error).message);
    } finally {
      submitLock.current = false;
      setFollowupBusy(false);
    }
  }
  useEffect(() => {
    if (open) {
      quickTime(24);
      setReason('');
      setFollowupError('');
    }
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!followupBusy) onClose();
      }}
      className={styles.followupDialog}
      title={t('تعيين متابعة', 'Set Follow-up')}
    >
      <form className={styles.followupForm} onSubmit={saveFollowup}>
        <p>{t('حدد موعد تذكير وسبب المتابعة', 'Schedule a reminder with a reason')}</p>
        {followupError && <p role="alert">{followupError}</p>}
        <label>
          {t('التاريخ والوقت', 'Date & Time')} *
          <input
            required
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            disabled={followupBusy}
          />
        </label>
        <div className={styles.quickTimes}>
          {[1, 2, 4, 6, 12, 24].map((hours) => (
            <button
              type="button"
              key={hours}
              disabled={followupBusy}
              onClick={() => quickTime(hours)}
            >
              {hours === 24
                ? t('يوم واحد', '1 Day')
                : `${hours} ${t('ساعة', hours === 1 ? 'Hour' : 'Hours')}`}
            </button>
          ))}
        </div>
        <label>
          {t('السبب', 'Reason')} *
          <input
            required
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={followupBusy}
          />
        </label>
        <footer>
          <button
            type="button"
            className={styles.secondary}
            disabled={followupBusy}
            onClick={() => onClose()}
          >
            {t('إلغاء', 'Cancel')}
          </button>
          <button className="btn btn-primary" disabled={followupBusy || !reason.trim() || !dueAt}>
            {followupBusy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المتابعة', 'Save Follow-up')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
