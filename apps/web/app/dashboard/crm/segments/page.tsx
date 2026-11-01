import { CrmSegments } from '../../../../components/business/CrmSegments';
import { CrmNav } from '../../../../components/business/CrmNav';
import styles from '../../../../components/business/crm-workspace.module.css';
export default function Page() {
  return (
    <main className={styles.page}>
      <CrmNav />
      <CrmSegments />
    </main>
  );
}
