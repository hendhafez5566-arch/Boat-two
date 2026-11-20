'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import { LabelEditor } from '../product/LabelEditor';
import { contactAttributes, collectContactLabels } from '../../lib/contact-labels';
import { statusLabel } from '../product/status';
import { parseContactField, type ContactField } from '../../lib/inbox-contact-fields';
import styles from '../product/structured-editor.module.css';
import bench from './crm-workbench.module.css';
type Attribute = string | number | boolean | null;
type ExtraField = {
  id: number;
  originalKey?: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'null';
};

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
  const [attrs, setAttrs] = useState<Record<string, Attribute>>(contact?.attributes ?? {});
  const [extras, setExtras] = useState<ExtraField[]>(() =>
    Object.entries(contact?.attributes ?? {})
      .filter(([key]) => !fields.some((field) => field.key === key))
      .map(([key, value], id) => ({
        id,
        originalKey: key,
        key,
        value: value === null ? '' : String(value),
        type: value === null ? 'null' : (typeof value as ExtraField['type']),
      })),
  );
  const extraRows = extras.filter((row) => !fields.some((field) => field.key === row.originalKey));
  const nextExtra = useRef(extras.length);
  const scroll = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (error) scroll.current?.scrollTo({ top: 0 });
  }, [error]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const fieldChange = (field: ContactField, value: string) => {
    try {
      const parsed = parseContactField(field, value);
      setAttrs((current) => ({ ...current, [field.key]: parsed }));
      setError('');
    } catch {
      setError(t('راجع قيمة الحقل.', 'Check the field value.'));
    }
  };
  const editExtra = (id: number, change: Partial<ExtraField>) =>
    setExtras((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  async function save(form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const f = new FormData(form);
      const entries = new Map<string, Attribute>(
        fields
          .filter((field) => Object.hasOwn(attrs, field.key))
          .map((field) => [field.key, attrs[field.key]]),
      );
      for (const row of extraRows) {
        const key = row.key.trim();
        if (!key || entries.has(key) || fields.some((field) => field.key === key))
          throw new Error('ATTRIBUTE_KEY');
        if (row.type === 'number' && (!row.value.trim() || !Number.isFinite(Number(row.value))))
          throw new Error('ATTRIBUTE_NUMBER');
        const value =
          row.type === 'null'
            ? null
            : row.type === 'boolean'
              ? row.value === 'true'
              : row.type === 'number'
                ? Number(row.value)
                : row.value;
        entries.set(key, value);
      }
      const values = contactAttributes(JSON.stringify(Object.fromEntries(entries)));
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
            : code === 'ATTRIBUTE_KEY'
              ? t(
                  'اكتب اسمًا مختلفًا لكل حقل إضافي.',
                  'Use a unique name for each additional field.',
                )
              : code === 'ATTRIBUTE_NUMBER' || code === 'ATTRIBUTE_OBJECT'
                ? t('راجع قيم الحقول الإضافية.', 'Check the additional field values.')
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
      className={`${bench.editor}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save(e.currentTarget);
      }}
      onChange={onDirty}
      aria-busy={busy}
    >
      <div className={bench.editorBody} ref={scroll}>
        {error && (
          <p className={styles.feedback} role="alert">
            {error}
          </p>
        )}
        <fieldset className={styles.section} disabled={busy}>
          <div className={bench.formFields}>
            <label data-wide>
              {t('اسم العميل', 'Customer name')}
              <input
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
        <details className={bench.formGroup}>
          <summary>{t('تنظيم العميل والوسوم', 'Customer organization and labels')}</summary>
          <fieldset className={styles.section} disabled={busy}>
            <div className={bench.formFields}>
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
        </details>
        {!!fields.length && (
          <details className={bench.formGroup}>
            <summary>{t('الحقول المخصصة', 'Custom fields')}</summary>
            <fieldset className={styles.section} disabled={busy}>
              <div className={bench.formFields}>
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
                          field.type === 'date'
                            ? 'date'
                            : field.type === 'number'
                              ? 'number'
                              : 'text'
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
          </details>
        )}
        <details className={bench.formGroup}>
          <summary>{t('بيانات إضافية', 'Additional fields')}</summary>
          {extraRows.map((row, index) => (
            <fieldset className={bench.formFields} disabled={busy} key={row.id}>
              <label>
                {t('اسم الحقل', 'Field name')} {index + 1}
                <input
                  value={row.key}
                  onChange={(event) => editExtra(row.id, { key: event.target.value })}
                />
              </label>
              <label>
                {t('النوع', 'Type')}
                <select
                  aria-label={t('النوع', 'Type') + ' ' + (index + 1)}
                  value={row.type}
                  onChange={(event) => {
                    const type = event.target.value as ExtraField['type'];
                    editExtra(row.id, { type, value: type === 'boolean' ? 'false' : row.value });
                  }}
                >
                  <option value="string">{t('نص', 'Text')}</option>
                  <option value="number">{t('رقم', 'Number')}</option>
                  <option value="boolean">{t('نعم أو لا', 'Yes or no')}</option>
                  <option value="null">{t('بدون قيمة', 'No value')}</option>
                </select>
              </label>
              {row.type !== 'null' && (
                <label>
                  {t('القيمة', 'Value')}
                  {row.type === 'boolean' ? (
                    <select
                      aria-label={t('القيمة', 'Value') + ' ' + (index + 1)}
                      value={row.value}
                      onChange={(event) => editExtra(row.id, { value: event.target.value })}
                    >
                      <option value="true">{t('نعم', 'Yes')}</option>
                      <option value="false">{t('لا', 'No')}</option>
                    </select>
                  ) : (
                    <input
                      type={row.type === 'number' ? 'number' : 'text'}
                      step="any"
                      aria-label={t('القيمة', 'Value') + ' ' + (index + 1)}
                      value={row.value}
                      onChange={(event) => editExtra(row.id, { value: event.target.value })}
                    />
                  )}
                </label>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onDirty();
                  setExtras((rows) => rows.filter((item) => item.id !== row.id));
                }}
              >
                {t('إزالة الحقل', 'Remove field')}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              const id = nextExtra.current++;
              onDirty();
              setExtras((rows) => [...rows, { id, key: '', value: '', type: 'string' }]);
            }}
          >
            {t('إضافة حقل', 'Add field')}
          </button>
        </details>
      </div>
      <footer className={`${bench.editorActions}`}>
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
