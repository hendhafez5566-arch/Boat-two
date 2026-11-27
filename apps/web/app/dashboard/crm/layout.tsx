import type { ReactNode } from 'react';
import { CrmNav } from '../../../components/business/CrmNav';
import styles from '../../../components/business/crm-product.module.css';

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell} data-crm-suite>
      <CrmNav />
      {children}
    </div>
  );
}
