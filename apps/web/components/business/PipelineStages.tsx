'use client';

import { useRef, useState } from 'react';
import { useLocale } from '../product/locale';
import product from './crm-product.module.css';

export function PipelineStages({ original = [] }: { original?: string[] }) {
  const { t } = useLocale();
  const [stages, setStages] = useState(() =>
    (original.length ? original : ['', '']).map((name, id) => ({ id, name })),
  );
  const next = useRef(stages.length);
  const names = stages.map(({ name }) => name.trim()).filter(Boolean);
  function move(index: number, offset: number) {
    setStages((current) => {
      const reordered = [...current];
      const [stage] = reordered.splice(index, 1);
      reordered.splice(index + offset, 0, stage);
      return reordered;
    });
  }
  return (
    <fieldset className={product.stageEditor}>
      <legend>{t('مراحل خط المبيعات', 'Pipeline stages')}</legend>
      <ol>
        {stages.map(({ id, name }, index) => (
          <li key={id}>
            <label>
              {t('المرحلة', 'Stage')} {index + 1}
              <input
                required
                maxLength={60}
                name="stage"
                value={name}
                onChange={(event) => {
                  const value = event.target.value;
                  setStages((current) =>
                    current.map((item) => (item.id === id ? { ...item, name: value } : item)),
                  );
                }}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                {t('لأعلى', 'Move up')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={index === stages.length - 1}
                onClick={() => move(index, 1)}
              >
                {t('لأسفل', 'Move down')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={stages.length <= 2}
                onClick={() => setStages((current) => current.filter((item) => item.id !== id))}
              >
                {t('إزالة المرحلة', 'Remove stage')}
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        disabled={stages.length >= 20}
        onClick={() => {
          const id = next.current++;
          setStages((current) => [...current, { id, name: '' }]);
        }}
      >
        {t('إضافة مرحلة', 'Add stage')}
      </button>
      {original.map(
        (name, index) =>
          !names.includes(name) && (
            <label key={name}>
              {t('نقل صفقات المرحلة', 'Move deals from')} {name}
              <select name={'replacement-' + index}>
                <option value="">{t('لا يوجد بديل', 'No replacement')}</option>
                {[...new Set(names)].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ),
      )}
    </fieldset>
  );
}
