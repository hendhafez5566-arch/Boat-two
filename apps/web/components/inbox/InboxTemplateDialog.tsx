'use client';

import Link from 'next/link';
import {NavIcon} from '../product/NavIcon';
import styles from './inbox-dialogs.module.css';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { Dialog } from '../product/ProductUI';
import { useLocale } from '../product/locale';

type ReplyTemplate = { id: string; name: string; language: string; body: string; footer?: string };

export function InboxTemplateDialog({
  conversationId,
  close,
  manageHref,
}: {
  conversationId: string;
  close: () => void;
  manageHref?: string;
}) {
  const { t } = useLocale();
  const path = '/conversations/' + conversationId;
  const options = useData<{
    templates: ReplyTemplate[];
    deliveryEnabled: boolean;
    fields: Record<string, string | undefined>;
  }>(path + '/templates', {
    templates: [],
    fields: {},
    deliveryEnabled: false,
  });
  const [id, setId] = useState('');
  const [search,setSearch]=useState('');
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
  const fields = options.data.fields ?? {};
  const resolve = (value: string | undefined) => {
    const key = /^\{\{([a-z.]+)\}\}$/.exec(value?.trim() ?? '')?.[1];
    return key ? fields[key]?.trim() : value?.trim();
  };
  const preview = selected?.body.replace(
    /\{\{(\d+)\}\}/g,
    (token, index) => resolve(values[Number(index)]) || token,
  );
  const complete =
    !!selected && indices.every((index, i) => index === i + 1 && resolve(values[index]));
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
      open className={styles.dialog}
      onClose={() => {
        if (!busy) close();
      }}
      title={t('قالب واتساب معتمد', 'Approved WhatsApp template')}
    >
      <div className={styles.content}><div className={styles.intro}><span className={styles.brand}><NavIcon name="whatsapp"/></span><div><strong>{t('القوالب المعتمدة لهذه القناة','Approved templates for this channel')}</strong><small>{t('اختر القالب وراجع محتواه قبل الإرسال.','Choose a template and review its contents before sending.')}</small></div></div>
        {!options.loading&&!options.error&&!options.data.deliveryEnabled&&<div className={styles.warning} role="status"><NavIcon name="flag"/><div><strong>{t('وضع المعاينة فقط','Preview only')}</strong><p>{t('إرسال القوالب غير مفعّل في هذه البيئة. لا يتم إرسال أي رسالة من هذه النافذة حاليًا.','Template delivery is disabled in this environment. No message can be sent from this dialog right now.')}</p></div></div>}
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
            {options.data.templates.length>5&&<label className="field">{t('بحث القوالب','Search templates')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('اسم القالب أو محتواه…','Template name or content…')} disabled={busy}/></label>}
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
                {options.data.templates.filter(item=>item.id===id||[item.name,item.body,item.language].join(' ').toLowerCase().includes(search.trim().toLowerCase())).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.language}
                  </option>
                ))}
              </select>
            </label>
            {indices.map((index) => (
              <div key={index} className={styles.variableRow}>
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
                <label className="field">
                  {t('ربط بحقل', 'Bind field')} {index}
                  <select
                    disabled={busy}
                    value={/^\{\{[a-z.]+\}\}$/.test(values[index] ?? '') ? values[index] : ''}
                    onChange={(event) => {
                      setValues({ ...values, [index]: event.target.value });
                      setReview(false);
                    }}
                  >
                    <option value="">{t('قيمة ثابتة', 'Literal value')}</option>
                    <option value="{{contact.name}}">{t('اسم العميل', 'Contact name')}</option>
                    <option value="{{order.id}}">{t('رقم الطلب', 'Order ID')}</option>
                    <option value="{{order.status}}">{t('حالة الطلب', 'Order status')}</option>
                  </select>
                </label>
                {values[index] && !resolve(values[index]) && (
                  <p role="status">
                    {t(
                      'قيمة الحقل غير متاحة لهذه المحادثة.',
                      'This field is unavailable for this conversation.',
                    )}
                  </p>
                )}
              </div>
            ))}
            {selected && (
              <div className={styles.preview} aria-label={t('معاينة الرسالة', 'Message preview')}><header><NavIcon name="whatsapp"/>{t('معاينة الرسالة','Message preview')}</header><div className={styles.bubble}>
                <p dir="auto" className="whitespace-pre-wrap">
                  {preview}
                </p>
                {selected.footer && <small dir="auto">{selected.footer}</small>}</div>
              </div>
            )}
            {options.data.deliveryEnabled &&
              (review ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !complete}
                  onClick={() => void send()}
                >
                  <NavIcon name="delivery"/>{busy?t('جارٍ الإرسال…','Sending…'):t('تأكيد إرسال القالب', 'Confirm template send')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!complete}
                  onClick={() => setReview(true)}
                >
                  <NavIcon name="eye"/>{t('مراجعة الإرسال للعميل', 'Review customer delivery')}
                </button>
              ))}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer className={styles.footer}>{manageHref&&<Link className="btn" href={manageHref}><NavIcon name="settings"/>{t('إدارة قوالب واتساب','Manage WhatsApp templates')}</Link>}<button type="button" className="btn" disabled={busy} onClick={close}><NavIcon name="close"/>{t('إغلاق','Close')}</button></footer>
    </Dialog>
  );
}
