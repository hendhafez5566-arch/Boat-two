/* Pure editor operations. Persisted schemas and stable branch handles are unchanged. */
import { NodeType } from './flow-types';
export type Choice = { id: string; title: string; description?: string; [key: string]: unknown };
export type ChoiceData = { buttons?: Choice[]; list?: { buttonText?: string; sections: { title?: string; rows: Choice[] }[]; [key: string]: unknown }; [key: string]: any };
export const ACTION_TYPES: NodeType[] = ['message', 'question', 'condition', 'handoff', 'tag', 'delay', 'end', 'cta_url'];
export function convertChoices(data: ChoiceData, mode: 'none' | 'buttons' | 'list'): ChoiceData {
  const choices = data.list?.sections.flatMap(s => s.rows) ?? data.buttons ?? [];
  if (mode === 'buttons' && (choices.length > 3 || choices.some(c => c.title.length > 20))) throw new Error('button-limit');
  if (mode === 'list' && (choices.length > 10 || choices.some(c => c.title.length > 24))) throw new Error('list-limit');
  if (mode === 'list') return { ...data, buttons: undefined, list: data.list ?? { buttonText: 'القائمة', sections: [{ rows: choices }] } };
  return { ...data, buttons: mode === 'buttons' ? choices : undefined, list: undefined };
}
export function patchChoice(data: ChoiceData, id: string, patch: Partial<Choice>): ChoiceData {
  const update = (rows: Choice[]) => rows.map(c => c.id === id ? { ...c, ...patch, id: c.id } : c);
  return { ...data, ...(data.buttons ? { buttons: update(data.buttons) } : {}), ...(data.list ? { list: { ...data.list, sections: data.list.sections.map(s => ({ ...s, rows: update(s.rows) })) } } : {}) };
}
export function moveChoice(rows: Choice[], id: string, delta: number): Choice[] {
  const next = [...rows], index = rows.findIndex(c => c.id === id), target = index + delta;
  if (index >= 0 && target >= 0 && target < rows.length) [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function insertToken(text: string, start: number, end: number, key: string) {
  const prefix = text.slice(0, start);
  const from = prefix.endsWith('{{') ? start - 2 : start;
  const token = `{{${key}}}`;
  return { text: text.slice(0, from) + token + text.slice(end), caret: from + token.length };
}
