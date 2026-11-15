'use client';
import { useId, useState } from 'react';
import { useLocale } from './locale';
import { collectContactLabels } from '../../lib/contact-labels';
import styles from './structured-editor.module.css';
export function LabelEditor({
  value,
  pending,
  onPending,
  onChange,
  disabled = false,
  target,
}: {
  value: string[];
  pending: string;
  onPending: (s: string) => void;
  onChange: (v: string[]) => void;
  disabled?: boolean;
  target?: string;
}) {
  const { t } = useLocale();
  const id = useId();
  const [error, setError] = useState('');
  function add() {
    try {
      onChange(collectContactLabels(value, pending));
      onPending('');
      setError('');
    } catch (e) {
      setError(
        (e as Error).message === 'LABEL_COUNT'
          ? t('الحد الأقصى 30 وسمًا.', 'Use up to 30 labels.')
          : t('اسم الوسم لا يتجاوز 50 حرفًا.', 'Each label can contain up to 50 characters.'),
      );
    }
  }
  return (
    <div className={styles.labels}>
      <label htmlFor={id}>{t('الوسوم', 'Labels')}</label>
      <div className={styles.chips}>
        {value.map((v) => (
          <span key={v}>
            {v}
            <button
              type="button"
              disabled={disabled}
              aria-label={`${t('إزالة الوسم', 'Remove label')} ${v}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className={styles.inline}>
        <input
          id={id}
          data-inbox-target={target}
          disabled={disabled}
          value={pending}
          onChange={(e) => onPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('اكتب وسمًا ثم أضفه', 'Type a label, then add it')}
        />
        <button className="btn" type="button" disabled={disabled || !pending.trim()} onClick={add}>
          {t('إضافة وسم', 'Add label')}
        </button>
      </div>
      <small>
        {t('حتى 30 وسمًا، بحد أقصى 50 حرفًا لكل وسم.', 'Up to 30 labels, 50 characters each.')}
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
