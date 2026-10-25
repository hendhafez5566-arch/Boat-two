/* eslint-disable @typescript-eslint/no-explicit-any */
import {nodeSchema} from '../flow-schemas';
import { isValidTimezone } from './hours';
import { parseSheetUrl } from './sheet';
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
      case 'product':
      case 'catalog':
      case 'appointment':
      case 'whatsapp_flow': {
        const parsed=nodeSchema.safeParse(n);
        if(!parsed.success)for(const issue of parsed.error.issues)errors.push({nodeId:n.id,message:`${issue.path.join('.')}: ${issue.message}`});
        if(n.type==='catalog'&&d.selectable&&(d.native||(d.productIds??[]).length>10))errors.push({nodeId:n.id,message:'Selectable catalogs require 1–10 non-native products'});
        if(n.type==='catalog'&&new Set(d.productIds??[]).size!==(d.productIds??[]).length)errors.push({nodeId:n.id,message:'Catalog products must be unique'});
        break;
      }
      case 'interactive':
      case 'message': {
        const opts = optionsOf(d);
        if ((d.header || d.footer) && !opts.length) errors.push({nodeId:n.id,message:'Header/footer require interactive choices'});
        if (d.header && d.media) errors.push({nodeId:n.id,message:'Choose either an explicit header or media'});
        if (opts.length && String(d.text ?? '').length > 1024) errors.push({nodeId:n.id,message:'Interactive body supports at most 1024 characters'});
        if (n.type === 'interactive' && !opts.length)
          errors.push({ nodeId: n.id, message: 'Interactive message needs at least one button or list option' });
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
        if (d.allowSkip && (d.buttons?.length ?? 0) >= 3) errors.push({ nodeId: n.id, message: 'At most 3 buttons' });
        if (!d.text) errors.push({ nodeId: n.id, message: 'Question text is required' });
        if (!d.saveAs || !/^[A-Za-z_][\w]{0,40}$/.test(d.saveAs))
          errors.push({ nodeId: n.id, message: 'saveAs must be a valid variable name' });
        if (d.answerType === 'regex' && !d.pattern)
          errors.push({ nodeId: n.id, message: 'Regex pattern is required' });
        break;
      case 'location':
        if (!d.lat || !d.lng) errors.push({ nodeId: n.id, message: 'Latitude and longitude are required' });
        break;
      case 'cta_url':
        if (!d.text) errors.push({ nodeId: n.id, message: 'CTA message text is required' });
        if (!d.buttonText) errors.push({ nodeId: n.id, message: 'Button label is required' });
        if (!/^https?:\/\//i.test(d.url ?? '') && !String(d.url ?? '').includes('{{'))
          errors.push({ nodeId: n.id, message: 'URL must start with http:// or https://' });
        break;
      case 'sequence':
        if (!d.sequenceId) errors.push({ nodeId: n.id, message: 'Choose a sequence' });
        break;
      case 'template':
        if (!/^[a-z0-9_]{1,512}$/.test(d.name ?? '')) errors.push({ nodeId: n.id, message: 'Template name is invalid' });
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
      case 'sheet_fetch':
        if (!d.connectionId && !parseSheetUrl(String(d.url ?? '')))
          errors.push({ nodeId: n.id, message: 'Use a public Google Sheet link (docs.google.com/spreadsheets/...)' });
        if (String(d.lookupColumn ?? '').trim() && !String(d.lookupValue ?? '').trim())
          errors.push({ nodeId: n.id, message: 'Lookup value is required when a lookup column is set' });
        if (!(d.saveAs ?? []).some((m: any) => m?.column && m?.variable))
          warnings.push({ nodeId: n.id, message: 'No column is saved to a variable' });
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
      case 'random_number':
        if (!Number.isInteger(Number(d.min)) || !Number.isInteger(Number(d.max)) || d.min === '' || d.max === '')
          errors.push({ nodeId: n.id, message: 'Min and max must be whole numbers' });
        else if (Number(d.min) > Number(d.max)) errors.push({ nodeId: n.id, message: 'Min must not exceed max' });
        if (!/^[A-Za-z_][\w]{0,40}$/.test(d.saveAs ?? ''))
          errors.push({ nodeId: n.id, message: 'saveAs must be a valid variable name' });
        break;
      case 'ai_reply':
        if (d.maxTurns !== undefined && !(Number(d.maxTurns) >= 1 && Number(d.maxTurns) <= 50))
          errors.push({ nodeId: n.id, message: 'Max turns must be between 1 and 50' });
        if (!n.edges?.handoff && !n.edges?.error)
          warnings.push({ nodeId: n.id, message: 'Connect "handoff" and "error" outputs to a handoff node so customers are never stuck' });
        break;
      case 'tag':
        if (!(d.add ?? []).length && !(d.remove ?? []).length)
          errors.push({ nodeId: n.id, message: 'Add or remove at least one tag' });
        break;
      case 'image':
      case 'audio':
      case 'video':
      case 'file':
        if (!/^https?:\/\/\S+$/i.test(String(d.url ?? '').trim()) && !/^\{\{[^}]+\}\}/.test(String(d.url ?? '').trim()))
          errors.push({ nodeId: n.id, message: 'A valid media URL (https://…) is required' });
        break;
      case 'user_input': {
        const qs: any[] = d.questions ?? [];
        if (!qs.length) errors.push({ nodeId: n.id, message: 'User input flow needs at least one question' });
        const keys = new Set<string>();
        for (const q of qs) {
          if (!String(q.text ?? '').trim()) errors.push({ nodeId: n.id, message: 'Question text is required' });
          if (!/^[A-Za-z_][\w]{0,40}$/.test(q.saveAs ?? ''))
            errors.push({ nodeId: n.id, message: 'Custom field key is invalid' });
          else if (keys.has(q.saveAs)) errors.push({ nodeId: n.id, message: 'Custom field keys must be unique' });
          else keys.add(q.saveAs);
          if (q.kind === 'choice') {
            const o: any[] = q.options ?? [];
            if (q.allowSkip && o.length >= 10) errors.push({ nodeId: n.id, message: 'Too many options (max 10)' });
            if (o.length < 2) errors.push({ nodeId: n.id, message: 'Multiple choice needs at least 2 options' });
            if (new Set(o.map((x) => x.id)).size !== o.length)
              errors.push({ nodeId: n.id, message: 'Option ids must be unique' });
          }
        }
        break;
      }
      case 'note':
        if (!String(d.body ?? '').trim())
          errors.push({ nodeId: n.id, message: 'Note text is empty' });
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
