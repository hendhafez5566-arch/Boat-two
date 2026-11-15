'use client';
import { useLocale } from '../product/locale';
import styles from './commerce-wizard.module.css';
export type ImportCounts = { added: number; updated: number; unchanged: number; rejected: number; duplicates: number; missingRequired: number; missing: number; archived: number };
export default function ImportSummary({counts}: {counts?: Partial<ImportCounts> | null}) {
  const {t} = useLocale();
  if (counts?.added === undefined) return null;
  return <>
    <dl className={styles.previewStats} aria-label={t('إحصاءات الاستيراد', 'Import statistics')}>
      {([
        ['added','إضافة','Added'], ['updated','تعديل','Updated'],
        ['unchanged','دون تغيير','Unchanged'], ['rejected','صفوف مرفوضة','Rejected rows'],
      ] as const).map(([key,ar,en]) => <div key={key} data-import-count={key}><dt>{t(ar,en)}</dt><dd>{counts[key]}</dd></div>)}
    </dl>
    <div className={styles.hint}>
      {([
        ['duplicates','معرّفات مكررة','Duplicate IDs'], ['missingRequired','معرّف أو اسم مفقود','Missing ID or name'],
        ['missing','عناصر مفقودة من الملف','Items missing from file'], ['archived','تمت أرشفتها','Archived'],
      ] as const).filter(([key]) => (counts[key] ?? 0)>0).map(([key,ar,en]) => <p key={key} data-import-count={key}>{t(ar,en)}: <strong>{counts[key]}</strong></p>)}
    </div>
  </>;
}
