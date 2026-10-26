'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { useData } from './useData';
export function AgentRouting({ channelId }: { channelId?: string } = {}) {
  const { t } = useLocale();
  const routes = useData<
    {
      id: string;
      agent_name: string;
      channel_name: string | null;
      flow_name: string | null;
      channel_id: string | null;
    }[]
  >('/agents/routes', []);
  const agents = useData<{ agents: { id: string; name: string }[] }>('/agents', { agents: [] });
  const channels = useData<{ id: string; name: string }[]>('/channels', []);
  const flows = useData<{ id: string; name: string }[]>('/flows', []);
  const [scope, setScope] = useState('channel');
  const visibleRoutes = channelId
    ? routes.data.filter((route) => route.channel_id === channelId)
    : routes.data;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="card stack">
      <h2>{t('توجيه المساعد حسب القناة أو السيناريو', 'Agent routing by channel or flow')}</h2>
      <p>
        {t(
          'الأولوية لمساعد السيناريو، ثم القناة، ثم الافتراضي. المساعد المعطّل لا يستدعي مزودًا بديلًا.',
          'Flow assignment takes precedence over channel, then default. A disabled assigned agent does not call another provider.',
        )}
      </p>
      {(error || routes.error) && <p className="notice error">{error || routes.error}</p>}
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            await api('/agents/routes', {
              method: 'POST',
              body: JSON.stringify({
                agentId: f.get('agent'),
                scope,
                scopeId: channelId || f.get('scopeId'),
              }),
            });
            await routes.reload();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {t('المساعد', 'Agent')}
          <select name="agent" required>
            <option value="">{t('اختر', 'Choose')}</option>
            {agents.data.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {!channelId && (
          <>
            <label className="field">
              {t('نوع التوجيه', 'Assignment type')}
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="channel">{t('قناة', 'Channel')}</option>
                <option value="flow">{t('سيناريو', 'Flow')}</option>
              </select>
            </label>
            <label className="field">
              {t('الوجهة', 'Destination')}
              <select key={scope} name="scopeId" required>
                <option value="">{t('اختر', 'Choose')}</option>
                {(scope === 'channel' ? channels.data : flows.data).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button className="btn btn-primary" disabled={busy || !!routes.error || !!agents.error}>
          {t('حفظ التوجيه', 'Save assignment')}
        </button>
      </form>
      {!visibleRoutes.length && (
        <p>
          {t(
            'يُستخدم المساعد الافتراضي ما لم تضف توجيهًا.',
            'The default agent is used until an assignment is added.',
          )}
        </p>
      )}
      {visibleRoutes.map((route) => (
        <div className="step" key={route.id}>
          <span>
            {route.flow_name || route.channel_name} → {route.agent_name}
          </span>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/agents/routes/' + route.id, { method: 'DELETE' });
                await routes.reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('إزالة', 'Remove')}
          </button>
        </div>
      ))}
    </section>
  );
}
