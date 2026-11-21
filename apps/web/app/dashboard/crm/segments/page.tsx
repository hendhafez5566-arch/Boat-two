import { CrmSegments } from '../../../../components/business/CrmSegments';
import styles from '../../../../components/business/crm-workspace.module.css';
export default function Page() {
  return (
    <main className={styles.page}>
      <CrmSegments />
    </main>
  );
}
