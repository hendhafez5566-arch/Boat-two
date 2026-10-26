'use client';
import { Children, isValidElement, ReactNode, useId, useState } from 'react';
import styles from './automation-config.module.css';
export function ConfigSummary({ children }: { children?: ReactNode; 'aria-label'?: string }) {
  return <>{children}</>;
}
export function ConfigDisclosure({
  children,
  open = false,
  className = '',
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  children: ReactNode;
  open?: boolean;
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (value: boolean) => void;
}) {
  const [localExpanded, setExpanded] = useState(open);
  const expanded = controlledExpanded ?? localExpanded;
  const id = useId();
  const parts = Children.toArray(children);
  const summary = parts.find((child) => isValidElement(child) && child.type === ConfigSummary);
  const title = isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(summary)
    ? summary.props.children
    : null;
  const label = isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(summary)
    ? summary.props['aria-label']
    : undefined;
  return (
    <section className={`${styles.disclosure} ${className}`}>
      <button
        type="button"
        className={styles.disclosureToggle}
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => {
          setExpanded(!expanded);
          onExpandedChange?.(!expanded);
        }}
      >
        <span>{title}</span>
        <svg
          viewBox="0 0 20 20"
          width="20"
          height="20"
          aria-hidden="true"
          style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
        >
          <path
            d="m5 7 5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div id={id} hidden={!expanded} className={styles.disclosureBody}>
        {parts.filter((child) => child !== summary)}
      </div>
    </section>
  );
}
