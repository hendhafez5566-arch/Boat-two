'use client';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  useReactFlow,
  useStore,
} from 'reactflow';
import { useLocale } from '../product/locale';

/** Connections expose their controls on selection, hover or keyboard focus. */
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
  // Reveal connection tools for the selected step without changing reference link colors.
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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.5,
  });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={22} />
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
          data-active={selected || focus === 'hot'}
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
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.5,
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
