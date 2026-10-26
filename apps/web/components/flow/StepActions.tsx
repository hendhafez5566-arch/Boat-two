'use client';
import { useState } from 'react';
import { NodeType } from '../../lib/flow-types';
import { ACTION_TYPES } from '../../lib/smart-editor';
import { NodeIcon, nodeLabel } from './presentation';
import { useLocale } from '../product/locale';
import styles from './automation-config.module.css';

export default function StepActions({
  title,
  target,
  steps,
  onConnect,
  onCreate,
  onOpen,
}: {
  title: string;
  target?: string;
  steps: { id: string; type: NodeType; text: string }[];
  onConnect: (target: string) => void;
  onCreate: (type: NodeType) => void;
  onOpen: (id: string) => void;
}) {
  const { language, t } = useLocale();
  const [method, setMethod] = useState<'new' | 'existing'>(target ? 'existing' : 'new');
  const [search, setSearch] = useState('');
  const destination = steps.find((s) => s.id === target);
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {destination && (
        <div className={styles.toolbar}>
          <p>
            {nodeLabel(destination.type, language)} — {destination.text}
          </p>
          <button className={styles.button} type="button" onClick={() => onOpen(destination.id)}>
            {t('فتح الخطوة', 'Open Step')}
          </button>
          <button className={styles.button} type="button" onClick={() => onConnect('')}>
            {t('فصل التوصيل', 'Disconnect')}
          </button>
        </div>
      )}
      <div className={styles.segmented}>
        <button type="button" aria-pressed={method === 'new'} onClick={() => setMethod('new')}>
          {t('إنشاء خطوة', 'Create Step')}
        </button>
        <button
          type="button"
          aria-pressed={method === 'existing'}
          onClick={() => setMethod('existing')}
        >
          {t('ربط خطوة موجودة', 'Connect Existing Step')}
        </button>
      </div>
      {method === 'new' ? (
        <div className={styles.grid}>
          {ACTION_TYPES.map((type) => (
            <button
              type="button"
              className={styles.button}
              key={type}
              onClick={() => onCreate(type)}
            >
              <NodeIcon type={type} />
              <span>{nodeLabel(type, language)}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <label className={styles.field}>
            {t('البحث عن خطوة', 'Search Steps')}
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className={styles.field}>
            {t('الخطوة التالية', 'Next Step')}
            <select value={target ?? ''} onChange={(e) => onConnect(e.target.value)}>
              <option value="">{t('بدون توصيل', 'Not Connected')}</option>
              {steps
                .filter(
                  (s) =>
                    s.id === target ||
                    `${nodeLabel(s.type, language)} ${s.text}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {nodeLabel(s.type, language)} — {s.text}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
    </section>
  );
}
