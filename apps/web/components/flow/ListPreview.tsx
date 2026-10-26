'use client';
import { useState } from 'react';
import { ConfigDisclosure, ConfigSummary } from './ConfigDisclosure';
import { useLocale } from '../product/locale';
type List = {
  buttonText?: string;
  sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
};
export default function ListPreview({
  list,
  onSelect,
  disabled = false,
}: {
  list: List;
  onSelect?: (title: string, id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const overLimit = list.sections.reduce((sum, section) => sum + section.rows.length, 0) > 10;
  return (
    <ConfigDisclosure
      expanded={expanded}
      onExpandedChange={setExpanded}
      className="nodrag nopan rounded border p-2 mt-2"
    >
      <ConfigSummary>{list.buttonText || t('عرض القائمة', 'View list')}</ConfigSummary>
      <small>
        {t(
          'قد يختلف شكل القائمة حسب القناة. الحد الأقصى ١٠ خيارات.',
          'Appearance depends on the channel. Maximum 10 options.',
        )}
      </small>
      {overLimit && (
        <p role="alert">
          {t(
            'قلّل القائمة إلى ١٠ خيارات قبل الإرسال.',
            'Reduce the list to 10 options before sending.',
          )}
        </p>
      )}
      {list.sections.map((section, index) => (
        <section key={index} className="stack mt-2">
          {section.title && <h4>{section.title}</h4>}
          {section.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="btn text-start"
              disabled={disabled || !onSelect || overLimit}
              onClick={() => {
                onSelect?.(row.title, row.id);
                setExpanded(false);
              }}
            >
              <span>
                <strong>{row.title}</strong>
                {row.description && <small className="block">{row.description}</small>}
              </span>
            </button>
          ))}
        </section>
      ))}
    </ConfigDisclosure>
  );
}
