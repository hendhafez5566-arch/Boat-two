import { env } from '../config/env';
import { GRAPH } from './adapters/adapter';

export type MessagingAuthorization = {
  status: 'granted' | 'missing_permission' | 'invalid_token' | 'wrong_app' | 'unknown';
  expiresAt: string | null;
  reason: 'valid' | 'no_messaging_scope' | 'invalid' | 'wrong_app' | 'unavailable';
};

/** Read only; never logs or returns the bearer access token or App Secret. */
export async function inspectMetaMessagingPermission(
  token: string,
): Promise<MessagingAuthorization> {
  const unknown: MessagingAuthorization = {
    status: 'unknown', expiresAt: null, reason: 'unavailable',
  };
  if (!token || !env.META_APP_ID || !env.META_APP_SECRET) return unknown;
  try {
    const url = new URL(`${GRAPH}/debug_token`);
    url.searchParams.set('input_token', token);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.META_APP_ID}|${env.META_APP_SECRET}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return unknown;
    const body = await response.json() as {
      data?: {
        app_id?: string;
        is_valid?: boolean;
        scopes?: string[];
        granular_scopes?: { scope: string }[];
        expires_at?: number;
      };
    };
    const data = body.data;
    if (!data || typeof data.is_valid !== 'boolean') return unknown;
    const expiresAt =
      typeof data.expires_at === 'number' && data.expires_at > 0
        ? new Date(data.expires_at * 1000).toISOString()
        : null;
    if (!data.is_valid)
      return { status: 'invalid_token', expiresAt, reason: 'invalid' };
    if (data.app_id && data.app_id !== env.META_APP_ID)
      return { status: 'wrong_app', expiresAt, reason: 'wrong_app' };
    const scopes = new Set([
      ...(Array.isArray(data.scopes) ? data.scopes : []),
      ...(Array.isArray(data.granular_scopes)
        ? data.granular_scopes.map((x) => x.scope)
        : []),
    ]);
    if (!Array.isArray(data.scopes) && !Array.isArray(data.granular_scopes))
      return { ...unknown, expiresAt };
    return scopes.has('whatsapp_business_messaging')
      ? { status: 'granted', expiresAt, reason: 'valid' }
      : { status: 'missing_permission', expiresAt, reason: 'no_messaging_scope' };
  } catch {
    return unknown;
  }
}

export function classifyOutboundFailure(reason: string): {
  category: 'authentication' | 'permission' | 'provider_limit' |
    'delivery_blocked' | 'other';
  code: string | null;
} {
  const value = reason.slice(0, 450);
  const match = value.match(/\(?#(\d{1,7})\)?/);
  if (/auth|oauth|token|expired|190\b/i.test(value))
    return { category: 'authentication', code: match?.[1] ?? null };
  if (/permission|access denied|unsupported post|131005|200\b/i.test(value))
    return { category: 'permission', code: match?.[1] ?? null };
  if (/rate limit|thrott|131056|130429/i.test(value))
    return { category: 'provider_limit', code: match?.[1] ?? null };
  if (/external delivery disabled|window expired|recipient blocked/i.test(value))
    return { category: 'delivery_blocked', code: match?.[1] ?? null };
  return { category: 'other', code: match?.[1] ?? null };
}
