'use client';
import { useEffect, useState } from 'react';
import { api, setSession } from '../../lib/api';
import { useLocale } from './locale';
import { useBrand } from './BrandContext';
export function WorkspaceMenu({ name }: { name: string }) {
  const { t } = useLocale(),
    brand = useBrand(),
    [spaces, setSpaces] = useState<{ tenant_id: string; name: string; role: string }[]>([]),
    [current, setCurrent] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      api<{ workspaces: typeof spaces }>('/auth/me'),
      api<{ tenant: { id: string } }>('/workspace'),
    ])
      .then(([me, ws]) => {
        setSpaces(
          brand ? me.workspaces.filter((s) => s.tenant_id === brand.tenantId) : me.workspaces,
        );
        setCurrent(ws.tenant.id);
      })
      .catch((e) => setError(e.message));
  }, [brand?.tenantId]);
  return (
    <div className="workspace-menu">
      <label className="sr-only" htmlFor="workspace-switch">
        {t('تبديل مساحة العمل', 'Switch workspace')}
      </label>
      <select
        id="workspace-switch"
        aria-busy={busy}
        value={current}
        disabled={busy || spaces.length < 2}
        onChange={async (e) => {
          setBusy(true);
          setError('');
          try {
            const session = await api<{ accessToken: string; refreshToken: string }>(
              '/auth/switch-tenant',
              { method: 'POST', body: JSON.stringify({ tenantId: e.target.value }) },
            );
            setSession(session);
            window.location.assign('/dashboard');
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        {spaces.length ? (
          spaces.map((s) => (
            <option key={s.tenant_id} value={s.tenant_id}>
              {s.name} · {s.role}
            </option>
          ))
        ) : (
          <option value="">{name}</option>
        )}
      </select>
      {error && (
        <span role="alert" className="workspace-switch-error">
          {error}
        </span>
      )}
    </div>
  );
}
