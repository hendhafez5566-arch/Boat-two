/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPath, interpolate, normalizeDigits, normalizeText, Resolver } from './text';

export type Operator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'is_set'
  | 'is_not_set'
  | 'matches_regex';

export interface Condition {
  source: 'variable' | 'contact_field' | 'contact_attribute' | 'last_message' | 'channel';
  key?: string;
  operator: Operator;
  value?: string;
}

export interface Rule {
  id: string;
  match?: 'all' | 'any';
  conditions: Condition[];
}

export interface Operands {
  vars: Record<string, unknown>;
  contact: { name?: string | null; phone?: string | null; email?: string | null; attributes: Record<string, unknown> };
  channelType: string;
  lastText: string;
  resolve: Resolver;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => Number(normalizeDigits(str(v)).replace(/,/g, '').trim());
const isSet = (v: unknown) => v !== null && v !== undefined && str(v) !== '';

function operand(c: Condition, o: Operands): unknown {
  const key = c.key ?? '';
  switch (c.source) {
    case 'variable':
      return getPath(o.vars, key);
    case 'contact_field':
      return (o.contact as any)[key];
    case 'contact_attribute':
      return getPath(o.contact.attributes, key);
    case 'last_message':
      return o.lastText;
    case 'channel':
      return o.channelType;
  }
}

export function evaluateCondition(c: Condition, o: Operands): boolean {
  const a = operand(c, o);
  const bRaw = interpolate(c.value ?? '', o.resolve);

  switch (c.operator) {
    case 'is_set':
      return isSet(a);
    case 'is_not_set':
      return !isSet(a);
    case 'equals': {
      const na = num(a);
      const nb = num(bRaw);
      if (isSet(a) && isSet(bRaw) && !Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
      return normalizeText(str(a)) === normalizeText(bRaw);
    }
    case 'not_equals':
      return !evaluateCondition({ ...c, operator: 'equals' }, o);
    case 'contains':
      return normalizeText(str(a)).includes(normalizeText(bRaw));
    case 'not_contains':
      return !normalizeText(str(a)).includes(normalizeText(bRaw));
    case 'starts_with':
      return normalizeText(str(a)).startsWith(normalizeText(bRaw));
    case 'ends_with':
      return normalizeText(str(a)).endsWith(normalizeText(bRaw));
    case 'greater_than':
      return isSet(a) && num(a) > num(bRaw);
    case 'less_than':
      return isSet(a) && num(a) < num(bRaw);
    case 'matches_regex': {
      if (bRaw.length > 200) return false;
      try {
        return new RegExp(bRaw, 'i').test(str(a).slice(0, 1000));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export function evaluateRule(rule: Rule, o: Operands): boolean {
  if (!rule.conditions.length) return false;
  const results = rule.conditions.map((c) => evaluateCondition(c, o));
  return rule.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}
