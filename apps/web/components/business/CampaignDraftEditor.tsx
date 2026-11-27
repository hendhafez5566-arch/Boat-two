'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';

import {
  ApprovedTemplate,
  validTemplateValue,
} from './TemplateParameters';
import { ApprovedTemplatePicker } from './ApprovedTemplatePicker';
import { useEffect,useRef,useState } from 'react';
import { RichCampaignContent, CampaignContent,validCampaignContent } from './RichCampaignContent';
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
  onDraftState,
}: {
  campaign: EditableCampaign;
  save: (fn: () => Promise<unknown>) => Promise<void|boolean>;
  onDraftState?: (dirty:boolean,busy:boolean)=>void;
  busy: boolean;
  expanded?: boolean;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<CampaignContent>(campaign.content);
  const [name,setName]=useState(campaign.name);
  const [frequency,setFrequency]=useState(campaign.frequency_hours);
  const [audience,setAudience]=useState('__keep');
  const [submitting,setSubmitting]=useState(false);
  const lock=useRef(false);
  const dirty=name!==campaign.name||frequency!==campaign.frequency_hours||audience!=='__keep'||JSON.stringify(draft)!==JSON.stringify(campaign.content);
  useEffect(()=>{onDraftState?.(dirty,busy||submitting);},[dirty,busy,submitting,onDraftState]);
  useEffect(()=>{if(!dirty&&!submitting)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,submitting]);
  const segments = useData<{ id: string; name: string; filters: Record<string, unknown> }[]>(
    '/crm/segments',
    [],
  );
  const templates = useData<ApprovedTemplate[]>(
    campaign.content.template ? '/channels/' + campaign.channel_id + '/templates' : '',
    [],
  );
  const definition = templates.data.find(
    (x) => x.status === 'APPROVED' && x.supported && x.name === draft.template?.name && x.language === draft.template?.language,
  );
  return (
    <details open={expanded || undefined}>
      <DisclosureSummary className="btn">{t('تعديل المسودة', 'Edit draft')}</DisclosureSummary>
      <form
        className="stack p-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if(lock.current||busy||!dirty||!name.trim()||!Number.isInteger(frequency)||frequency<1||frequency>720||(audience!=='__keep'&&audience!==''&&!segments.data.some(s=>s.id===audience))||!(draft.template?definition&&validTemplateValue(definition,draft.template):validCampaignContent(draft)))return;
          lock.current=true;setSubmitting(true);
          try {await save(() =>
            api('/campaigns/' + campaign.id, {
              method: 'PATCH',
              body: JSON.stringify({
                name:name.trim(),
                channelId: campaign.channel_id,
                filters:
                  audience === '__keep'
                    ? campaign.filters
                    : (segments.data.find((s) => s.id === audience)?.filters ?? {}),
                frequencyHours:frequency,
                revision: campaign.revision,
                content: draft,
              }),
            }),
          );}finally{lock.current=false;setSubmitting(false);}
        }}
      >
        <fieldset disabled={busy||submitting} style={{border:0,padding:0,margin:0,minWidth:0,display:'grid',gap:12}}>
        <label className="field">
          {t('الاسم', 'Name')}
          <input name="name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} required />
        </label>
        <label className="field">
          {t('فاصل الساعات', 'Frequency hours')}
          <input
            name="frequency"
            type="number"
            min={1}
            max={720}
            value={frequency} onChange={e=>setFrequency(Number(e.target.value))}
            required
          />
        </label>
        {draft.template ? (
          <ApprovedTemplatePicker channelIds={[campaign.channel_id]} value={draft.template}
            onChange={(template) => setDraft({ template })} />
        ) : (
          <RichCampaignContent value={draft} onChange={setDraft} />
        )}
        <label className="field">
          {t('تعديل الجمهور', 'Edit audience')}
          <select name="audience" value={audience} onChange={e=>setAudience(e.target.value)} disabled={segments.loading||!!segments.error}>
            <option value="__keep">{t('الاحتفاظ بالجمهور الحالي', 'Keep current audience')}</option>
            <option value="">{t('كل المؤهلين', 'All eligible contacts')}</option>
            {segments.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {segments.error&&<p role="alert">{segments.error} <button className="btn" type="button" onClick={()=>void segments.reload()}>{t('إعادة المحاولة','Retry')}</button></p>}
        <button
          className="btn btn-primary"
          disabled={
            busy ||submitting||!dirty||!name.trim()||!Number.isInteger(frequency)||frequency<1||frequency>720||
            (draft.template ? !definition || !validTemplateValue(definition,draft.template) : !validCampaignContent(draft))
          }
        >
          {submitting?t('جارٍ الحفظ…','Saving…'):t('حفظ التعديل', 'Save changes')}
        </button>
        </fieldset>
      </form>
    </details>
  );
}
