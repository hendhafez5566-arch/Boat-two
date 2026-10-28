export type ContactField = {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
};
export function parseContactField(
  field: ContactField,
  input: string,
): string | number | boolean | null {
  if (!input.trim()) return null;
  if (field.type === 'number') {
    const value = Number(input);
    if (!Number.isFinite(value)) throw new Error('INVALID_NUMBER');
    return value;
  }
  if (field.type === 'boolean') {
    if (input !== 'true' && input !== 'false') throw new Error('INVALID_BOOLEAN');
    return input === 'true';
  }
  if (field.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('INVALID_DATE');
    const date = new Date(input + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input)
      throw new Error('INVALID_DATE');
  }
  if (input.length > 2000) throw new Error('VALUE_TOO_LONG');
  return input;
}
