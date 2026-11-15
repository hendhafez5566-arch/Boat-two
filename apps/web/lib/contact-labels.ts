export function collectContactLabels(values: string[], pending = ''): string[] {
  const result = [
    ...new Set([...values, ...pending.split(/[,،\n]/)].map((v) => v.trim()).filter(Boolean)),
  ];
  if (result.length > 30) throw new Error('LABEL_COUNT');
  if (result.some((v) => v.length > 50)) throw new Error('LABEL_LENGTH');
  return result;
}
export function contactAttributes(value: string): Record<string, string | number | boolean | null> {
  const parsed = JSON.parse(value);
  if (
    !parsed ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object' ||
    Object.values(parsed).some(
      (v) =>
        v !== null &&
        typeof v !== 'string' &&
        typeof v !== 'boolean' &&
        (typeof v !== 'number' || !Number.isFinite(v)),
    )
  )
    throw new Error('ATTRIBUTE_OBJECT');
  return parsed;
}
