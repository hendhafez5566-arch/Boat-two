'use client';
import {
  TemplateParameters,
  TemplatePreview,
  ApprovedTemplate,
  validTemplateValue,
} from './TemplateParameters';
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
  expanded = false,
}: {
  campaign: EditableCampaign;
  save: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  expanded?: boolean;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<CampaignContent>(campaign.content);
  const segments = useData<{ id: string; name: string; filters: Record<string, unknown> }[]>(
    '/crm/segments',
    [],
  );
  const templates = useData<ApprovedTemplate[]>(
    campaign.content.template ? '/channels/' + campaign.channel_id + '/templates' : '',
    [],
  );
  const definition = templates.data.find(
    (x) => x.name === draft.template?.name && x.language === draft.template?.language,
  );
  return (
    <details open={expanded || undefined}>
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
                content: draft,
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
        {draft.template ? (
          <>
            <p>
              {draft.template.name} · {draft.template.language}
            </p>
            {definition ? (
              <>
                <TemplateParameters
                  definition={definition}
                  value={draft.template}
                  onChange={(template) => setDraft({ template })}
                />
                <TemplatePreview definition={definition} value={draft.template} />
              </>
            ) : (
              <p role="status">
                {t(
                  'تحميل تعريف القالب؛ إذا تعذر التحميل فأعد المحاولة.',
                  'Loading template definition; retry if unavailable.',
                )}
              </p>
            )}
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
        <button
          className="btn btn-primary"
          disabled={
            busy ||
            (!!draft.template && (!definition || !validTemplateValue(definition, draft.template)))
          }
        >
          {t('حفظ التعديل', 'Save changes')}
        </button>
      </form>
    </details>
  );
}
