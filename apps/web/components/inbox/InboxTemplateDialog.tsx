'use client';

import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { Dialog } from '../product/ProductUI';
import { useLocale } from '../product/locale';

type ReplyTemplate = { id: string; name: string; language: string; body: string; footer?: string };

export function InboxTemplateDialog({
  conversationId,
  contactName,
  close,
}: {
  conversationId: string;
  contactName: string;
  close: () => void;
}) {
  const { t } = useLocale();
  const path = '/conversations/' + conversationId;
  const options = useData<{ templates: ReplyTemplate[]; deliveryEnabled: boolean }>(
    path + '/templates',
    {
      templates: [],
      deliveryEnabled: false,
    },
  );
  const [id, setId] = useState('');
  const [values, setValues] = useState<Record<number, string>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const selected = options.data.templates.find((item) => item.id === id);
  const indices = [
    ...new Set(
      [...(selected?.body.matchAll(/\{\{(\d+)\}\}/g) ?? [])].map((match) => Number(match[1])),
    ),
  ].sort((a, b) => a - b);
  const preview = selected?.body.replace(
    /\{\{(\d+)\}\}/g,
    (token, index) => values[Number(index)]?.trim() || token,
  );
  const complete =
    !!selected && indices.every((index, i) => index === i + 1 && values[index]?.trim());
  async function send() {
    if (!selected || !review || !complete || !options.data.deliveryEnabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(path + '/messages', {
        method: 'POST',
        body: JSON.stringify({
          template: {
            name: selected.name,
            language: selected.language,
            bodyParams: indices.map((index) => values[index].trim()),
          },
        }),
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={t('قالب واتساب معتمد', 'Approved WhatsApp template')}
    >
      <div className="stack">
        {options.loading && <p role="status">{t('جارٍ تحميل القوالب…', 'Loading templates…')}</p>}
        {options.error && <p role="alert">{options.error}</p>}
        {!options.loading && !options.error && !options.data.templates.length && (
          <p>
            {t(
              'لا توجد قوالب نصية معتمدة لهذه القناة.',
              'No approved text templates for this channel.',
            )}
          </p>
        )}
        {!!options.data.templates.length && (
          <>
            <label className="field">
              {t('اختيار القالب', 'Choose template')}
              <select
                value={id}
                disabled={busy}
                onChange={(event) => {
                  setId(event.target.value);
                  setValues({});
                  setReview(false);
                }}
              >
                <option value="">{t('اختر قالبًا', 'Select a template')}</option>
                {options.data.templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.language}
                  </option>
                ))}
              </select>
            </label>
            {indices.map((index) => (
              <div key={index}>
                <label className="field">
                  {t('متغير', 'Variable')} {index}
                  <input
                    maxLength={1024}
                    disabled={busy}
                    value={values[index] || ''}
                    onChange={(event) => {
                      setValues({ ...values, [index]: event.target.value });
                      setReview(false);
                    }}
                  />
                </label>
                {contactName.trim() && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setValues({ ...values, [index]: contactName.trim().slice(0, 1024) });
                      setReview(false);
                    }}
                  >
                    {t('استخدم اسم العميل الحالي', 'Use current contact name')}
                  </button>
                )}
              </div>
            ))}
            {selected && (
              <div className="card" aria-label={t('معاينة الرسالة', 'Message preview')}>
                <p dir="auto" className="whitespace-pre-wrap">
                  {preview}
                </p>
                {selected.footer && <small dir="auto">{selected.footer}</small>}
              </div>
            )}
            {!options.data.deliveryEnabled && (
              <p role="status">
                {t(
                  'المعاينة متاحة. إرسال القوالب متوقف في هذه البيئة.',
                  'Preview is available. Template delivery is disabled in this environment.',
                )}
              </p>
            )}
            {options.data.deliveryEnabled &&
              (review ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !complete}
                  onClick={() => void send()}
                >
                  {t('تأكيد إرسال القالب', 'Confirm template send')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!complete}
                  onClick={() => setReview(true)}
                >
                  {t('مراجعة الإرسال للعميل', 'Review customer delivery')}
                </button>
              ))}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
