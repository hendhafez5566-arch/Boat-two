'use client';
import { createPortal } from 'react-dom';
import { Children, isValidElement, ReactNode, useEffect, useId, useRef } from 'react';
import { useLocale } from '../product/locale';
import styles from './configuration-panel.module.css';

/** Canvas inspector: a docked, non-modal panel. Canvas ports remain usable. */
export default function ConfigurationPanel({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { language, t } = useLocale();
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        close.current();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (prior?.isConnected) prior.focus();
    };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  const parts = Children.toArray(children);
  const footer = parts.find((child) => isValidElement(child) && child.type === 'footer');
  return createPortal(
    <aside
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby={heading}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className={styles.panel}
    >
      <div className={styles.scroll}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.close}
            aria-label={t('إغلاق لوحة الإعدادات', 'Close configuration panel')}
            title={t('إغلاق', 'Close')}
            onClick={onClose}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
          <span className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="m7 4 11 8-6 1-3 6z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <h2 id={heading}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        </header>
        <div className={styles.content}>{parts.filter((child) => child !== footer)}</div>
      </div>
      {footer}
    </aside>,
    document.body,
  );
}
