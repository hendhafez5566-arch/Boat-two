'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import {
  ApprovedTemplate,
  TemplateParameters,
  TemplatePreview,
  TemplateValue,
} from './TemplateParameters';

export function ApprovedTemplatePicker({
  channelIds,
  value,
  onChange,
  source,
  onValid,
}: {
  channelIds: string[];
  value: TemplateValue;
  onChange: (next: TemplateValue) => void;
  source?: string;
  onValid?: (valid: boolean) => void;
}) {
  const { t } = useLocale();
  const scope = channelIds.join(',');
  const [result, setResult] = useState<{
    key: string;
    items: ApprovedTemplate[];
    failed?: boolean;
  }>();
  const key = source || scope;
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const paths = source
      ? [source]
      : scope.split(',').map((id) => '/channels/' + id + '/templates');
    Promise.all(paths.map((path) => api<ApprovedTemplate[]>(path, { signal: controller.signal })))
      .then((lists) => {
        const signature = (item: ApprovedTemplate) =>
          JSON.stringify([item.name, item.language, item.body, item.components ?? []]);
        const eligible = lists.map((list) =>
          list.filter((item) => item.status === 'APPROVED' && item.supported),
        );
        if (!controller.signal.aborted)
          setResult({
            key,
            items: eligible[0].filter((item) =>
              eligible.every((list) => list.some((entry) => signature(entry) === signature(item))),
            ),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, items: [], failed: true });
      });
    return () => controller.abort();
  }, [key, scope, source]);
  const state = result?.key === key ? result : undefined;
  const item = state?.items.find(
    (option) => option.name === value.name && option.language === value.language,
  );
  const valid = !!item;
  useEffect(() => {
    onValid?.(valid);
  }, [onValid, valid]);
  if (!key)
    return <p role="status">{t('حدد قناة واتساب أولًا.', 'Select a WhatsApp channel first.')}</p>;
  if (!state)
    return <p role="status">{t('جارٍ تحميل القوالب المعتمدة…', 'Loading approved templates…')}</p>;
  if (state.failed)
    return (
      <p role="alert">
        {t(
          'تعذّر تحميل القوالب المعتمدة لهذه القنوات.',
          'Could not load approved templates for these channels.',
        )}
      </p>
    );
  return (
    <div className="stack">
      <label className="field">
        {t('قالب واتساب معتمد', 'Approved WhatsApp template')}
        <select
          value={item ? item.name + '|' + item.language : ''}
          onChange={(event) => {
            const selected = state.items.find(
              (option) => option.name + '|' + option.language === event.target.value,
            );
            onChange({
              name: selected?.name ?? '',
              language: selected?.language ?? '',
              bodyParams: [],
            });
          }}
        >
          <option value="">{t('اختر قالبًا', 'Choose a template')}</option>
          {state.items.map((option) => (
            <option
              key={option.name + '|' + option.language}
              value={option.name + '|' + option.language}
            >
              {option.name} · {option.language}
            </option>
          ))}
        </select>
      </label>
      {!item && value.name && (
        <p role="alert">
          {t(
            'القالب المحفوظ غير متاح أو غير معتمد على القناة.',
            'The saved template is unavailable or unapproved for this channel.',
          )}
        </p>
      )}
      {!state.items.length && (
        <p>
          {t(
            'لا توجد قوالب معتمدة متوافقة مع القنوات المحددة.',
            'No approved templates are compatible with the selected channels.',
          )}
        </p>
      )}
      {item && (
        <>
          <TemplateParameters definition={item} value={value} onChange={onChange} bindings />
          <section className="card" aria-label={t('معاينة القالب', 'Template preview')}>
            <TemplatePreview definition={item} value={value} />
          </section>
        </>
      )}
    </div>
  );
}
