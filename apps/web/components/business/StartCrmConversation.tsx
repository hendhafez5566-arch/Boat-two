'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import { useData } from './useData';

type Option = {
  channel_id: string;
  channel_name: string;
  name: string;
  language: string;
  body: string;
};

export function StartCrmConversation({ contactId }: { contactId: string }) {
  const { t } = useLocale();
  const endpoint = '/crm/contacts/' + contactId;
  const [open, setOpen] = useState(false);
  const options = useData<Option[]>(open ? endpoint + '/conversation-options' : null, []);
  const [selected, setSelected] = useState('');
  const [conversation, setConversation] = useState<{
    id: string;
    channel_id: string;
    started: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const key = (option: Option) => [option.channel_id, option.name, option.language].join(':');
  const option = options.data.find((item) => key(item) === selected);

  if (conversation)
    return (
      <div>
        <p role="status">
          {conversation.started
            ? t('تمت جدولة الرسالة الأولى.', 'First message queued.')
            : t('المحادثة موجودة بالفعل.', 'Conversation already exists.')}
        </p>
        <Link
          href={`/dashboard/inbox?conversation=${conversation.id}&channelId=${conversation.channel_id}`}
        >
          {t('فتح المحادثة', 'Open conversation')}
        </Link>
      </div>
    );
  if (!open)
    return <Button onClick={() => setOpen(true)}>{t('بدء محادثة', 'Start conversation')}</Button>;
  return (
    <div>
      {options.loading && <p role="status">{t('جارٍ تحميل القوالب…', 'Loading templates…')}</p>}
      {(error || options.error) && <p role="alert">{error || options.error}</p>}
      {!options.loading && !options.error && !options.data.length && (
        <p>
          {t(
            'لا يوجد قالب صالح على قناة وافق عليها العميل.',
            'No eligible template on a channel the customer opted into.',
          )}
        </p>
      )}
      {options.data.length > 0 && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!option || pending.current) return;
            if (
              !window.confirm(
                t(
                  'إرسال هذا القالب للعميل عبر واتساب؟',
                  'Send this template to the customer on WhatsApp?',
                ),
              )
            )
              return;
            pending.current = true;
            setBusy(true);
            setError('');
            try {
              setConversation(
                await api(endpoint + '/start-conversation', {
                  method: 'POST',
                  body: JSON.stringify({
                    channelId: option.channel_id,
                    name: option.name,
                    language: option.language,
                  }),
                }),
              );
            } catch (err) {
              setError((err as Error).message);
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          <label className="field">
            {t('قناة واتساب والقالب', 'WhatsApp channel and template')}
            <select
              value={selected}
              disabled={busy}
              onChange={(event) => setSelected(event.currentTarget.value)}
            >
              <option value="">{t('اختر القالب', 'Choose template')}</option>
              {options.data.map((item) => (
                <option key={key(item)} value={key(item)}>
                  {item.channel_name} · {item.name} ({item.language})
                </option>
              ))}
            </select>
          </label>
          {option && <p>{option.body}</p>}
          <Button type="submit" variant="primary" busy={busy} disabled={!option}>
            {t('إرسال القالب', 'Send template')}
          </Button>
        </form>
      )}
      <Button
        onClick={() => {
          setError('');
          setSelected('');
          setOpen(false);
        }}
        disabled={busy}
      >
        {t('إلغاء', 'Cancel')}
      </Button>
    </div>
  );
}
