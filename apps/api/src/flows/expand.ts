import { BadRequestException } from '@nestjs/common';
import { FlowGraph, FlowNode, handlesFor } from './engine';
// Freeze reusable published graphs into the parent version; running sessions never follow a moving draft.
export async function expandSubflows(
  graph: FlowGraph,
  resolve: (id: string) => Promise<FlowGraph>,
  path: string[] = [],
  prefix = '',
): Promise<FlowGraph> {
  if (path.length > 5) throw new BadRequestException('Subflow nesting exceeds five levels');
  const output: FlowNode[] = [];
  for (const source of graph.nodes) {
    const node: FlowNode = {
      ...structuredClone(source),
      id: prefix + source.id,
      edges: Object.fromEntries(Object.entries(source.edges).map(([k, v]) => [k, prefix + v])),
    };
    if (source.type !== 'subflow') {
      output.push(node);
      continue;
    }
    const id = String(source.data.flowId);
    if (path.includes(id)) throw new BadRequestException('Recursive subflow reference');
    const child = await expandSubflows(await resolve(id), resolve, [...path, id], node.id + '__');
    const next = node.edges.next || node.id + '__return';
    output.push({
      ...node,
      type: 'set_variable',
      data: { assignments: [] },
      edges: { next: child.startNodeId },
    });
    for (const leaf of child.nodes) {
      if (leaf.type === 'end') {
        if (leaf.data.closeConversation)
          throw new BadRequestException('A reusable subflow cannot close the conversation');
        output.push({
          ...leaf,
          type: leaf.data.message ? 'message' : 'set_variable',
          data: leaf.data.message ? { text: leaf.data.message } : { assignments: [] },
          edges: { next },
        });
      } else {
        if (leaf.type !== 'handoff')
          for (const handle of handlesFor(leaf)) if (!leaf.edges[handle]) leaf.edges[handle] = next;
        output.push(leaf);
      }
    }
    if (!node.edges.next) output.push({ id: next, type: 'end', data: {}, edges: {} });
    if (output.length > 300) throw new BadRequestException('Expanded flow exceeds 300 nodes');
  }
  return { startNodeId: prefix + graph.startNodeId, nodes: output, ...(!prefix && graph.policy ? { policy: structuredClone(graph.policy) } : {}) };
}
