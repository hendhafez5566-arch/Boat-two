'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Dialog } from '../product/ProductUI';
import styles from './inbox-customer-panel.module.css';
export function InboxContactDialog({
  field,
  contactId,
  onClose,
  onSaved,
}: {
  field: 'name' | 'email' | null;
  contactId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!field) return;
    let active = true;
    setValue('');
    setVersion('');
    setError('');
    api<{ contact: { name: string; email: string | null; updated_at: string } }>(
      `/crm/contacts/${contactId}/profile`,
    )
      .then(({ contact }) => {
        if (active) {
          setValue(contact[field] || '');
          setVersion(contact.updated_at);
        }
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [field, contactId]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!field || !version || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/crm/contacts/${contactId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          [field]: value.trim() || (field === 'email' ? null : ''),
          expectedUpdatedAt: version,
        }),
      });
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!field}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        field === 'name'
          ? t('تعديل اسم العميل', 'Edit customer name')
          : t('تعديل البريد الإلكتروني', 'Edit Email')
      }
    >
      <form className={styles.followupForm} onSubmit={save}>
        {error && <p role="alert">{error}</p>}
        <label>
          {field === 'name' ? t('الاسم', 'Name') : t('البريد الإلكتروني', 'Email')}
          <input
            type={field === 'email' ? 'email' : 'text'}
            required={field === 'name'}
            maxLength={field === 'name' ? 120 : 254}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={!version || busy}
          />
        </label>
        <footer>
          <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!version || busy || (field === 'name' && !value.trim())}
          >
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
