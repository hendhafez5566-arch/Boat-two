'use client';
import { useId } from 'react';
import { TemplateValue } from './TemplateParameters';
import { useLocale } from '../product/locale';
export type CampaignContent = {
  text?: string;
  media?: {
    kind: 'image' | 'video' | 'file' | 'audio';
    url?: string;
    caption?: string;
    filename?: string;
  };
  buttons?: { id: string; title: string }[];
  list?: {
    buttonText: string;
    sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  };
  template?: TemplateValue;
};
export function validCampaignContent(c: CampaignContent) {
  const choices = c.buttons ?? c.list?.sections.flatMap((section) => section.rows);
  if(c.media) {
    try {
      const url = new URL(c.media.url ?? '');
      if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||url.hostname.endsWith('.local')||url.href.length>2048)return false;
    } catch {return false;}
    if((c.media.caption??c.text??'').length>1024)return false;
    if(!choices)return true;
    if(c.media.kind!=='image')return false;
  }
  if(!c.text?.trim()||c.text.length>(choices?1024:4096))return false;
  if(c.buttons&&c.list)return false;
  return !choices || (
    choices.length>0 && choices.length<=(c.buttons?3:10) &&
    new Set(choices.map(choice=>choice.id)).size===choices.length &&
    choices.every(choice=>!!choice.id&&!!choice.title.trim()&&choice.title.length<=(c.buttons?20:24)) &&
    (!c.list || (!!c.list.buttonText.trim()&&c.list.buttonText.length<=20&&c.list.sections.every(section=>section.rows.length>0)))
  );
}
export function RichCampaignContent({
  value,
  onChange,
}: {
  value: CampaignContent;
  onChange: (value: CampaignContent) => void;
}) {
  const { t } = useLocale(),
    mode = value.media ? 'media' : value.buttons ? 'buttons' : value.list ? 'list' : 'text',
    choices = value.buttons ?? value.list?.sections.flatMap((s) => s.rows) ?? [];
  const lengthId=useId();
  function changeChoices(rows: { id: string; title: string }[]) {
    onChange(
      value.buttons
        ? { ...value, buttons: rows }
        : {
            ...value,
            list: {
              buttonText: value.list?.buttonText || t('اختيار', 'Choose'),
              sections: [{ rows }],
            },
          },
    );
  }
  return (
    <div className="stack">
      <label className="field">
        {t('نوع الرسالة', 'Message type')}
        <select
          aria-label={t('نوع الرسالة', 'Message type')}
          value={mode}
          onChange={(e) => {
            const next = e.target.value,
              text = value.text ?? '';
            onChange(
              next === 'media'
                ? { text, media: { kind: 'image', url: '' } }
                : next === 'buttons'
                  ? { text, buttons: [{ id: crypto.randomUUID(), title: '' }] }
                  : next === 'list'
                    ? {
                        text,
                        list: {
                          buttonText: t('اختيار', 'Choose'),
                          sections: [{ rows: [{ id: crypto.randomUUID(), title: '' }] }],
                        },
                      }
                    : { text },
            );
          }}
        >
          <option value="text">{t('نص', 'Text')}</option>
          <option value="media">{t('صورة أو فيديو أو ملف', 'Image, video or file')}</option>
          <option value="buttons">{t('أزرار رد', 'Reply buttons')}</option>
          <option value="list">{t('قائمة اختيارات', 'Choice menu')}</option>
        </select>
      </label>
      <label className="field">
        {t('محتوى الرسالة', 'Message content')}
        <textarea
          aria-label={t('محتوى الرسالة', 'Message content')}
          name="text"
          value={value.media?.caption ?? value.text ?? ''}
          maxLength={value.media || value.buttons || value.list ? 1024 : 4096}
          rows={4}
          onChange={(e) =>
            onChange({
              ...value,
              text: e.target.value,
              ...(value.media ? { media: { ...value.media, caption: e.target.value } } : {}),
            })
          }
          required={!value.media}
          aria-describedby={lengthId}
        />
        <small id={lengthId} aria-live="polite">{(value.media?.caption??value.text??'').length} / {value.media||value.buttons||value.list?1024:4096}</small>
      </label>
      {value.media && (
        <div className="form-grid">
          <label className="field">
            {t('نوع الملف', 'Media kind')}
            <select
              aria-label={t('نوع الملف', 'Media kind')}
              value={value.media.kind}
              onChange={(e) =>
                onChange({
                  ...value,
                  media: { ...value.media!, kind: e.target.value as 'image' | 'video' | 'file' },
                })
              }
            >
              <option value="image">{t('صورة', 'Image')}</option>
              <option value="video">{t('فيديو', 'Video')}</option>
              <option value="file">{t('ملف', 'File')}</option>
            </select>
          </label>
          <label className="field">
            {t('رابط HTTPS عام للملف', 'Public HTTPS media URL')}
            <input
              type="url"
              required
              pattern="https://.*"
              value={value.media.url ?? ''}
              onChange={(e) =>
                onChange({ ...value, media: { ...value.media!, url: e.target.value } })
              }
            />
          </label>
          {value.media.kind === 'file' && (
            <label className="field">
              {t('اسم الملف', 'Filename')}
              <input
                maxLength={200}
                value={value.media.filename ?? ''}
                onChange={(e) =>
                  onChange({ ...value, media: { ...value.media!, filename: e.target.value } })
                }
              />
            </label>
          )}
        </div>
      )}
      {value.list && (
        <label className="field">
          {t('عنوان زر القائمة', 'Menu button label')}
          <input
            required
            maxLength={20}
            value={value.list.buttonText}
            onChange={(e) =>
              onChange({ ...value, list: { ...value.list!, buttonText: e.target.value } })
            }
          />
        </label>
      )}
      {(value.buttons || value.list) && (
        <fieldset className="stack">
          <legend>{t('الاختيارات', 'Choices')}</legend>
          {choices.map((choice, index) => (
            <div className="flex gap-2" key={choice.id}>
              <label className="field">
                {t('اختيار ', 'Choice ')}
                {index + 1}
                <input
                  required
                  maxLength={value.buttons ? 20 : 24}
                  value={choice.title}
                  onChange={(e) =>
                    changeChoices(
                      choices.map((c, i) => (i === index ? { ...c, title: e.target.value } : c)),
                    )
                  }
                />
              </label>
              <button
                className="btn"
                type="button"
                disabled={choices.length === 1}
                onClick={() => changeChoices(choices.filter((_, i) => i !== index))}
              >
                {t('إزالة', 'Remove')}
              </button>
            </div>
          ))}
          <button
            className="btn"
            type="button"
            disabled={choices.length >= (value.buttons ? 3 : 10)}
            onClick={() => changeChoices([...choices, { id: crypto.randomUUID(), title: '' }])}
          >
            {t('إضافة اختيار', 'Add choice')}
          </button>
        </fieldset>
      )}
      <p className="muted">
        {t(
          'تظهر القوائم كأزرار رد سريع في قنوات Meta الأخرى. لا تُجلب الوسائط في المعاينة؛ راجع الرابط وصلاحية الملف لدى المزود.',
          'Menus become quick replies on other Meta channels. Preview does not fetch media; verify its public URL and provider compatibility.',
        )}
      </p>
    </div>
  );
}
export function CampaignContentPreview({ content }: { content: CampaignContent }) {
  return (
    <div className="stack whitespace-pre-wrap">
      <p>{content.text}</p>
      {content.media && (
        <p dir="ltr">
          {content.media.kind} · {content.media.url}
        </p>
      )}
      {(content.buttons ?? content.list?.sections.flatMap((s) => s.rows) ?? []).map((x) => (
        <span className="badge" key={x.id}>
          {x.title}
        </span>
      ))}
    </div>
  );
}
