'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { parseContactField, type ContactField } from '../../lib/inbox-contact-fields';
import { useLocale } from '../product/locale';
import { Dialog } from '../product/ProductUI';
import styles from './inbox-customer-panel.module.css';
export function InboxFieldDialog({
  field,
  contactId,
  onClose,
  onSaved,
}: {
  field: ContactField | null;
  contactId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!field) return;
    let active = true;
    setValue('');
    setVersion('');
    setError('');
    api<{ contact: { updated_at: string; attributes: Record<string, unknown> } }>(
      `/crm/contacts/${contactId}/profile`,
    )
      .then(({ contact }) => {
        if (!active) return;
        setValue(
          contact.attributes[field.key] == null ? '' : String(contact.attributes[field.key]),
        );
        setVersion(contact.updated_at);
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
    if (!field || !version || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      let parsed;
      try {
        parsed = parseContactField(field, value);
      } catch {
        setError(t('القيمة لا تناسب نوع الحقل.', 'The value does not match the field type.'));
        return;
      }
      await api(`/crm/contacts/${contactId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ attributes: { [field.key]: parsed }, expectedUpdatedAt: version }),
      });
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!field}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('تعديل حقل مخصص', 'Edit Custom Field')}
    >
      <form className={styles.followupForm} onSubmit={save}>
        {error && <p role="alert">{error}</p>}
        <label>
          {field?.label}
          {field?.type === 'boolean' ? (
            <select
              value={value}
              disabled={!version || busy}
              onChange={(event) => setValue(event.target.value)}
            >
              <option value="">{t('غير محدد', 'Not set')}</option>
              <option value="true">{t('نعم', 'Yes')}</option>
              <option value="false">{t('لا', 'No')}</option>
            </select>
          ) : (
            <input
              type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
              step={field?.type === 'number' ? 'any' : undefined}
              maxLength={2000}
              value={value}
              disabled={!version || busy}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </label>
        <footer>
          <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button className="btn btn-primary" disabled={!version || busy}>
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
