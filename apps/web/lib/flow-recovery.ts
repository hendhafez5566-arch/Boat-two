import { getSession } from './api';
export type FlowRecovery = {
  version: 1;
  content: string;
  baseUpdatedAt: string;
  savedAt: string;
  inspectorDraft?: { id: string; data: Record<string, unknown> } | null;
};
const MAX_BYTES = 3_000_000;
function key(id: string) {
  const token = getSession()?.accessToken;
  if (!token) return null;
  const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return typeof claims.sub === 'string' && typeof claims.tid === 'string'
    ? `boat:flow-recovery:v1:${claims.tid}:${claims.sub}:${id}`
    : null;
}
export function validRecovery(value: unknown): value is FlowRecovery {
  try {
    const r = value as FlowRecovery;
    if (
      r?.version !== 1 ||
      typeof r.content !== 'string' ||
      r.content.length > MAX_BYTES ||
      typeof r.baseUpdatedAt !== 'string' ||
      !Number.isFinite(Date.parse(r.savedAt))
    )
      return false;
    const s = JSON.parse(r.content);
    return (
      typeof s.name === 'string' &&
      Array.isArray(s.triggers) &&
      Array.isArray(s.channelIds) &&
      Array.isArray(s.graph?.nodes) &&
      typeof s.graph.startNodeId === 'string' &&
      s.graph.nodes.every(
        (n: { id?: unknown; type?: unknown; data?: unknown }) =>
          typeof n?.id === 'string' &&
          typeof n.type === 'string' &&
          n.data &&
          typeof n.data === 'object',
      )
    );
  } catch {
    return false;
  }
}
export function readFlowRecovery(id: string): FlowRecovery | null {
  try {
    const k = key(id),
      raw = k && localStorage.getItem(k);
    if (!raw || raw.length > MAX_BYTES) return null;
    const r = JSON.parse(raw);
    return validRecovery(r) ? r : null;
  } catch {
    return null;
  }
}
export function writeFlowRecovery(id: string, record: FlowRecovery | null): boolean {
  try {
    const k = key(id);
    if (!k) return false;
    if (!record) {
      localStorage.removeItem(k);
      return true;
    }
    const raw = JSON.stringify(record);
    if (raw.length > MAX_BYTES || !validRecovery(record)) return false;
    localStorage.setItem(k, raw);
    return true;
  } catch {
    return false;
  }
}
export function downloadFlowRecovery(record: FlowRecovery, id: string) {
  const blob = new Blob(
    [
      JSON.stringify(
        { ...JSON.parse(record.content), pendingNodeSettings: record.inspectorDraft ?? null },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `boat-flow-${id}-recovery.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
