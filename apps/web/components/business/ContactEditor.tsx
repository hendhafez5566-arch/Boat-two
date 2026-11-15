'use client';
import { useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import { LabelEditor } from '../product/LabelEditor';
import { contactAttributes, collectContactLabels } from '../../lib/contact-labels';
import { statusLabel } from '../product/status';
import { parseContactField, type ContactField } from '../../lib/inbox-contact-fields';
import styles from '../product/structured-editor.module.css';
type ContactDraft = {
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  ownerId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  expectedUpdatedAt?: string;
};
type Existing = {
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  owner_id: string | null;
  attributes: Record<string, string | number | boolean | null>;
  updated_at?: string;
};
export function ContactEditor({
  contact,
  fields,
  members,
  onSave,
  onCancel,
  onDirty,
}: {
  contact?: Existing | null;
  fields: ContactField[];
  members: { user_id: string; full_name: string; email?: string }[];
  onSave: (d: ContactDraft) => Promise<unknown>;
  onCancel: () => void;
  onDirty: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState(contact?.name ?? '');
  const [tags, setTags] = useState(contact?.tags ?? []);
  const [pending, setPending] = useState('');
  const [attributes, setAttributes] = useState(JSON.stringify(contact?.attributes ?? {}, null, 2));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  let attrs: Record<string, string | number | boolean | null> = {};
  try {
    attrs = contactAttributes(attributes);
  } catch {
    /* Validate advanced edits before saving. */
  }
  const fieldChange = (field: ContactField, value: string) => {
    try {
      setAttributes(
        JSON.stringify(
          { ...contactAttributes(attributes), [field.key]: parseContactField(field, value) },
          null,
          2,
        ),
      );
      setError('');
    } catch {
      setError(
        t(
          'راجع قيمة الحقل والبيانات الإضافية.',
          'Check the field value and additional attributes.',
        ),
      );
    }
  };
  async function save(form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const f = new FormData(form);
      const values = contactAttributes(attributes);
      const labels = collectContactLabels(tags, pending);
      await onSave({
        name: name.trim(),
        email: String(f.get('email') || '').trim() || null,
        phone: String(f.get('phone') || '').trim() || null,
        lifecycle: String(f.get('lifecycle')),
        ownerId: String(f.get('ownerId') || '') || null,
        tags: labels,
        attributes: values,
        ...(contact?.updated_at ? { expectedUpdatedAt: contact.updated_at } : {}),
      });
    } catch (e) {
      const code = (e as Error).message;
      setError(
        code === 'LABEL_COUNT'
          ? t('الحد الأقصى 30 وسمًا.', 'Use up to 30 labels.')
          : code === 'LABEL_LENGTH'
            ? t('اسم الوسم لا يتجاوز 50 حرفًا.', 'Labels must be 50 characters or fewer.')
            : code === 'ATTRIBUTE_OBJECT' || e instanceof SyntaxError
              ? t(
                  'البيانات الإضافية يجب أن تكون كائن JSON مسطحًا بقيم نصية أو رقمية أو منطقية.',
                  'Additional attributes must be a flat JSON object containing text, numbers or booleans.',
                )
              : code.includes('already exists')
                ? t(
                    'يوجد عميل بنفس البريد أو الهاتف. راجع بياناته قبل إضافة سجل آخر.',
                    'A customer with this email or phone already exists. Review the existing customer before adding another.',
                  )
                : code.includes('changed')
                  ? t(
                      'تغيّر هذا الملف منذ فتحه. أغلق النافذة وحدّث القائمة ثم أعد فتح العميل لحماية التعديلات الأحدث.',
                      'This contact changed since you opened it. Close the editor, refresh and reopen the contact to protect the newer changes.',
                    )
                  : code,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save(e.currentTarget);
      }}
      onChange={onDirty}
      aria-busy={busy}
    >
      <p className={styles.intro}>
        {t(
          'سجّل بيانات التواصل، ثم نظّم العميل بالوسوم والمسؤول. يمكنك استكمال الحقول لاحقًا.',
          'Start with contact details, then organize the customer with labels and an owner. You can complete other fields later.',
        )}
      </p>
      {error && (
        <p className={styles.feedback} role="alert">
          {error}
        </p>
      )}
      <fieldset className={styles.section} disabled={busy}>
        <legend>{t('بيانات التواصل', 'Contact information')}</legend>
        <div className={styles.grid}>
          <label>
            {t('اسم العميل', 'Customer name')}
            <input
              autoFocus
              name="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            {t('البريد الإلكتروني', 'Email')}
            <input
              name="email"
              type="email"
              maxLength={254}
              defaultValue={contact?.email ?? ''}
              dir="ltr"
            />
          </label>
          <label>
            {t('الهاتف', 'Phone')}
            <input
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={contact?.phone ?? ''}
              dir="ltr"
            />
          </label>
        </div>
      </fieldset>
      <fieldset className={styles.section} disabled={busy}>
        <legend>{t('تنظيم العميل', 'Customer organization')}</legend>
        <div className={styles.grid}>
          <label>
            {t('مرحلة العميل', 'Lifecycle')}
            <select
              name="lifecycle"
              aria-label={t('مرحلة العميل', 'Lifecycle')}
              defaultValue={contact?.lifecycle ?? 'lead'}
            >
              {['lead', 'qualified', 'customer', 'inactive'].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s, t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('مسؤول العميل', 'Owner')}
            <select
              name="ownerId"
              aria-label={t('مسؤول العميل', 'Owner')}
              defaultValue={contact?.owner_id ?? ''}
            >
              <option value="">{t('غير معيّن', 'Unassigned')}</option>
              {contact?.owner_id && !members.some((m) => m.user_id === contact.owner_id) && (
                <option value={contact.owner_id}>{t('المسؤول الحالي', 'Current owner')}</option>
              )}
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <LabelEditor
          value={tags}
          pending={pending}
          onPending={setPending}
          onChange={(values) => {
            setTags(values);
            onDirty();
          }}
          disabled={busy}
        />
      </fieldset>
      {!!fields.length && (
        <fieldset className={styles.section} disabled={busy}>
          <legend>{t('الحقول المخصصة', 'Custom fields')}</legend>
          <div className={styles.grid}>
            {fields.map((field) => (
              <label key={field.id}>
                {field.label}
                {field.type === 'boolean' ? (
                  <select
                    aria-label={field.label}
                    value={
                      attrs[field.key] === null || attrs[field.key] === undefined
                        ? ''
                        : String(attrs[field.key])
                    }
                    onChange={(e) => fieldChange(field, e.target.value)}
                  >
                    <option value="">{t('غير محدد', 'Not set')}</option>
                    <option value="true">{t('نعم', 'Yes')}</option>
                    <option value="false">{t('لا', 'No')}</option>
                  </select>
                ) : (
                  <input
                    type={
                      field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'
                    }
                    step={field.type === 'number' ? 'any' : undefined}
                    maxLength={2000}
                    value={
                      attrs[field.key] === null || attrs[field.key] === undefined
                        ? ''
                        : String(attrs[field.key])
                    }
                    onChange={(e) => fieldChange(field, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <details>
        <summary>{t('بيانات إضافية متقدمة', 'Advanced additional attributes')}</summary>
        <p>
          {t(
            'للحقول غير المسجلة في إعداداتك. التعديل هنا يحافظ على بقية القيم عند تعديل الحقول أعلاه.',
            'For attributes not registered in your settings. Editing fields above retains other saved values.',
          )}
        </p>
        <label className="field">
          {t('البيانات الإضافية JSON', 'Additional attributes JSON')}
          <textarea
            aria-label={t('البيانات الإضافية JSON', 'Additional attributes JSON')}
            rows={5}
            dir="ltr"
            value={attributes}
            disabled={busy}
            onChange={(e) => setAttributes(e.target.value)}
          />
        </label>
      </details>
      <footer className={styles.actions}>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          {t('إلغاء', 'Cancel')}
        </button>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ العميل', 'Save contact')}
        </button>
      </footer>
    </form>
  );
}
