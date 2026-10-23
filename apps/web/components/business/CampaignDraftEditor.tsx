'use client';
import { useState } from 'react';
import { RichCampaignContent, CampaignContent } from './RichCampaignContent';
import { useData } from './useData';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
export type EditableCampaign = {
  id: string;
  name: string;
  channel_id: string;
  revision: number;
  filters: Record<string, unknown>;
  content: CampaignContent;
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
  const [draft, setDraft] = useState<CampaignContent>(campaign.content);
  const segments = useData<{ id: string; name: string; filters: Record<string, unknown> }[]>(
    '/crm/segments',
    [],
  );
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
                filters:
                  form.get('audience') === '__keep'
                    ? campaign.filters
                    : (segments.data.find((s) => s.id === form.get('audience'))?.filters ?? {}),
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
                  : draft,
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
          <RichCampaignContent value={draft} onChange={setDraft} />
        )}
        <label className="field">
          {t('تعديل الجمهور', 'Edit audience')}
          <select name="audience" defaultValue="__keep">
            <option value="__keep">{t('الاحتفاظ بالجمهور الحالي', 'Keep current audience')}</option>
            <option value="">{t('كل المؤهلين', 'All eligible contacts')}</option>
            {segments.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {t('حفظ التعديل', 'Save changes')}
        </button>
      </form>
    </details>
  );
}
