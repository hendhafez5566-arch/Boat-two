'use client';
import { useEffect,useRef,useState } from 'react';
import { api, setSession } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import styles from './settings-hub.module.css';
function deviceName(label: string) {
  const browser = label.match(/(Edg|Chrome|Firefox|Version)\/([\d.]+)/);
  const os = /Android/.test(label)
    ? 'Android'
    : /iPhone|iPad/.test(label)
      ? 'iOS'
      : /Windows/.test(label)
        ? 'Windows'
        : /Macintosh|Mac OS/.test(label)
          ? 'macOS'
          : /Linux|CrOS/.test(label)
            ? 'Linux'
            : '';
  if (!browser) return label.length > 60 ? label.slice(0, 57) + '…' : label;
  const name = browser[1] === 'Edg' ? 'Edge' : browser[1] === 'Version' ? 'Safari' : browser[1];
  return [name + ' ' + browser[2].split('.')[0], os].filter(Boolean).join(' · ');
}
export default function Sessions() {
  const { t } = useLocale();
  type Session =
    {
      id: string;
      tenant_id: string;
      created_at: string;
      expires_at: string;
      revoked_at: string | null;
      device_label: string;
      last_seen_at: string | null;
      is_current: boolean;
    };
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [busy, setBusy] = useState('');
  const lock=useRef(false);
  const [notice,setNotice]=useState(''),[status,setStatus]=useState('all');
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  const path='/auth/sessions/index?'+new URLSearchParams({q:search,status,page:String(page),limit:String(size)});
  const sessions=useData<{items:Session[];total:number}>(path,{items:[],total:0});
  const ready=sessions.loadedPath===path&&!sessions.loading&&!sessions.error;
  const total=ready?sessions.data.total:0,pages=Math.max(1,Math.ceil(total/size)),current=page,rows=ready?sessions.data.items:[];
  useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
  return (
    <section className="stack">
      <h1>{t('الأجهزة المتصلة', 'Logged-In Devices')}</h1>
      {(error || sessions.error) && (
        <p className="notice error" role="alert">
          {error || sessions.error} {sessions.error&&<button className="btn" onClick={()=>void sessions.reload()}>{t('إعادة المحاولة','Retry')}</button>}
        </p>
      )}
      {notice&&<p className="notice" role="status">{notice}</p>}
      <div className={styles.tools}>
        <input
          type="search"
          maxLength={200} value={search}
          aria-label={t('البحث بالأجهزة', 'Search devices')}
          placeholder={t('البحث بالأجهزة…', 'Search devices…')}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select aria-label={t('حالة الجلسة','Session status')} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">{t('كل الحالات','All statuses')}</option><option value="current">{t('هذا الجهاز','This device')}</option><option value="active">{t('نشطة','Active')}</option><option value="revoked">{t('أُبطلت','Revoked')}</option><option value="expired">{t('انتهت','Expired')}</option></select><button className="btn" disabled={!search&&status==='all'} onClick={()=>{setSearch('');setStatus('all');setPage(1);}}>{t('مسح الفلاتر','Clear filters')}</button>
        <button className="btn" disabled={!!busy||sessions.loading} onClick={() => void sessions.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      <div className={styles.tablewrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('آخر نشاط', 'Last Active')}</th>
              <th>{t('أول نشاط', 'First Activity')}</th>
              <th>{t('الجهاز', 'Device')}</th>
              <th>{t('الإجراءات', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!sessions.loading&&!sessions.error&&rows.map((session, index) => (
              <tr key={session.id}>
                <td>{(current - 1) * size + index + 1}</td>
                <td>
                  <time dateTime={session.last_seen_at ?? session.created_at}>
                    {new Date(session.last_seen_at ?? session.created_at).toLocaleString()}
                  </time>
                  {session.is_current && (
                    <span className={styles.current}>{t('هذا الجهاز', 'This device')}</span>
                  )}
                </td>
                <td>
                  <time dateTime={session.created_at}>
                    {new Date(session.created_at).toLocaleString()}
                  </time>
                </td>
                <td>
                  <span title={session.device_label}>
                    {deviceName(session.device_label || t('جهاز غير معروف', 'Unknown device'))}
                  </span>
                  <br />
                  <small>
                    {session.revoked_at
                      ? t('أُبطلت', 'Revoked')
                      : new Date(session.expires_at) < new Date()
                        ? t('انتهت', 'Expired')
                        : t('نشطة', 'Active')}
                  </small>
                </td>
                <td>
                  <button
                    className="btn"
                    disabled={
                      !!busy || !!session.revoked_at || new Date(session.expires_at) < new Date()
                    }
                    onClick={async () => {
                      if(lock.current)return;
                      if (
                        !confirm(
                          t(
                            'إبطال هذه الجلسة؟ ستحتاج إلى تسجيل الدخول مجددًا إذا كانت جلستك الحالية.',
                            'Revoke this session? Your current session will require signing in again.',
                          ),
                        )
                      )
                        return;
                      lock.current=true;setBusy(session.id);setNotice('');
                      setError('');
                      try {
                        await api('/auth/sessions/' + session.id + '/revoke', { method: 'POST' });
                        if (session.is_current) {
                          setSession(null);
                          window.location.assign('/login');
                          return;
                        }
                        await sessions.reload();setNotice(t('تم إبطال الجلسة','Session revoked'));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        lock.current=false;setBusy('');
                      }
                    }}
                  >
                    {t('إبطال الجلسة', 'Revoke session')}
                  </button>
                </td>
              </tr>
            ))}
            {(sessions.loading||sessions.error||!rows.length) && (
              <tr>
                <td colSpan={5}>
                  {sessions.loading
                    ? t('جارٍ التحميل…', 'Loading…')
                    : sessions.error?t('تعذر تحميل الأجهزة','Unable to load devices'):t('لا توجد أجهزة مطابقة.', 'No matching devices.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className={styles.footer}>
        <label>
          {t('الصفوف', 'Rows')}{' '}
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span>
          {total ? (current - 1) * size + 1 : 0}–
          {Math.min(current * size, total)} / {total}
        </span>
        <div>
          <button className="btn" disabled={!ready||current === 1} onClick={() => setPage(current - 1)}>
            {t('السابق', 'Previous')}
          </button>{' '}
          <span aria-live="polite">{current}</span>{' '}
          <button className="btn" disabled={!ready||current >= pages} onClick={() => setPage(current + 1)}>
            {t('التالي', 'Next')}
          </button>
        </div>
      </footer>
    </section>
  );
}
