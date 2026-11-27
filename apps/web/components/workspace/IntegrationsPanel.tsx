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
  const list = useData<Connection[]>('/integrations', []);
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
  const filtered = list.data.filter(
    (c) =>
      group.providers.includes(c.provider) &&
      (c.name + ' ' + providerNames[c.provider])
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * size, current * size);
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
            ＋ {t('جديد', 'New')}
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
            maxLength={100} value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button className="btn" disabled={!search} onClick={()=>{setSearch('');setPage(1);}}>{t('مسح البحث','Clear search')}</button><button className="btn" disabled={busy||list.loading} onClick={()=>void list.reload()}>{t('تحديث','Refresh')}</button>
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
              {!list.loading&&!list.error&&rows.map((c, index) => (
                <tr key={c.id}>
                  <td>{(current - 1) * size + index + 1}</td>
                  <td>{c.name}<small> · {c.id.slice(0,8)}</small><br/><small>{c.enabled?t('مفعّل','Enabled'):t('متوقف','Disabled')} · {c.status}</small></td>
                  <td>{providerNames[c.provider]}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" className="btn" disabled={busy} onClick={() => edit(c)}>
                        {t('تعديل', 'Edit')}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || c.status === 'disconnected'}
                        onClick={() => void change(c)}
                      >
                        {c.enabled ? t('تعطيل', 'Disable') : t('تفعيل', 'Enable')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(list.loading||!!list.error||!rows.length) && (
                <tr>
                  <td colSpan={4} className={styles.emptyProfiles}>
                    {list.loading
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
            value={size}
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
            {filtered.length ? (current - 1) * size + 1 : 0}–
            {Math.min(current * size, filtered.length)} {t('من', 'of')} {filtered.length}
          </span>
          <div>
            <button
              type="button"
              className="btn"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              {t('السابق', 'Previous')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={current === pages}
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
              const body = {
                name: String(values.get('name')||'').trim(),
                ...(credential ? { credential } : {}),
                config: {
                  ...(needsUrl ? { url: values.get('url') } : {}),
                  ...(needsList ? { listId: values.get('listId') } : {}),
                },
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
                    required={!editing}
                    maxLength={4000}
                  />
                  {editing && (
                    <small>
                      {t(
                        'اتركه فارغًا للاحتفاظ بالمفتاح الحالي.',
                        'Leave empty to keep the current key.',
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
                    onClick={() => {if(p!==provider){if(dirty&&!window.confirm(t('تغيير المزود؟ راجع بيانات المفتاح قبل الحفظ.','Change provider? Review the credential before saving.')))return;setProvider(p);setDirty(true);}}}
                  >
                    {providerNames[p]}
                  </button>
                ))}
              </nav>
            </div>
            <footer className={styles.profileSave}>
              <button className="btn btn-primary" disabled={busy||!dirty}>
                {t('حفظ', 'Save')}
              </button>
            </footer>
          </form>
        )}
      </Dialog>
    </div>
  );
}
