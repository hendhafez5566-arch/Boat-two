'use client';
import { useEffect, useRef, useState } from 'react';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { Dialog } from '../product/ProductUI';
import { NavIcon } from '../product/NavIcon';
import { api } from '../../lib/api';
import styles from './settings-hub.module.css';
const groups = [
  { key: 'email-tab', ar: 'تكامل البريد', en: 'Email API', icon: 'mail', providers: ['email'] },
  { key: 'sms-tab', ar: 'تكامل SMS', en: 'SMS API', icon: 'inbox', providers: ['sms'] },
  {
    key: 'emailauto-tab',
    ar: 'تكامل الرد الآلي',
    en: 'Auto Responder API',
    icon: 'campaigns',
    providers: ['mailchimp', 'brevo', 'activecampaign', 'mautic'],
  },
  { key: 'salla-tab', ar: 'تكامل سلة', en: 'Salla API', icon: 'commerce', providers: ['salla'] },
];
const providerNames: Record<string, string> = {
  email: 'Email Gateway',
  sms: 'SMS Gateway',
  salla: 'Salla',
  mailchimp: 'Mailchimp',
  brevo: 'Brevo',
  activecampaign: 'ActiveCampaign',
  mautic: 'Mautic',
};
type Connection = {
  id: string;
  provider: string;
  name: string;
  enabled: boolean;
  status: string;
  config: { url?: string; listId?: string };
  updated_at: string;
};
export default function Integrations({onDraftState}:{onDraftState?:(dirty:boolean,busy:boolean)=>void}={}) {
  const { t } = useLocale();
  const [groupKey, setGroupKey] = useState('email-tab');
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get('action');
      setGroupKey(groups.some((g) => g.key === value) ? value! : 'email-tab');
      setPage(1);
      setSearch('');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const group = groups.find((g) => g.key === groupKey) || groups[0];
  const [provider, setProvider] = useState('email');
  const [editing, setEditing] = useState<Connection | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{onDraftState?.(open&&dirty,busy);},[open,dirty,busy,onDraftState]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),4000);return()=>clearTimeout(timer);},[feedback]);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState(5);
  const [page, setPage] = useState(1);
  const path='/integrations/index?'+new URLSearchParams({group:groupKey,q:search,page:String(page),limit:String(size)});
  const list=useData<{items:Connection[];total:number}>(path,{items:[],total:0});
  const ready=list.loadedPath===path&&!list.loading&&!list.error;
  const total=ready?list.data.total:0,pages=Math.max(1,Math.ceil(total/size)),current=page,rows=ready?list.data.items:[];
  useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
  const needsUrl = ['email', 'sms', 'activecampaign', 'mautic'].includes(provider);
  const needsList = ['mailchimp', 'brevo', 'activecampaign', 'mautic'].includes(provider);
  function selectGroup(key: string) {
    setGroupKey(key);
    setSearch('');
    setPage(1);
    setError('');
    setFeedback('');
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'integrations');
    url.searchParams.set('action', key);
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }
  function edit(connection: Connection | null) {
    if(lock.current)return;
    setDirty(false);setEditing(connection);
    setProvider(connection?.provider || group.providers[0]);
    setFormError('');
    setOpen(true);
  }
  async function change(connection: Connection) {
    if(lock.current||!window.confirm(connection.enabled?t('تعطيل ملف الربط قد يوقف إجراءات مرتبطة به. متابعة؟','Disabling may interrupt linked actions. Continue?'):t('تفعيل ملف الربط؟','Enable integration profile?')))return;
    lock.current = true;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await api(`/integrations/${connection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !connection.enabled }),
      });
      setFeedback(connection.enabled
        ? t('تم إيقاف ملف الربط.', 'Integration profile disabled.')
        : t('تم تفعيل ملف الربط.', 'Integration profile enabled.'));
      await list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function disconnect(connection:Connection){
    if(lock.current||!window.confirm(t('فصل ملف الربط وحذف مفتاحه المحفوظ؟ ستحتاج إلى مفتاح جديد لإعادة الربط. لا يلغي ذلك المفتاح لدى المزود.','Disconnect and remove the stored key? Reconnection requires a new key. This does not revoke the key at the provider.')))return;
    lock.current=true;setBusy(true);setError('');setFeedback('');
    try{await api('/integrations/'+connection.id+'/disconnect',{method:'POST'});setFeedback(t('تم فصل ملف الربط.','Integration profile disconnected.'));await list.reload();}
    catch(e){setError((e as Error).message);}
    finally{lock.current=false;setBusy(false);}
  }
  const statusLabel=(status:string)=>({pending:t('بانتظار التحقق','Pending verification'),connected:t('متصل','Connected'),active:t('نشط','Active'),error:t('خطأ','Error'),disconnected:t('غير متصل','Disconnected')} as Record<string,string>)[status]||status;
  return (
    <div className={styles.security}>
      <nav
        className={styles.subnav}
        role="tablist"
        aria-label={t('أنواع التكاملات', 'Integration types')}
      >
        {groups.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={groupKey === g.key}
            aria-controls="integration-profiles"
            id={`integration-${g.key}`}
            disabled={busy} onClick={() => selectGroup(g.key)}
          >
            <NavIcon name={g.icon} />
            {t(g.ar, g.en)}
            <small>{t('التكاملات', 'Integration')}</small>
          </button>
        ))}
      </nav>
      <section
        className={styles.panel}
        role="tabpanel"
        id="integration-profiles"
        aria-labelledby={`integration-${group.key}`}
      >
        <div className={styles.profileHeading}>
          <h1>{t(group.ar, group.en)}</h1>
          <button type="button" className="btn" disabled={busy||list.loading||!!list.error} onClick={() => edit(null)}>
            <NavIcon name="plus"/>{t('جديد', 'New')}
          </button>
        </div>
        {(error || list.error) && (
          <p className="notice error" role="alert">
            {error || list.error} {list.error&&<button className="btn" onClick={()=>void list.reload()}>{t('إعادة المحاولة','Retry')}</button>}
          </p>
        )}
        {feedback && <p role="status" className="notice">{feedback}</p>}
        <div className={styles.tools}>
          <input
            type="search"
            aria-label={t('البحث بملفات الربط', 'Search profiles')}
            disabled={busy} maxLength={100} value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button className="btn" disabled={busy||!search} onClick={()=>{setSearch('');setPage(1);}}>{t('مسح البحث','Clear search')}</button><button className="btn" disabled={busy||list.loading} onClick={()=>void list.reload()}>{t('تحديث','Refresh')}</button>
        </div>
        <div className={styles.tablewrap}>
          <table className={`${styles.table} ${styles.profilesTable}`}>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('اسم الملف', 'Profile Name')}</th>
                <th>{t('اسم API', 'API Name')}</th>
                <th>{t('الإجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {ready&&rows.map((c, index) => (
                <tr key={c.id}>
                  <td>{(current - 1) * size + index + 1}</td>
                  <td>{c.name}<small> · {c.id.slice(0,8)}</small><br/><small>{c.enabled?t('مفعّل','Enabled'):t('متوقف','Disabled')} · {statusLabel(c.status)}</small></td>
                  <td>{providerNames[c.provider]}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" className="btn" disabled={busy} onClick={() => edit(c)}>
                        <NavIcon name={c.status==='disconnected'?'refresh':'edit'}/>{c.status==='disconnected'?t('إعادة الربط','Reconnect'):t('تعديل', 'Edit')}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || c.status === 'disconnected'}
                        onClick={() => void change(c)}
                      >
                        <NavIcon name={c.enabled?'pause':'play'}/>{c.enabled ? t('تعطيل', 'Disable') : t('تفعيل', 'Enable')}
                      </button>
                      {c.status!=='disconnected'&&<button type="button" className="btn btn-danger" disabled={busy} onClick={()=>void disconnect(c)}><NavIcon name="blocked"/>{t('فصل الربط','Disconnect')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {(!ready||!rows.length) && (
                <tr>
                  <td colSpan={4} className={styles.emptyProfiles}>
                    {!ready&&!list.error
                      ? t('جارٍ التحميل…', 'Loading…')
                      : list.error?t('تعذر تحميل الملفات','Unable to load profiles'):t('لا توجد بيانات في الجدول', 'No data available in table')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.footer}>
          <select
            aria-label={t('عدد الصفوف', 'Rows per page')}
            disabled={busy} value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[5, 10, 20, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <span>
            {total ? (current - 1) * size + 1 : 0}–
            {Math.min(current * size, total)} {t('من', 'of')} {total}
          </span>
          <div>
            <button
              type="button"
              className="btn"
              disabled={busy||!ready||current === 1}
              onClick={() => setPage(current - 1)}
            >
              {t('السابق', 'Previous')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy||!ready||current >= pages}
              onClick={() => setPage(current + 1)}
            >
              {t('التالي', 'Next')}
            </button>
          </div>
        </footer>
      </section>
      <Dialog
        open={open}
        title={t(group.ar, group.en)}
        className={styles.integrationDialog}
        onClose={() => {
          if(!lock.current&&(!dirty||window.confirm(t('تجاهل بيانات الربط غير المحفوظة؟','Discard unsaved integration changes?')))){setDirty(false);setOpen(false);}
        }}
      >
        {open && (
          <form
            key={editing?.id || 'new'} onChange={()=>setDirty(true)}
            onSubmit={async (event) => {
              event.preventDefault();
              if(lock.current||!dirty)return;
              const values = new FormData(event.currentTarget);
              const credential = String(values.get('credential') || '');
              if(!String(values.get('name')||'').trim()){setFormError(t('أدخل اسم الملف','Enter profile name'));return;}
              if(needsUrl){try{const u=new URL(String(values.get('url')||''));if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{setFormError(t('أدخل عنوان HTTPS بدون بيانات دخول','Use HTTPS without embedded credentials'));return;}}
              if(editing&&credential&&!window.confirm(t('استبدال مفتاح الربط الحالي؟','Replace the current integration key?')))return;
              const config={
                ...(needsUrl ? {url:String(values.get('url')||'').trim()} : {}),
                ...(needsList ? {listId:String(values.get('listId')||'').trim()} : {}),
              };
              const changedConfig=!editing||(needsUrl&&config.url!==editing.config.url)||(needsList&&config.listId!==editing.config.listId);
              const body={
                name:String(values.get('name')||'').trim(),
                ...(credential?{credential}:{}),
                ...(changedConfig?{config}:{}),
              };
              lock.current = true;
              setBusy(true);
              setFormError('');
              setFeedback('');
              try {
                await api(editing ? `/integrations/${editing.id}` : '/integrations', {
                  method: editing ? 'PATCH' : 'POST',
                  body: JSON.stringify(editing ? body : { ...body, provider }),
                });
                setDirty(false);setOpen(false);
                setFeedback(t('تم حفظ ملف الربط.', 'Integration profile saved.'));
                await list.reload();
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <div className={styles.integrationForm}>
              <fieldset disabled={busy} className={styles.profileFields}>
                {formError && (
                  <p role="alert" className="notice error">
                    {formError}
                  </p>
                )}
                <label className="field">
                  {t('اسم الملف', 'Profile Name')} *
                  <input name="name" required maxLength={100} defaultValue={editing?.name} />
                </label>
                <label className="field">
                  {provider === 'mautic'
                    ? t('اسم المستخدم:كلمة المرور', 'Username:password')
                    : t('مفتاح API', 'API Key')}
                  {!editing && ' *'}
                  <input
                    name="credential"
                    type="password"
                    autoComplete="new-password"
                    required={!editing||editing.status==='disconnected'}
                    maxLength={4000}
                  />
                  {editing && (
                    <small>
                      {t(
                        editing.status==='disconnected'?'أدخل مفتاحًا جديدًا لإعادة الربط.':'اتركه فارغًا للاحتفاظ بالمفتاح الحالي.',
                        editing.status==='disconnected'?'Enter a new key to reconnect.':'Leave empty to keep the current key.',
                      )}
                    </small>
                  )}
                </label>
                {needsUrl && (
                  <label className="field">
                    {t('عنوان HTTPS', 'HTTPS URL')} *
                    <input
                      type="url"
                      name="url"
                      dir="ltr"
                      required
                      pattern="https://.*"
                      defaultValue={editing?.config.url}
                    />
                  </label>
                )}
                {needsList && (
                  <label className="field">
                    {t('معرف القائمة', 'List ID')} *
                    <input
                      name="listId"
                      required
                      maxLength={200}
                      defaultValue={editing?.config.listId}
                    />
                  </label>
                )}
              </fieldset>
              <nav className={styles.providerNav} aria-label={t('مزود API', 'API provider')}>
                {group.providers.map((p) => (
                  <button
                    type="button"
                    key={p}
                    disabled={busy || !!editing}
                    aria-pressed={provider === p}
                    onClick={() => {if(p!==provider){if(dirty&&!window.confirm(t('تغيير المزود؟ راجع بيانات المفتاح قبل الحفظ.','Change provider? Review the credential before saving.')))return;const credential=document.querySelector<HTMLInputElement>('dialog[open] input[name=credential]');if(credential)credential.value='';setProvider(p);setDirty(true);}}}
                  >
                    {providerNames[p]}
                  </button>
                ))}
              </nav>
            </div>
            <footer className={styles.profileSave}>
              <button className="btn btn-primary" disabled={busy||!dirty}>
                <NavIcon name="check"/>{t('حفظ', 'Save')}
              </button>
            </footer>
          </form>
        )}
      </Dialog>
    </div>
  );
}
