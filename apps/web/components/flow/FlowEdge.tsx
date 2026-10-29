'use client';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
  useReactFlow,
  useStore,
} from 'reactflow';
import { useLocale } from '../product/locale';

/** Connection removal stays visible without selecting the path first. */
export default function FlowEdge(props: EdgeProps) {
  const {
    id,
    source,
    sourceHandleId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    selected,
  } = props;
  const { deleteElements } = useReactFlow();
  // Highlight links touching the selected step; dim the rest while something is selected.
  const focus = useStore((s) => {
    let any = false;
    let touches = false;
    s.nodeInternals.forEach((n) => {
      if (n.selected) {
        any = true;
        if (n.id === source || n.id === props.target) touches = true;
      }
    });
    return !any ? '' : touches ? 'hot' : 'dim';
  });
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
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={
          focus === 'hot'
            ? { ...style, stroke: 'var(--primary)', strokeWidth: 3.5 }
            : focus === 'dim'
              ? { ...style, opacity: 0.3 }
              : style
        }
        interactionWidth={22}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="edge-add nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={t('إضافة خطوة هنا', 'Add a step here')}
            aria-label={t('إضافة خطوة هنا', 'Add a step here')}
            onClick={(ev) =>
              window.dispatchEvent(
                new CustomEvent('flow:insert-step', {
                  detail: {
                    id,
                    source,
                    handle: sourceHandleId ?? null,
                    x: ev.clientX,
                    y: ev.clientY,
                  },
                }),
              )
            }
          >
            +
          </button>
        </EdgeLabelRenderer>
      )}
      <EdgeLabelRenderer>
        <button
          type="button"
          className="edge-delete nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX + (selected ? 30 : 0)}px, ${labelY}px)`,
          }}
          title={t('قطع التوصيل', 'Disconnect')}
          aria-label={t('قطع التوصيل', 'Disconnect')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void deleteElements({ edges: [{ id }] });
          }}
        >
          ✕
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

/** Plain dashed link from a message to its button cards: no controls, never persisted. */
export function ButtonLinkEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });
  return (
    <BaseEdge
      id={id}
      path={path}
      interactionWidth={0}
      style={{ stroke: '#93a8d4', strokeWidth: 2, strokeDasharray: '5 5' }}
    />
  );
}
