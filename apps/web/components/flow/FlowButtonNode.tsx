'use client';
import { memo, useContext, CSSProperties } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { ButtonNodeData } from '../../lib/flow-types';
import { useLocale } from '../product/locale';
import { FlowAnalyticsContext, FlowButtonStatsContext } from './stats-context';

/**
 * A button of an interactive/message step drawn as its own card (see deriveButtonCards).
 * It owns the button's output handle, so each button connects to its next step on its own.
 */
function FlowButtonNode({ data, selected }: NodeProps<ButtonNodeData>) {
  const { language, t } = useLocale();
  const analytics = useContext(FlowAnalyticsContext);
  const stats = useContext(FlowButtonStatsContext)[`${data.parentId}:${data.buttonId}`];
  const rtl = data.rtl;
  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      className={`fn-bcard ${selected ? 'is-selected' : ''} ${data.linked ? '' : 'is-open'}`}
      style={{ '--node-color': '#2563eb' } as CSSProperties}
      aria-label={t('زر', 'Button')}
      data-lang={language}
    >
      <Handle
        type="target"
        id="in"
        position={rtl ? Position.Right : Position.Left}
        isConnectable={false}
        style={{ [rtl ? 'right' : 'left']: -6, top: '50%' }}
      />
      <div className="fn-bcard-head">▣ {t('زر', 'Button')}</div>
      {analytics && <div className="fn-bcard-stats" aria-label={t('إحصائيات الزر', 'Button statistics')}>
        <span title={t('نقرات', 'Clicks')}>
          👆 {t('نقرات', 'Click')}
          <b>{stats?.clicks ?? 0}</b>
        </span>
        <span title={t('عملاء', 'Subscribers')}>
          ◉ {t('عملاء', 'Subscribers')}
          <b>{stats?.subscribers ?? 0}</b>
        </span>
        <span className={stats?.errors ? 'is-err' : ''} title={t('أخطاء', 'Errors')}>
          ⚠ {t('أخطاء', 'Errors')}
          <b>{stats?.errors ?? 0}</b>
        </span>
      </div>}
      <div className="fn-bcard-title">{data.title || '…'}</div>
      <Handle
        type="source"
        id="out"
        position={rtl ? Position.Left : Position.Right}
        style={{ [rtl ? 'left' : 'right']: -6, top: '50%' }}
      />
    </div>
  );
}
export default memo(FlowButtonNode);
