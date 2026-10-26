'use client';
import { useState } from 'react';
import { api, setSession } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import styles from './settings-hub.module.css';
export default function Sessions() {
  const { t } = useLocale();
  const sessions = useData<
    {
      id: string;
      tenant_id: string;
      created_at: string;
      expires_at: string;
      revoked_at: string | null;
      device_label: string;
      last_seen_at: string | null;
      is_current: boolean;
    }[]
  >('/auth/sessions', []);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [busy, setBusy] = useState('');
  const filtered = sessions.data.filter((s) =>
    (s.device_label || '').toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * size, current * size);
  return (
    <section className="stack">
      <h1>{t('الأجهزة المتصلة', 'Logged-In Devices')}</h1>
      {(error || sessions.error) && (
        <p className="notice error" role="alert">
          {error || sessions.error}
        </p>
      )}
      <div className={styles.tools}>
        <input
          type="search"
          value={search}
          aria-label={t('البحث بالأجهزة', 'Search devices')}
          placeholder={t('البحث بالأجهزة…', 'Search devices…')}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <button className="btn" disabled={sessions.loading} onClick={() => void sessions.reload()}>
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
            {rows.map((session, index) => (
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
                  {session.device_label || t('جهاز غير معروف', 'Unknown device')}
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
                      if (
                        !confirm(
                          t(
                            'إبطال هذه الجلسة؟ ستحتاج إلى تسجيل الدخول مجددًا إذا كانت جلستك الحالية.',
                            'Revoke this session? Your current session will require signing in again.',
                          ),
                        )
                      )
                        return;
                      setBusy(session.id);
                      setError('');
                      try {
                        await api('/auth/sessions/' + session.id + '/revoke', { method: 'POST' });
                        if (session.is_current) {
                          setSession(null);
                          window.location.assign('/login');
                          return;
                        }
                        await sessions.reload();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy('');
                      }
                    }}
                  >
                    {t('إبطال الجلسة', 'Revoke session')}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>
                  {sessions.loading
                    ? t('جارٍ التحميل…', 'Loading…')
                    : t('لا توجد أجهزة مطابقة.', 'No matching devices.')}
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
          {filtered.length ? (current - 1) * size + 1 : 0}–
          {Math.min(current * size, filtered.length)} / {filtered.length}
        </span>
        <div>
          <button className="btn" disabled={current === 1} onClick={() => setPage(current - 1)}>
            {t('السابق', 'Previous')}
          </button>{' '}
          <span aria-live="polite">{current}</span>{' '}
          <button className="btn" disabled={current === pages} onClick={() => setPage(current + 1)}>
            {t('التالي', 'Next')}
          </button>
        </div>
      </footer>
    </section>
  );
}
