'use client';
import { useId, useState } from 'react';
import { useLocale } from '../product/locale';
import styles from './audience-filter-select.module.css';

export function AudienceFilterSelect({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const id = useId();
  const [query, setQuery] = useState('');
  return (
    <div className={styles.field}>
      <span id={id}>{label}</span>
      <details className={styles.select}>
        <summary
          aria-labelledby={id}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) event.preventDefault();
          }}
        >
          {value.length ? (
            value.map((key) => (
              <span className={styles.chip} key={key}>
                {options.find((option) => option.id === key)?.name || key}
              </span>
            ))
          ) : (
            <span className={styles.placeholder}>{t('بحث', 'Search')}</span>
          )}
          <span aria-hidden="true" className={styles.arrow}>
            ⌄
          </span>
        </summary>
        {!disabled && (
          <div className={styles.menu}>
            <input
              aria-label={`${t('بحث', 'Search')} — ${label}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('بحث', 'Search')}
            />
            <div className={styles.options}>
              {options
                .filter((option) =>
                  option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                )
                .map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={value.includes(option.id)}
                      disabled={!value.includes(option.id) && value.length >= 30}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...value, option.id]
                            : value.filter((key) => key !== option.id),
                        )
                      }
                    />
                    {option.name}
                  </label>
                ))}
              {!options.some((option) =>
                option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              ) && <p>{t('لا توجد نتائج', 'No results found')}</p>}
            </div>
            {!!value.length && (
              <button type="button" onClick={() => onChange([])}>
                {t('مسح الاختيارات', 'Clear selection')}
              </button>
            )}
          </div>
        )}
      </details>
    </div>
  );
}
