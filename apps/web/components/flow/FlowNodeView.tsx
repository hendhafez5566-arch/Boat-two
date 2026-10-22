'use client';
import { memo, useEffect } from 'react';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { handlesFor, NODE_META, RFData, summary } from '../../lib/flow-types';

function FlowNodeView({ id, data, selected }: NodeProps<RFData>) {
  const meta = NODE_META[data.type];
  const handles = handlesFor(data.type, data.data);
  const update = useUpdateNodeInternals();
  const key = handles.map((h) => h.id).join('|');

  useEffect(() => {
    update(id);
  }, [id, key, update]);

  return (
    <div
      dir="rtl"
      className={`w-60 rounded-lg border bg-white text-sm shadow ${selected ? 'ring-2 ring-blue-500' : ''} ${data.issue ? 'border-red-500' : 'border-gray-300'}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 rounded-t-lg px-3 py-1.5 text-white" style={{ background: meta.color }}>
        <span>{meta.icon}</span>
        <strong className="flex-1">{meta.label}</strong>
        {data.isStart && <span className="rounded bg-white/25 px-1 text-xs">بداية</span>}
      </div>
      <div className="line-clamp-3 whitespace-pre-wrap break-words px-3 py-2 text-gray-700">{summary(data.type, data.data)}</div>
      {data.issue && <div className="border-t bg-red-50 px-3 py-1 text-xs text-red-700">{data.issue}</div>}
      {handles.map((h) => (
        <div key={h.id} className="relative border-t px-3 py-1 text-xs text-gray-600">
          {h.label}
          <Handle type="source" position={Position.Left} id={h.id} style={{ left: -5, top: '50%' }} />
        </div>
      ))}
    </div>
  );
}

export default memo(FlowNodeView);
