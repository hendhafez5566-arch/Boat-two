import type { HTMLAttributes } from 'react';
import styles from './disclosure-summary.module.css';

/** Native disclosure semantics retain Enter/Space, touch and the parent's open/onToggle state. */
export function DisclosureSummary({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <summary {...props} className={`${styles.summary} ${className}`}>
      <span className={styles.label}>{children}</span>
      <svg
        className={styles.chevron}
        width="18"
        height="18"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="m5 7 5 5 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </summary>
  );
}
