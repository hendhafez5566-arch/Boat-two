'use client';
import dynamic from 'next/dynamic';
import { AgentRouting } from '../business/AgentRouting';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import ChannelSettings from '../product/ChannelSettings';
const WhatsAppFlows = dynamic(() => import('./WhatsAppFlowsPanel'));
const SystemActions = dynamic(() => import('./SystemActionsPanel'));
const Sequences = dynamic(() => import('./SequencesPanel'));
const Commerce = dynamic(() => import('./CommercePanel'));
const Integrations = dynamic(() => import('./IntegrationsPanel'));
const Agents = dynamic(() => import('./AgentsPanel'));
const Knowledge = dynamic(() => import('./KnowledgePanel'));
const Templates = dynamic(() => import('./TemplatesPanel'));

export default function AccountPanel({
  section,
  channelId,
}: {
  section: string;
  channelId: string;
}) {
  const { t } = useLocale();
  const channels = useData<
    {
      id: string;
      name: string;
      type: string;
      status: string;
      settings: Record<string, unknown>;
      widgetSnippet?: string;
    }[]
  >('/channels', []);
  const channel = channels.data.find((item) => item.id === channelId);
  if (section === 'ai_agent_configuration')
    return (
      <section className="stack">
        <header className="page-heading">
          <div>
            <h1>{t('إعداد الذكاء الاصطناعي', 'AI Configuration')}</h1>
            <p>
              {t(
                'اختر المساعد لهذا البوت. تحدد قواعد التوجيه أي مساعد يبدأ المحادثة.',
                'Select agents for this bot. Routing rules decide which agent starts.',
              )}
            </p>
          </div>
        </header>
        {channelId ? (
          <AgentRouting key={channelId} channelId={channelId} />
        ) : (
          <p>{t('اختر حسابًا من القائمة.', 'Choose an account from the list.')}</p>
        )}
      </section>
    );
  if (section === 'whatsapp_flows')
    return channel?.type === 'whatsapp' ? (
      <WhatsAppFlows key={channelId} channelId={channelId} />
    ) : (
      <p>
        {t('اختر حساب WhatsApp لإدارة نماذجه.', 'Select a WhatsApp account to manage its Flows.')}
      </p>
    );
  if (section === 'action_buttons') return <SystemActions key={channelId} channelId={channelId} />;
  if (section === 'sequences') return <Sequences />;
  if (section === 'message_templates')
    return channel?.type === 'whatsapp' ? (
      <Templates params={{ id: channel.id }} />
    ) : (
      <p className="notice">
        {t(
          'اختر حساب WhatsApp لإدارة قوالبه.',
          'Select a WhatsApp account to manage its templates.',
        )}
      </p>
    );
  if (section === 'appointment_booking') return <Commerce initialTab="appointments" />;
  if (section === 'product_catalog') return <Commerce initialTab="products" />;
  if (section === 'integrations' || section === 'autoresponder' || section === 'webhook_workflows')
    return <Integrations />;
  if (section === 'ai_agents') return <Agents />;
  if (section === 'knowledge') return <Knowledge />;
  return (
    <section className="card stack">
      <h2>
        {section === 'chat_widget'
          ? t('نقاط بدء المحادثة', 'Chat Entry')
          : t('إعدادات الحساب', 'Bot Settings')}
      </h2>
      {channels.error && <p role="alert">{channels.error}</p>}
      {!channel ? (
        <p>{t('اختر حسابًا من القائمة.', 'Choose an account from the list.')}</p>
      ) : (
        <>
          <p>
            {channel.name} · {channel.type}
          </p>
          {section === 'chat_widget' && channel.type !== 'web' && (
            <p>
              {t(
                'أدوات الدخول المتاحة تعتمد على نوع القناة. إعدادات الحساب متاحة أدناه.',
                'Available entry tools depend on the channel. Account settings are available below.',
              )}
            </p>
          )}
          {channel.widgetSnippet && (
            <label className="field">
              {t('كود تضمين محادثة الموقع', 'Website chat embed code')}
              <textarea readOnly dir="ltr" rows={4} value={channel.widgetSnippet} />
            </label>
          )}
          <ChannelSettings channel={channel} onSaved={() => void channels.reload()} />
        </>
      )}
    </section>
  );
}
