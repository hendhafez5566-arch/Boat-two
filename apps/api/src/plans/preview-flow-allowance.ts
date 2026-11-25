/**
 * A one-time, seven-day flow quota for opt-in QA workspaces on Railway Preview.
 * No plan/catalog, billing, or production entitlement is modified.
 */
export const PREVIEW_FLOW_LIMIT = 20;
export const PREVIEW_FLOW_DAYS = 7;

export type PreviewFlowAllowance = { limit: number; expiresAt: string };

export function previewOnly(): boolean {
  return process.env.BOAT_PREVIEW_ONLY === 'true';
}

export function previewFlowAllowance(settings: unknown, now = Date.now()): PreviewFlowAllowance | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const value = (settings as Record<string, unknown>).previewFlowAllowance;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.limit !== PREVIEW_FLOW_LIMIT || typeof data.expiresAt !== 'string') return null;
  const expiry = Date.parse(data.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + PREVIEW_FLOW_DAYS * 86400000 + 60000)
    return null;
  return { limit: PREVIEW_FLOW_LIMIT, expiresAt: data.expiresAt };
}
