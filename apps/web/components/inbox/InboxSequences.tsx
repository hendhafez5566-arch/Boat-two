'use client';
import { useEffect,useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import styles from './inbox-customer-panel.module.css';
type Enrollment = { id: string; name: string; status: string; next_run_at?: string };
type Sequence = { id: string; name: string; status: string; channel_id: string };
export function InboxSequences({
  contactId,
  channelId,
  assigned,
  canManage,
  onSaved,
}: {
  contactId: string;
  channelId: string;
  assigned: Enrollment[];
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const { t, language } = useLocale();
  const [query,setQuery]=useState('');
  const path=canManage?'/sequence-center?'+new URLSearchParams({channelId,status:'active',q:query,limit:'100'}):null;
  const sequences=useData<{items:Sequence[];total:number}>(path,{items:[],total:0});
  const ready=!!path&&sequences.loadedPath===path&&!sequences.loading&&!sequences.error;
  const [notice,setNotice]=useState('');
  useEffect(()=>{setSelected('');setNotice('');setError('');},[contactId,channelId,query]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const choices = (ready?sequences.data.items:[]).filter(
    (seq) =>
      seq.channel_id === channelId &&
      seq.status === 'active' &&
      !assigned.some((row) => row.id === seq.id && row.status === 'active'),
  );
  async function change(id: string, stop: boolean) {
    if (!canManage || lock.current || !id) return;
    if(!stop&&!choices.some(x=>x.id===id))return;
    if(!window.confirm(stop?t('إيقاف التسلسل لهذا العميل؟','Stop this sequence for the customer?'):t('تأكيد إضافة العميل للتسلسل؟','Assign this sequence to the customer?')))return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(stop ? `/sequences/${id}/enrollments/${contactId}` : `/sequences/${id}/enroll`, {
        method: stop ? 'DELETE' : 'POST',
        ...(stop ? {} : { body: JSON.stringify({ contactId }) }),
      });
      setSelected('');
      await onSaved();
      setNotice(stop?t('تم إيقاف التسلسل','Sequence stopped'):t('تم تحديث التعيين','Assignment updated'));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const status = (value: string) =>
    ({
      active: t('نشط', 'Active'),
      stopped: t('متوقف', 'Stopped'),
      completed: t('مكتمل', 'Completed'),
    })[value] || value;
  return (
    <div className={styles.sequenceControl}>
      <span>{t('تسلسل الرسائل', 'Message Sequence')}</span>
      {error || sequences.error ? <p role="alert">{error || sequences.error} {sequences.error&&<button type="button" disabled={busy||sequences.loading} onClick={()=>void sequences.reload()}>{t("إعادة المحاولة","Retry")}</button>}</p> : null}
      {notice&&<p role="status">{notice}</p>}
      {assigned.length ? (
        <ul className={styles.enrollments}>
          {assigned.map((row) => (
            <li key={row.id}>
              <span>
                {row.name}
                <small>
                  {status(row.status)}
                  {row.status === 'active' && row.next_run_at
                    ? ` · ${new Date(row.next_run_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}`
                    : ''}
                </small>
              </span>
              {canManage && row.status === 'active' && (
                <button
                  type="button"
                  className={styles.inlineEdit}
                  disabled={busy}
                  onClick={() => void change(row.id, true)}
                  aria-label={`${t('إيقاف التسلسل', 'Stop sequence')} ${row.name}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <small>{t('لا توجد تسلسلات', 'No sequences assigned')}</small>
      )}
      {canManage && (
        <>
          <input type="search" aria-label={t("بحث التسلسلات","Search sequences")} maxLength={100} value={query} disabled={busy} onChange={e=>setQuery(e.target.value)}/>
          {ready&&sequences.data.total>100&&<small>{t("ضيّق البحث لعرض نتائج أكثر تحديدًا.","Refine search to find more specific results.")}</small>}
          <select
            data-inbox-target="sequence"
            aria-label={t('اختيار تسلسل رسائل', 'Select message sequence')}
            value={selected}
            disabled={busy || sequences.loading || !choices.length}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">
              {sequences.loading
                ? t('جارٍ التحميل…', 'Loading…')
                : !choices.length
                  ? t('لا توجد تسلسلات نشطة لهذه القناة', 'No active sequences for this channel')
                  : t('اختر تسلسلًا', 'Select sequence')}
            </option>
            {choices.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <small>
                {t(
                  'إضافة العميل تبدأ رسائل التسلسل حسب مواعيده.',
                  'Adding this customer starts sequence messages according to its schedule.',
                )}
              </small>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => void change(selected, false)}
              >
                {t('إضافة إلى التسلسل', 'Add to sequence')}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
