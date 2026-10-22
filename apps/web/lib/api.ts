export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Session = { accessToken: string; refreshToken: string };

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('session');
  try {
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    localStorage.removeItem('session');
    return null;
  }
}
export function setSession(s: Session | null) {
  if (s) localStorage.setItem('session', JSON.stringify(s));
  else localStorage.removeItem('session');
}

let refreshPromise: Promise<Session | null> | null = null;

async function raw(path: string, init: RequestInit, token?: string) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let session = getSession();
  let res = await raw(path, init, session?.accessToken);

  if (res.status === 401 && session) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const r = await raw('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: session!.refreshToken }),
        });
        if (!r.ok) {
          setSession(null);
          return null;
        }
        const t = await r.json();
        const next = { accessToken: t.accessToken, refreshToken: t.refreshToken };
        setSession(next);
        return next;
      })().finally(() => {
        refreshPromise = null;
      });
    }
    session = await refreshPromise;
    if (session) res = await raw(path, init, session.accessToken);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message ?? data?.code ?? `HTTP ${res.status}`) as Error & {
      details?: unknown;
    };
    err.details = data;
    throw err;
  }
  return data as T;
}

/** تنزيل ملف محمي (يحتاج توكن) كـ Blob، مثل وسائط واتساب الواردة */
export async function apiBlob(path: string): Promise<Blob> {
  const session = getSession();
  const res = await fetch(`${API}${path}`, {
    headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}
