import { createHash } from 'node:crypto';
// Canonicalize keys so transport serialization cannot change the authorized request.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function stepUpDigest(method: string, path: string, body: unknown) {
  return createHash('sha256')
    .update(JSON.stringify([method.toUpperCase(), path, canonical(body ?? null)]))
    .digest('hex');
}
