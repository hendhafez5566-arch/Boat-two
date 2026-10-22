/* eslint-disable @typescript-eslint/no-explicit-any */
import { isValidTimezone } from './hours';
import { FlowGraph, handlesFor, optionsOf } from './types';

export interface Issue {
  nodeId?: string;
  message: string;
}

/** تحقق بنيوي قبل النشر. errors تمنع النشر، وwarnings للتنبيه فقط */
export function validateGraph(graph: FlowGraph): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const ids = new Set<string>();

  for (const n of graph.nodes) {
    if (ids.has(n.id)) errors.push({ nodeId: n.id, message: 'Duplicate node id' });
    ids.add(n.id);
  }
  if (!graph.nodes.length) errors.push({ message: 'Flow has no nodes' });
  if (!ids.has(graph.startNodeId)) errors.push({ message: 'Start node does not exist' });

  for (const n of graph.nodes) {
    const d = n.data ?? {};
    const handles = new Set(handlesFor(n));

    for (const [h, target] of Object.entries(n.edges ?? {})) {
      if (!handles.has(h)) errors.push({ nodeId: n.id, message: `Unknown output "${h}"` });
      if (!ids.has(target)) errors.push({ nodeId: n.id, message: `Output "${h}" points to a missing node` });
    }

    switch (n.type) {
      case 'message': {
        const opts = optionsOf(d);
        const hasContent = d.text || d.media?.url;
        if (!hasContent) errors.push({ nodeId: n.id, message: 'Message is empty' });
        if (opts.length && !d.text) errors.push({ nodeId: n.id, message: 'Buttons/list require message text' });
        if (d.buttons?.length && d.list?.sections?.length)
          errors.push({ nodeId: n.id, message: 'Use either buttons or a list, not both' });
        if (opts.length > 10) errors.push({ nodeId: n.id, message: 'Too many options (max 10)' });
        if (d.buttons?.length > 3) errors.push({ nodeId: n.id, message: 'At most 3 buttons' });
        if (new Set(opts.map((o) => o.id)).size !== opts.length)
          errors.push({ nodeId: n.id, message: 'Option ids must be unique' });
        break;
      }
      case 'question':
        if (!d.text) errors.push({ nodeId: n.id, message: 'Question text is required' });
        if (!d.saveAs || !/^[A-Za-z_][\w]{0,40}$/.test(d.saveAs))
          errors.push({ nodeId: n.id, message: 'saveAs must be a valid variable name' });
        if (d.answerType === 'regex' && !d.pattern)
          errors.push({ nodeId: n.id, message: 'Regex pattern is required' });
        break;
      case 'condition':
        if (!(d.rules ?? []).length) errors.push({ nodeId: n.id, message: 'Add at least one rule' });
        break;
      case 'delay':
        if (!(Number(d.amount) > 0)) errors.push({ nodeId: n.id, message: 'Delay amount must be positive' });
        break;
      case 'http_request':
        if (!/^https?:\/\//i.test(d.url ?? '') && !String(d.url ?? '').includes('{{'))
          errors.push({ nodeId: n.id, message: 'URL must start with http:// or https://' });
        break;
      case 'business_hours':
        if (!d.timezone || !isValidTimezone(d.timezone))
          errors.push({ nodeId: n.id, message: 'Invalid timezone' });
        break;
      case 'split': {
        const b = d.branches ?? [];
        if (b.length < 2) errors.push({ nodeId: n.id, message: 'Split needs at least 2 branches' });
        if (b.reduce((s: number, x: any) => s + Number(x.weight || 0), 0) <= 0)
          errors.push({ nodeId: n.id, message: 'Split weights must be positive' });
        break;
      }
      case 'ai_reply':
        if (d.maxTurns !== undefined && !(Number(d.maxTurns) >= 1 && Number(d.maxTurns) <= 50))
          errors.push({ nodeId: n.id, message: 'Max turns must be between 1 and 50' });
        if (!n.edges?.handoff && !n.edges?.error)
          warnings.push({ nodeId: n.id, message: 'Connect "handoff" and "error" outputs to a handoff node so customers are never stuck' });
        break;
      case 'set_attribute':
        if (!/^[A-Za-z_][\w]{0,40}$/.test(d.key ?? ''))
          errors.push({ nodeId: n.id, message: 'Attribute key is invalid' });
        break;
    }
  }

  // العقد غير المتصلة بالبداية
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = ids.has(graph.startNodeId) ? [graph.startNodeId] : [];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of Object.values(byId.get(id)?.edges ?? {})) if (byId.has(t)) stack.push(t);
  }
  for (const n of graph.nodes) {
    if (!seen.has(n.id)) warnings.push({ nodeId: n.id, message: 'Node is not reachable from the start' });
  }
  return { errors, warnings };
}
