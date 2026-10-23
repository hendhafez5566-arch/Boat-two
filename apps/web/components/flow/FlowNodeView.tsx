'use client';
import { memo, useEffect, CSSProperties } from 'react';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { handlesFor, NODE_META, RFData, summary } from '../../lib/flow-types';
import { useLocale } from '../product/locale';
import { NodeIcon, nodeLabel, editorLabel } from './presentation';
function FlowNodeView({ id, data, selected }: NodeProps<RFData>) {
  const { language, t } = useLocale(),
    meta = NODE_META[data.type],
    handles = handlesFor(data.type, data.data),
    update = useUpdateNodeInternals(),
    key = handles.map((h) => h.id).join('|');
  useEffect(() => {
    update(id);
  }, [id, key, update, language]);
  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className={`premium-flow-node ${selected ? 'is-selected' : ''} ${data.issue ? 'has-issue' : ''}`}
      style={{ '--node-color': meta.color } as CSSProperties}
      aria-label={nodeLabel(data.type, language)}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flow-node-heading">
        <span className="flow-node-icon">
          <NodeIcon type={data.type} />
        </span>
        <strong>{nodeLabel(data.type, language)}</strong>
        {data.isStart && <span className="flow-start-badge">{t('بداية', 'Start')}</span>}
      </div>
      <div className="flow-node-summary">
        {summary(data.type, data.data) || t('اضغط لإضافة المحتوى', 'Select to add content')}
      </div>
      {data.issue && (
        <div className="flow-node-issue" role="status">
          {data.issue}
        </div>
      )}
      {handles.map((h) => (
        <div key={h.id} className="flow-node-port">
          {editorLabel(h.label, language)}
          <Handle
            type="source"
            position={language === 'ar' ? Position.Left : Position.Right}
            id={h.id}
            style={{ [language === 'ar' ? 'left' : 'right']: -6, top: '50%' }}
          />
        </div>
      ))}
    </div>
  );
}
export default memo(FlowNodeView);
