import type { Edge, Node } from 'reactflow';

/** Canvas decoration only. Never insert it into the saved graph. */
export function deriveFlowReference(
  nodes: Pick<Node, 'id' | 'position' | 'width' | 'height'>[],
  startNodeId: string,
  rtl: boolean,
) {
  const first = nodes.find((node) => node.id === startNodeId);
  if (!first) return null;
  let id = '__boat_flow_reference';
  const ids = new Set(nodes.map((node) => node.id));
  while (ids.has(id)) id += '_';
  const position = { x: first.position.x + (rtl ? 380 : -380), y: first.position.y };
  const overlaps = () =>
    nodes.some(
      (node) =>
        position.x < node.position.x + (node.width ?? 300) + 24 &&
        position.x + 270 + 24 > node.position.x &&
        position.y < node.position.y + (node.height ?? 300) + 24 &&
        position.y + 190 + 24 > node.position.y,
    );
  let attempts = 0;
  while (overlaps() && attempts++ < nodes.length * 3) position.y += 220;
  if (overlaps())
    position.y = Math.max(...nodes.map((node) => node.position.y + (node.height ?? 300))) + 80;
  return {
    id,
    position,
    edge: {
      id: `${id}:start`,
      source: id,
      sourceHandle: 'start',
      target: first.id,
      type: 'default',
      deletable: false,
      updatable: false,
      focusable: false,
      style: { stroke: '#91a2b5', strokeWidth: 2 },
    } satisfies Edge,
  };
}
