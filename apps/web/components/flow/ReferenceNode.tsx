'use client';
import { Handle, NodeProps, Position } from 'reactflow';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './editor-shell.module.css';

export type ReferenceData = { summary: string; onOpen: () => void };
export default function ReferenceNode({ data }: NodeProps<ReferenceData>) {
  const { t, language } = useLocale();
  return (
    <div className={styles.reference} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header>
        <NavIcon name="play" />
        <strong>{t('بداية تدفق البوت', 'Start Bot Flow')}</strong>
      </header>
      <button
        type="button"
        className="nodrag nopan"
        onClick={(event) => {
          event.stopPropagation();
          data.onOpen();
        }}
        aria-label={t('إعداد بداية التدفق', 'Configure flow start')}
      >
        <span className={styles.referenceSummary}>{data.summary}</span>
        <svg
          width="30"
          height="32"
          viewBox="0 0 32 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M12 18V5a2.5 2.5 0 0 1 5 0v11-5a2.5 2.5 0 0 1 5 0v6-3a2.5 2.5 0 0 1 5 0v8c0 7-3 11-9 11-4 0-6-2-9-6l-5-7c-2-3 1-5 3-3l5 4" />
        </svg>
      </button>
      <footer>{t('الرسالة التالية', 'Compose Next Message')}</footer>
      <Handle
        type="source"
        id="start"
        position={language === 'ar' ? Position.Left : Position.Right}
        isConnectable
        style={{
          top: 'auto',
          bottom: 14,
          background: '#fff',
          border: '2px solid #778292',
          width: 15,
          height: 15,
        }}
      />
    </div>
  );
}
