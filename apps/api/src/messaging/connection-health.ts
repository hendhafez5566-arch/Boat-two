/** Provider evidence is separate from the local enabled/disabled switch. */
export type ConnectionState = 'connected' | 'needs_action' | 'expired' | 'disconnected';
export interface ConnectionHealth {
  state: ConnectionState;
  checkedAt: string | null;
  reason: string;
  expiresAt?: string | null;
}
export const HEALTH_TTL_MS = 24 * 60 * 60 * 1000;
export function connectionHealth(
  row: { type: string; status: string; settings?: Record<string, unknown> },
  now = Date.now(),
): ConnectionHealth {
  if (row.status !== 'active')
    return { state: 'disconnected', checkedAt: null, reason: 'disabled_locally' };
  if (row.type === 'web')
    return { state: 'needs_action', checkedAt: null, reason: 'widget_installation_required' };
  const value = row.settings?.connectionHealth as ConnectionHealth | undefined;
  const auth = row.settings?.metaAuthorization as
    | {
        status?: string;
        checkedAt?: string;
        expiresAt?: string | null;
        dataAccessExpiresAt?: string | null;
      }
    | undefined;
  if (row.type === 'whatsapp' && auth) {
    const checkedAt = auth.checkedAt ?? null;
    if (auth.status === 'invalid_token')
      return { state: 'expired', checkedAt, reason: 'authorization_expired' };
    if (auth.status === 'unknown')
      return { state: 'needs_action', checkedAt, reason: 'authorization_unavailable' };
    if (auth.status === 'wrong_app' || auth.status === 'missing_permission')
      return { state: 'needs_action', checkedAt, reason: 'messaging_permission_required' };
    const expiry = [auth.expiresAt, auth.dataAccessExpiresAt]
      .map((date) => Date.parse(date ?? ''))
      .filter(Number.isFinite);
    const expiresAt = expiry.length ? new Date(Math.min(...expiry)).toISOString() : null;
    if (expiry.some((time) => time <= now))
      return { state: 'expired', checkedAt, reason: 'authorization_expired', expiresAt };
    if (expiry.some((time) => time - now <= 7 * 24 * 60 * 60 * 1000))
      return { state: 'needs_action', checkedAt, reason: 'authorization_expiring', expiresAt };
  }
  const time = Date.parse(value?.checkedAt ?? '');
  if (!value || !Number.isFinite(time) || time > now || now - time > HEALTH_TTL_MS)
    return {
      state: 'needs_action',
      checkedAt: value?.checkedAt ?? null,
      reason: 'verification_required',
    };
  return value;
}
