'use client';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath, useReactFlow } from 'reactflow';
import { useLocale } from '../product/locale';

/** Smooth-step edge with an explicit delete control shown while the connection is selected. */
export default function FlowEdge(props: EdgeProps) {
  const { id, source, sourceHandleId, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, selected } = props;
  const { deleteElements } = useReactFlow();
  const { t } = useLocale();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
    offset: 36,
  });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={14} />
      {selected && <EdgeLabelRenderer>
        <button
          type="button"
          className="edge-add nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title={t('إضافة خطوة هنا', 'Add a step here')}
          aria-label={t('إضافة خطوة هنا', 'Add a step here')}
          onClick={(ev) =>
            window.dispatchEvent(
              new CustomEvent('flow:insert-step', {
                detail: { id, source, handle: sourceHandleId ?? null, x: ev.clientX, y: ev.clientY },
              }),
            )
          }
        >
          +
        </button>
      </EdgeLabelRenderer>}
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="edge-delete nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX + 30}px, ${labelY}px)` }}
            title={t('قطع التوصيل', 'Disconnect')}
            aria-label={t('قطع التوصيل', 'Disconnect')}
            onClick={() => void deleteElements({ edges: [{ id }] })}
          >
            ✕
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Plain dashed link from a message to its button cards: no controls, never persisted. */
export function ButtonLinkEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  return (
    <BaseEdge
      id={id}
      path={path}
      interactionWidth={0}
      style={{ stroke: '#93a8d4', strokeWidth: 2, strokeDasharray: '5 5' }}
    />
  );
}
