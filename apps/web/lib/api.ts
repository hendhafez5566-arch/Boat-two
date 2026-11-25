export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Session = { accessToken: string; refreshToken: string; generation?: string };

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
  if (s)
    localStorage.setItem(
      'session',
      JSON.stringify({ ...s, generation: s.generation ?? crypto.randomUUID() }),
    );
  else localStorage.removeItem('session');
}

let pendingRefresh: { token: string; promise: Promise<Session | null> } | null = null;

async function raw(path: string, init: RequestInit, token?: string) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function refreshSession(previous: Session): Promise<Session | null> {
  const sameLogin = (current: Session | null) =>
    current && previous.generation && current.generation === previous.generation ? current : null;
  const refresh = async () => {
    const current = getSession();
    if (!current || current.refreshToken !== previous.refreshToken) return sameLogin(current);

    const response = await raw('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: previous.refreshToken }),
    });
    // A sign-in, logout or refresh in another tab may have completed during the request.
    const latest = getSession();
    if (!latest || latest.refreshToken !== previous.refreshToken) return sameLogin(latest);
    if (!response.ok) {
      if (response.status === 401) setSession(null);
      return null;
    }
    const payload = await response.json();
    const next = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      generation: previous.generation ?? crypto.randomUUID(),
    };
    if (getSession()?.refreshToken === previous.refreshToken) {
      setSession(next);
      return next;
    }
    return sameLogin(getSession());
  };

  // Refresh tokens rotate once. Coordinate tabs on the same origin before using one.
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('boat-two-session-refresh', refresh)
    : refresh();
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let session = getSession();
  let res = await raw(path, init, session?.accessToken);

  if (res.status === 401 && session && !init.signal?.aborted) {
    const previous = session;
    if (pendingRefresh?.token !== previous.refreshToken) {
      const promise = refreshSession(previous).finally(() => {
        if (pendingRefresh?.promise === promise) pendingRefresh = null;
      });
      pendingRefresh = { token: previous.refreshToken, promise };
    }
    session = await pendingRefresh.promise;
    if (
      session &&
      (!previous.generation || previous.generation === session.generation) &&
      !init.signal?.aborted &&
      getSession()?.accessToken === session.accessToken
    ) {
      res = await raw(path, init, session.accessToken);
    }
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
