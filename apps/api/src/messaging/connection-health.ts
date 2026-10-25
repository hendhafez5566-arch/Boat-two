/** Provider evidence is separate from the local enabled/disabled switch. */
export type ConnectionState = 'connected' | 'needs_action' | 'expired' | 'disconnected';
export interface ConnectionHealth {
  state: ConnectionState;
  checkedAt: string | null;
  reason: string;
}
export const HEALTH_TTL_MS = 24 * 60 * 60 * 1000;
export function connectionHealth(row: { type: string; status: string; settings?: Record<string, unknown> }, now = Date.now()): ConnectionHealth {
  if (row.status !== 'active') return { state: 'disconnected', checkedAt: null, reason: 'disabled_locally' };
  if (row.type === 'web') return { state: 'needs_action', checkedAt: null, reason: 'widget_installation_required' };
  const value = row.settings?.connectionHealth as ConnectionHealth | undefined;
  const time = Date.parse(value?.checkedAt ?? '');
  if (!value || !Number.isFinite(time) || time > now || now - time > HEALTH_TTL_MS)
    return { state: 'needs_action', checkedAt: value?.checkedAt ?? null, reason: 'verification_required' };
  return value;
}
