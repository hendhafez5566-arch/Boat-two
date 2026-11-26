'use client';
import { ApprovedTemplatePicker } from './ApprovedTemplatePicker';
import { TemplateValue } from './TemplateParameters';
import { useData } from './useData';
import { useLocale } from '../product/locale';

export function AutomationTemplateAction({
  channelId,
  template,
  change,
}: {
  channelId?: string;
  template?: TemplateValue;
  change: (update: { channelId?: string; template: TemplateValue }) => void;
}) {
  const { t } = useLocale();
  const channels = useData<{ id: string; name: string; type: string; status: string }[]>(
    '/channels',
    [],
  );
  return (
    <div className="stack">
      {channels.error && <p role="alert">{channels.error}</p>}
      <label className="field">
        {t('قناة واتساب', 'WhatsApp channel')}
        <select
          required
          value={channelId || ''}
          onChange={(event) =>
            change({
              channelId: event.target.value,
              template: { name: '', language: 'ar', bodyParams: [] },
            })
          }
        >
          <option value="">{t('اختر قناة', 'Choose a channel')}</option>
          {channels.data
            .filter((channel) => channel.type === 'whatsapp' && channel.status === 'active')
            .map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
        </select>
      </label>
      <ApprovedTemplatePicker
        channelIds={channelId ? [channelId] : []}
        value={template ?? { name: '', language: 'ar', bodyParams: [] }}
        onChange={(value) => change({ template: value })}
      />
      <p className="muted">
        {t(
          'يلزم وجود محادثة واتساب مفتوحة وموافقة العميل وتفعيل الإرسال.',
          'Delivery requires an open WhatsApp conversation, customer opt-in and enabled delivery.',
        )}
      </p>
    </div>
  );
}
