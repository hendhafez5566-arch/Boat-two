'use client';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
export type EditableCampaign = {
  id: string;
  name: string;
  channel_id: string;
  revision: number;
  filters: Record<string, unknown>;
  content: { text?: string; template?: { name: string; language: string; bodyParams: string[] } };
  frequency_hours: number;
};
export function CampaignDraftEditor({
  campaign,
  save,
  busy,
}: {
  campaign: EditableCampaign;
  save: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useLocale();
  return (
    <details>
      <summary className="btn">{t('تعديل المسودة', 'Edit draft')}</summary>
      <form
        className="stack p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save(() =>
            api('/campaigns/' + campaign.id, {
              method: 'PATCH',
              body: JSON.stringify({
                name: form.get('name'),
                channelId: campaign.channel_id,
                filters: campaign.filters,
                frequencyHours: Number(form.get('frequency')),
                revision: campaign.revision,
                content: campaign.content.template
                  ? {
                      template: {
                        ...campaign.content.template,
                        bodyParams: String(form.get('params') || '')
                          .split('\n')
                          .filter(Boolean),
                      },
                    }
                  : { text: form.get('text') },
              }),
            }),
          );
        }}
      >
        <label className="field">
          {t('الاسم', 'Name')}
          <input name="name" defaultValue={campaign.name} maxLength={120} required />
        </label>
        <label className="field">
          {t('فاصل الساعات', 'Frequency hours')}
          <input
            name="frequency"
            type="number"
            min={1}
            max={720}
            defaultValue={campaign.frequency_hours}
            required
          />
        </label>
        {campaign.content.template ? (
          <>
            <p>
              {campaign.content.template.name} · {campaign.content.template.language}
            </p>
            <label className="field">
              {t('قيم القالب، كل قيمة بسطر', 'Template values, one per line')}
              <textarea
                name="params"
                defaultValue={campaign.content.template.bodyParams.join('\n')}
              />
            </label>
          </>
        ) : (
          <label className="field">
            {t('الرسالة', 'Message')}
            <textarea name="text" required maxLength={4096} defaultValue={campaign.content.text} />
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {t('حفظ التعديل', 'Save changes')}
        </button>
      </form>
    </details>
  );
}
