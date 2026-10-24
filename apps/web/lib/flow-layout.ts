import type { Node } from 'reactflow';
import type { RFData } from './flow-types';
import { CARD_WIDTH, BUTTON_CARD_WIDTH, defaultButtonOffset, hasButtonCards, optionsOf } from './flow-types';

export function nodeFootprint(node: Node<RFData>, rtl: boolean, buttonDims: Record<string, {height: number}> = {}) {
  const width = Math.max(CARD_WIDTH, node.width || 0);
  const height = Math.max(240, node.height || 0);
  let left = 0, right = width, top = 0, bottom = height;
  let nextY = 24;
  if (hasButtonCards(node.data.type, node.data.data)) {
    optionsOf(node.data.data).forEach((button, index) => {
      const point = node.data.layout?.[button.id] || {...defaultButtonOffset(index, rtl), y: nextY};
      const cardHeight = Math.max(140, buttonDims[`btn:${node.id}:${button.id}`]?.height || 0);
      nextY = point.y + cardHeight + 28;
      left = Math.min(left, point.x); right = Math.max(right, point.x + BUTTON_CARD_WIDTH);
      top = Math.min(top, point.y); bottom = Math.max(bottom, point.y + cardHeight);
    });
  }
  return {left, right, top, bottom, width: right - left, height: bottom - top};
}

export function hasLayoutOverlap(nodes: Node<RFData>[], rtl: boolean) {
  return nodes.some((node, i) => {
    const a = nodeFootprint(node, rtl);
    return nodes.slice(i + 1).some(other => {
      const b = nodeFootprint(other, rtl);
      return node.position.x+a.left < other.position.x+b.right+24 && node.position.x+a.right+24 > other.position.x+b.left &&
        node.position.y+a.top < other.position.y+b.bottom+24 && node.position.y+a.bottom+24 > other.position.y+b.top;
    });
  });
}

/** Reserve each node's measured card and button envelope; stable even with cycles. */
export function computeLayout(nodes: Node<RFData>[], edges: {source: string; target: string}[], startId: string, rtl = false, buttonDims: Record<string, {height: number}> = {}) {
  if (!nodes.length) return {} as Record<string, {x: number; y: number}>;
  const known = new Set(nodes.map(n => n.id));
  const out = new Map<string, string[]>();
  for (const edge of edges) if (known.has(edge.source) && known.has(edge.target))
    out.set(edge.source, [...(out.get(edge.source) || []), edge.target]);
  const first = known.has(startId) ? startId : nodes[0].id;
  const depth = new Map([[first, 0]]), queue = [first];
  for (let i = 0; i < queue.length; i++) for (const next of out.get(queue[i]) || [])
    if (!depth.has(next)) { depth.set(next, depth.get(queue[i])! + 1); queue.push(next); }
  const last = Math.max(...depth.values()) + 1;
  const rows = new Map<number, Node<RFData>[]>();
  for (const node of nodes) { const level = depth.get(node.id) ?? last; rows.set(level, [...(rows.get(level) || []), node]); }
  const positions: Record<string, {x: number; y: number}> = {};
  let y = 0;
  for (const [, row] of [...rows].sort((a,b) => a[0]-b[0])) {
    const sizes = row.map(node => nodeFootprint(node, rtl, buttonDims));
    let x = -(sizes.reduce((sum,size) => sum + size.width, 0) + (row.length-1)*100)/2;
    row.forEach((node,index) => { const size=sizes[index]; positions[node.id]={x:x-size.left,y:y-size.top}; x+=size.width+100; });
    y += Math.max(...sizes.map(size => size.height)) + 120;
  }
  return positions;
}
