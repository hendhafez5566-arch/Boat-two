import * as SecureStore from 'expo-secure-store';

export type Role = 'owner' | 'admin' | 'agent';
export type WorkspaceInfo = { tenant_id: string; role: Role; name?: string; workspace_name?: string };
export type Session = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  role: Role;
  workspaces?: WorkspaceInfo[];
};
export type CurrentUser = { id: string; email: string; full_name: string };
export type MeResponse = { user: CurrentUser; workspaces: WorkspaceInfo[] };

const STORAGE_KEY = 'bot-two-team-session-v1';
const ROOT = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
let active: Session | null = null;
let refreshing: Promise<boolean> | null = null;

export function apiConfigured() {
  return /^https:\/\/[^\s/]+/.test(ROOT) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ROOT);
}
export function apiRoot() { return ROOT; }
export function getSession() { return active; }

function verifySession(value: unknown): value is Session {
  const s = value as Partial<Session> | null;
  return Boolean(s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string'
    && typeof s.tenantId === 'string' && ['owner', 'admin', 'agent'].includes(s.role || ''));
}
async function saveSession(value: Session | null) {
  active = value;
  if (value) await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(STORAGE_KEY);
}
export async function restoreSession(): Promise<Session | null> {
  if (!apiConfigured()) return null;
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : null;
    active = verifySession(parsed) ? parsed : null;
    if (value && !active) await SecureStore.deleteItemAsync(STORAGE_KEY);
    return active;
  } catch {
    active = null;
    return null;
  }
}
async function send(path: string, init: RequestInit, token?: string): Promise<Response> {
  if (!apiConfigured()) throw new Error('اضبط EXPO_PUBLIC_API_URL بعنوان API آمن أولاً.');
  return fetch(ROOT + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...init.headers,
    },
  });
}
async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join('، ') : payload.message;
    throw new Error(typeof message === 'string' ? message : 'فشل الاتصال بالخادم (' + response.status + ')');
  }
  return payload as T;
}
export async function signIn(email: string, password: string): Promise<Session> {
  const response = await send('/auth/login', {
    method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const value: unknown = await readResponse(response);
  if (!verifySession(value)) throw new Error('بيانات الجلسة غير صالحة');
  await saveSession(value);
  return value;
}
async function refresh(): Promise<boolean> {
  if (!active) return false;
  if (refreshing) return refreshing;
  const previous = active;
  const current = (async () => {
    try {
      const response = await send('/auth/refresh', {
        method: 'POST', body: JSON.stringify({ refreshToken: previous.refreshToken }),
      });
      const value = await readResponse<Pick<Session, 'accessToken' | 'refreshToken'>>(response);
      if (active?.refreshToken !== previous.refreshToken) return active !== null;
      if (!value.accessToken || !value.refreshToken) throw new Error('Invalid refresh response');
      await saveSession({ ...previous, accessToken: value.accessToken, refreshToken: value.refreshToken });
      return true;
    } catch {
      if (active?.refreshToken === previous.refreshToken) await saveSession(null);
      return false;
    }
  })();
  refreshing = current;
  try { return await current; } finally { if (refreshing === current) refreshing = null; }
}
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const session = active;
  if (!session) throw new Error('انتهت الجلسة، سجل الدخول مرة أخرى.');
  const init: RequestInit = { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  let response = await send(path, init, session.accessToken);
  if (response.status === 401 && await refresh()) {
    response = await send(path, init, active?.accessToken);
  }
  if (response.status === 401) {
    await saveSession(null);
    throw new Error('انتهت الجلسة، سجل الدخول مرة أخرى.');
  }
  return readResponse<T>(response);
}
export async function switchWorkspace(tenantId: string): Promise<Session> {
  const value = await request<Pick<Session, 'accessToken' | 'refreshToken' | 'tenantId' | 'role'>>(
    '/auth/switch-tenant', 'POST', { tenantId },
  );
  if (!active) throw new Error('انتهت الجلسة');
  const next: Session = { ...active, ...value };
  await saveSession(next);
  return next;
}
export async function signOut() {
  const token = active?.refreshToken;
  try {
    if (token) await send('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: token }) });
  } finally { await saveSession(null); }
}
