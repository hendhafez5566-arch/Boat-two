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
        <span>{data.summary}</span>
        <small>{t('اضغط لإعداد البداية', 'Configure Reference')}</small>
      </button>
      <footer>{t('الرسالة التالية', 'Compose Next Message')}</footer>
      <Handle
        type="source"
        id="start"
        position={language === 'ar' ? Position.Left : Position.Right}
        isConnectable={false}
        style={{
          top: 'auto',
          bottom: 18,
          background: '#fff',
          border: '2px solid #91a2b5',
          width: 12,
          height: 12,
        }}
      />
    </div>
  );
}
