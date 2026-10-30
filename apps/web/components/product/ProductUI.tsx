'use client';
import { ButtonHTMLAttributes, ReactNode, useEffect, useRef, useId } from 'react';
import { NavIcon } from './NavIcon';
export function Button({
  busy,
  children,
  variant = 'secondary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy}
      className={`btn ${variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : ''} ${props.className ?? ''}`}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="product-empty">
      <span className="empty-icon">
        <NavIcon name={icon} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Feedback({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div role={error ? 'alert' : 'status'} className={`notice ${error ? 'error' : ''}`}>
      {children}
    </div>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      previous?.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={heading}
      className={`product-dialog ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={heading}>{title}</h2>
        <button className="btn dialog-close" aria-label="Close / إغلاق" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
