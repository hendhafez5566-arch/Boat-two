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
  if (def.status !== 'APPROVED' || !def.supported || def.name !== value.name || def.language !== value.language)
    return false;
  if (value.bodyParams.some((v) => /\{\{|\}\}/.test(v) && !/^\{\{\s*(contact\.name|order\.(id|status))\s*\}\}$/.test(v.trim())))
    return false;
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
  bindings = false,
}: {
  definition: ApprovedTemplate;
  value: TemplateValue;
  onChange: (v: TemplateValue) => void;
  bindings?: boolean;
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
      {Array.from({ length: count(definition.body) }, (_, index) => {
        const raw = value.bodyParams[index] ?? '';
        const fields = [
          ['{{contact.name}}', t('اسم العميل', 'Contact name')],
          ['{{order.id}}', t('رقم الطلب المرتبط بالمحادثة', 'Order ID linked to the conversation')],
          [
            '{{order.status}}',
            t('حالة الطلب المرتبط بالمحادثة', 'Order status linked to the conversation'),
          ],
        ];
        const currentBinding = bindings && fields.some(([key]) => key === raw) ? raw : '';
        const update = (text: string) => {
          const bodyParams = Array.from({ length: count(definition.body) }, (_, i) =>
            i === index ? text : (value.bodyParams[i] ?? ''),
          );
          onChange({ ...value, bodyParams });
        };
        return (
          <div className="stack" key={index}>
            {bindings && (
              <label className="field">
                {t('مصدر المتغير', 'Variable source')} {index + 1}
                <select value={currentBinding} onChange={(event) => update(event.target.value)}>
                  <option value="">{t('قيمة ثابتة', 'Literal value')}</option>
                  {fields.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!currentBinding && (
              <label className="field">
                {t('قيمة المتغير', 'Variable value')} {index + 1}
                <input
                  value={raw}
                  maxLength={1024}
                  onChange={(event) => update(event.target.value)}
                />
              </label>
            )}
          </div>
        );
      })}
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
          (m, n) =>
            (
              ({
                '{{contact.name}}': t('[اسم العميل]', '[Contact name]'),
                '{{order.id}}': t('[رقم الطلب]', '[Order ID]'),
                '{{order.status}}': t('[حالة الطلب]', '[Order status]'),
              }) as Record<string, string>
            )[value.bodyParams[Number(n) - 1]] ||
            value.bodyParams[Number(n) - 1] ||
            m,
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
