'use client';
import { useState } from 'react';
import { NODE_GROUPS, NODE_META, NodeType } from '../../lib/flow-types';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import { NodeIcon, nodeLabel } from './presentation';
import styles from './editor-shell.module.css';

export default function BlockPalette({
  onAdd,
  disabled = false,
}: {
  onAdd: (type: NodeType) => void;
  disabled?: boolean;
}) {
  const { t, language } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const matches = (type: NodeType) =>
    nodeLabel(type, language).toLowerCase().includes(query.trim().toLowerCase());
  return (
    <aside
      className={styles.palette}
      data-expanded={expanded}
      aria-label={t('عقد التدفق', 'Flow blocks')}
    >
      <header className={styles.paletteHeader}>
        {expanded && (
          <div>
            <strong>{t('عقد التدفق', 'Flow blocks')}</strong>
            <small>{t('اسحب عقدة إلى اللوحة', 'Drag a block onto the canvas')}</small>
          </div>
        )}
        <button
          type="button"
          className={styles.paletteToggle}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t('تصغير أدوات العقد', 'Collapse flow blocks')
              : t('توسيع أدوات العقد', 'Expand flow blocks')
          }
          onClick={() => {
            setExpanded(!expanded);
            setQuery('');
          }}
        >
          <NavIcon name={expanded ? 'close' : 'flows'} />
        </button>
      </header>
      {expanded && (
        <label className={styles.paletteSearch}>
          <NavIcon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ابحث عن عقدة…', 'Search blocks…')}
            aria-label={t('البحث في العقد', 'Search blocks')}
          />
        </label>
      )}
      <div className={styles.paletteScroll}>
        {NODE_GROUPS.map((group) => {
          const types = group.types.filter(matches);
          return types.length ? (
            <section key={group.id} className={styles.paletteGroup}>
              {expanded && <h2>{language === 'ar' ? group.ar : group.en}</h2>}
              {types.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={styles.block}
                  title={nodeLabel(type, language)}
                  aria-label={`${t('إضافة', 'Add')} ${nodeLabel(type, language)}`}
                  draggable={!disabled}
                  disabled={disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/boat-node', type);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setExpanded(false)}
                  onClick={() => {
                    onAdd(type);
                    setExpanded(false);
                  }}
                >
                  <span className={styles.blockIcon} style={{ color: NODE_META[type].color }}>
                    <NodeIcon type={type} />
                  </span>
                  {expanded && <span>{nodeLabel(type, language)}</span>}
                </button>
              ))}
            </section>
          ) : null;
        })}
        {expanded && !NODE_GROUPS.some((group) => group.types.some(matches)) && (
          <p role="status" className={styles.paletteEmpty}>
            {t('لا توجد عقدة مطابقة.', 'No matching blocks.')}
          </p>
        )}
      </div>
    </aside>
  );
}
