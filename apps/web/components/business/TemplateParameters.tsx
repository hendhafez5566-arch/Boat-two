'use client';
import { useLocale } from '../product/locale';
export type TemplateValue = {
  name: string;
  language: string;
  bodyParams: string[];
  header?:
    | { type: 'text'; text: string }
    | { type: 'image' | 'video' | 'document'; url: string; filename?: string };
  buttonParams?: { index: number; type: 'quick_reply' | 'url'; value: string }[];
};
export type ApprovedTemplate = {
  name: string;
  language: string;
  body: string;
  status: string;
  supported: boolean;
  components?: {
    type: string;
    format?: string;
    text?: string;
    buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  }[];
};
function count(text = '') {
  return new Set(text.match(/\{\{\d+\}\}/g) ?? []).size;
}
export function validTemplateValue(def: ApprovedTemplate, value: TemplateValue) {
  if (count(def.body) !== value.bodyParams.length || value.bodyParams.some((v) => !v.trim()))
    return false;
  const h = def.components?.find((c) => c.type === 'HEADER');
  if (
    h?.format === 'TEXT' &&
    count(h.text) &&
    (value.header?.type !== 'text' || !value.header.text.trim())
  )
    return false;
  if (
    h &&
    ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format ?? '') &&
    (!value.header || value.header.type === 'text' || !/^https:\/\//.test(value.header.url))
  )
    return false;
  return (def.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? []).every(
    (b, index) =>
      !['QUICK_REPLY', 'URL'].includes(b.type) ||
      (b.type === 'URL' && !count(b.url)) ||
      !!value.buttonParams?.find((p) => p.index === index)?.value.trim(),
  );
}
export function TemplateParameters({
  definition,
  value,
  onChange,
}: {
  definition: ApprovedTemplate;
  value: TemplateValue;
  onChange: (v: TemplateValue) => void;
}) {
  const { t } = useLocale(),
    h = definition.components?.find((c) => c.type === 'HEADER');
  const buttons = definition.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  function button(index: number, type: 'quick_reply' | 'url', text: string) {
    onChange({
      ...value,
      buttonParams: [
        ...(value.buttonParams ?? []).filter((p) => p.index !== index),
        { index, type, value: text },
      ].sort((a, b) => a.index - b.index),
    });
  }
  return (
    <div className="stack">
      <p className="notice whitespace-pre-wrap">{definition.body}</p>
      <label className="field">
        {t('قيم القالب، قيمة في كل سطر', 'Template values, one per line')}
        <textarea
          value={value.bodyParams.join('\n')}
          onChange={(e) =>
            onChange({ ...value, bodyParams: e.target.value ? e.target.value.split('\n') : [] })
          }
          rows={Math.max(2, count(definition.body))}
        />
      </label>
      {h?.format === 'TEXT' &&
        (count(h.text) ? (
          <label className="field">
            {t('قيمة ترويسة القالب', 'Template header value')}
            <input
              maxLength={60}
              value={value.header?.type === 'text' ? value.header.text : ''}
              onChange={(e) =>
                onChange({ ...value, header: { type: 'text', text: e.target.value } })
              }
            />
          </label>
        ) : (
          <p>{h.text}</p>
        ))}
      {h && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format ?? '') && (
        <>
          <label className="field">
            {t('رابط وسائط ترويسة القالب', 'Template header media URL')} · {h.format}
            <input
              type="url"
              maxLength={2048}
              placeholder="https://"
              value={value.header && value.header.type !== 'text' ? value.header.url : ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  header: {
                    type: h.format!.toLowerCase() as 'image' | 'video' | 'document',
                    url: e.target.value,
                    ...(value.header?.type === 'document' && value.header.filename
                      ? { filename: value.header.filename }
                      : {}),
                  },
                })
              }
            />
          </label>
          {h.format === 'DOCUMENT' && (
            <label className="field">
              {t('اسم المستند الاختياري', 'Optional document filename')}
              <input
                maxLength={200}
                value={value.header?.type === 'document' ? (value.header.filename ?? '') : ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    header: {
                      type: 'document',
                      url: value.header && value.header.type !== 'text' ? value.header.url : '',
                      ...(e.target.value ? { filename: e.target.value } : {}),
                    },
                  })
                }
              />
            </label>
          )}
        </>
      )}
      {buttons.map((b, index) =>
        b.type === 'QUICK_REPLY' || (b.type === 'URL' && count(b.url)) ? (
          <label className="field" key={index}>
            {b.text} ·{' '}
            {b.type === 'QUICK_REPLY'
              ? t('معرّف الرد', 'Reply payload')
              : t('لاحقة الرابط', 'URL suffix')}
            <input
              maxLength={1024}
              value={value.buttonParams?.find((p) => p.index === index)?.value ?? ''}
              onChange={(e) =>
                button(index, b.type === 'QUICK_REPLY' ? 'quick_reply' : 'url', e.target.value)
              }
            />
          </label>
        ) : (
          <p key={index}>
            {b.text} · {b.url ?? b.phone_number}
          </p>
        ),
      )}
    </div>
  );
}
export function TemplatePreview({
  definition,
  value,
}: {
  definition?: ApprovedTemplate;
  value: TemplateValue;
}) {
  const { t } = useLocale();
  const h = definition?.components?.find((c) => c.type === 'HEADER');
  return (
    <div className="stack">
      {value.header?.type === 'text' ? (
        <strong>{h?.text?.replace('{{1}}', value.header.text) ?? value.header.text}</strong>
      ) : value.header ? (
        <p>
          {value.header.type} · {value.header.url}
          {value.header.filename ? ' · ' + value.header.filename : ''}
        </p>
      ) : h?.text ? (
        <strong>{h.text}</strong>
      ) : null}
      <p>
        {definition?.body.replace(
          /\{\{(\d+)\}\}/g,
          (m, n) => value.bodyParams[Number(n) - 1] || m,
        ) ?? value.name}
      </p>
      {definition?.components?.find((c) => c.type === 'FOOTER')?.text && (
        <p className="muted">{definition.components.find((c) => c.type === 'FOOTER')!.text}</p>
      )}
      {definition?.components
        ?.find((c) => c.type === 'BUTTONS')
        ?.buttons?.map((b, index) => (
          <p className="badge" key={index}>
            {b.text}
            {b.type === 'URL'
              ? ' · ' +
                b.url?.replace(
                  '{{1}}',
                  value.buttonParams?.find((p) => p.index === index)?.value ?? '{{1}}',
                )
              : ''}
          </p>
        ))}
      <small className="muted">
        {t(
          'معاينة المحتوى؛ قد يختلف شكل تطبيق المزود.',
          'Content preview; provider appearance may differ.',
        )}
      </small>
    </div>
  );
}
