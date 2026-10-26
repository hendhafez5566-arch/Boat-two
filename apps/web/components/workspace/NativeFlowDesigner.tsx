'use client';
import { useState } from 'react';
import { useLocale } from '../product/locale';
import { buildNativeFlow, NativeField, NativeForm } from '../../lib/whatsapp-flow-builder';
import styles from './native-flows.module.css';
const kinds = [
  ['heading', 'عنوان', 'Header'],
  ['text', 'حقل نصي', 'Text Field'],
  ['textarea', 'نص طويل', 'Text Area'],
  ['checkbox', 'اختيارات متعددة', 'Checkbox Group'],
  ['radio', 'اختيار واحد', 'Radio Group'],
  ['select', 'قائمة اختيار', 'Select'],
  ['date', 'تاريخ', 'Date Field'],
] as const;
export default function NativeFlowDesigner({
  onUse,
  disabled = false,
}: {
  onUse: (definition: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<NativeForm>({
    screenId: 'CONTACT',
    title: t('تواصل معنا', 'Contact Us'),
    submitLabel: t('إرسال', 'Submit'),
    fields: [],
  });
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const field = form.fields.find((item) => item.id === active);
  function patch(patch: Partial<NativeField>) {
    if (!field) return;
    setForm((current) => ({
      ...current,
      fields: current.fields.map((item) => (item === field ? { ...item, ...patch } : item)),
    }));
    if (patch.id) setActive(patch.id);
  }
  function add(type: NativeField['type']) {
    const id = `field_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
    setForm((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          id,
          type,
          label: t(
            kinds.find((kind) => kind[0] === type)![1],
            kinds.find((kind) => kind[0] === type)![2],
          ),
          required: false,
          options: [],
        },
      ],
    }));
    setActive(id);
  }
  return (
    <fieldset disabled={disabled} className={styles.designer}>
      <div className={styles.palette}>
        <strong>{t('إضافة حقل', 'Add Field')}</strong>
        {kinds.map(([type, ar, en]) => (
          <button
            type="button"
            key={type}
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData('application/boat-native-field', type)
            }
            onClick={() => add(type)}
          >
            ＋ {t(ar, en)}
          </button>
        ))}
      </div>
      <div className="stack">
        <div className={styles.formMeta}>
          <label className="field">
            {t('اسم الشاشة المميز', 'Screen Unique Name')}
            <input
              value={form.screenId}
              dir="ltr"
              onChange={(e) => setForm({ ...form, screenId: e.target.value })}
            />
          </label>
          <label className="field">
            {t('عنوان النموذج', 'Form Title')}
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
        </div>
        <div
          className={styles.phone}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/boat-native-field');
            const kind = kinds.find((kind) => kind[0] === type);
            if (kind) add(kind[0]);
          }}
        >
          <h3>{form.title}</h3>
          {!form.fields.length && (
            <p className="muted">
              {t(
                'أضف حقلًا من القائمة لبناء النموذج.',
                'Add fields from the list to build your form.',
              )}
            </p>
          )}
          {form.fields.map((item, index) => (
            <div
              key={index}
              className={`${styles.previewField} ${item.id === active ? styles.selected : ''}`}
            >
              <button
                type="button"
                className={styles.fieldSelect}
                onClick={() => setActive(item.id)}
              >
                {item.type === 'heading' ? (
                  <strong>{item.label}</strong>
                ) : (
                  <>
                    <span>
                      {item.label}
                      {item.required ? ' *' : ''}
                    </span>
                    <span className={styles.placeholder}>
                      {['select', 'radio', 'checkbox'].includes(item.type)
                        ? item.options.map((option) => option.title).join(' · ') ||
                          t('خيارات الحقل', 'Field options')
                        : item.type === 'date'
                          ? '— / — / —'
                          : '…'}
                    </span>
                  </>
                )}
              </button>
              <div className={styles.fieldActions}>
                <button
                  type="button"
                  aria-label={t('تحريك لأعلى', 'Move up')}
                  disabled={index === 0}
                  onClick={() =>
                    setForm((current) => {
                      const fields = [...current.fields];
                      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
                      return { ...current, fields };
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={t('تحريك لأسفل', 'Move down')}
                  disabled={index === form.fields.length - 1}
                  onClick={() =>
                    setForm((current) => {
                      const fields = [...current.fields];
                      [fields[index + 1], fields[index]] = [fields[index], fields[index + 1]];
                      return { ...current, fields };
                    })
                  }
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      fields: current.fields.filter((_, i) => i !== index),
                    }));
                    setActive('');
                  }}
                >
                  {t('إزالة', 'Remove')}
                </button>
              </div>
            </div>
          ))}
          <div className={styles.submitPreview}>{form.submitLabel}</div>
        </div>
        <label className="field">
          {t('عنوان زر الإرسال', 'Submit Button Label')}
          <input
            value={form.submitLabel}
            onChange={(e) => setForm({ ...form, submitLabel: e.target.value })}
          />
        </label>
      </div>
      <aside className="stack">
        {field ? (
          <>
            <h3>{t('إعدادات الحقل', 'Field Settings')}</h3>
            <label className="field">
              {t('اسم الحقل في الرد', 'Response Field Key')}
              <input dir="ltr" value={field.id} onChange={(e) => patch({ id: e.target.value })} />
            </label>
            <label className="field">
              {t('العنوان', 'Label')}
              <input value={field.label} onChange={(e) => patch({ label: e.target.value })} />
            </label>
            {field.type !== 'heading' && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => patch({ required: e.target.checked })}
                />
                {t('مطلوب', 'Required')}
              </label>
            )}
            {['checkbox', 'radio', 'select'].includes(field.type) && (
              <div className="stack">
                <h4>{t('الاختيارات', 'Options')}</h4>
                {field.options.map((option, index) => (
                  <div className={styles.option} key={index}>
                    <input
                      aria-label={t('معرّف الاختيار', 'Option ID')}
                      dir="ltr"
                      value={option.id}
                      onChange={(e) =>
                        patch({
                          options: field.options.map((item, i) =>
                            i === index ? { ...item, id: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={t('عنوان الاختيار', 'Option Label')}
                      value={option.title}
                      onChange={(e) =>
                        patch({
                          options: field.options.map((item, i) =>
                            i === index ? { ...item, title: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={t('إزالة اختيار', 'Remove option')}
                      onClick={() =>
                        patch({ options: field.options.filter((_, i) => i !== index) })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      options: [
                        ...field.options,
                        {
                          id: `option_${crypto.randomUUID().slice(0, 8)}`,
                          title: t('اختيار جديد', 'New option'),
                        },
                      ],
                    })
                  }
                >
                  {t('إضافة اختيار', 'Add Option')}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            {t('اختر حقلًا لتعديل خصائصه.', 'Select a field to edit its properties.')}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            try {
              onUse(buildNativeFlow(form));
              setError('');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {t('استخدام هذا التصميم', 'Use This Design')}
        </button>
        <p className="muted">
          {t(
            'المعاينة تقريبية. يلزم فحص Meta ومعاينتها قبل النشر.',
            'Approximate preview. Check Meta validation and preview before publishing.',
          )}
        </p>
      </aside>
    </fieldset>
  );
}
