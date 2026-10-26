'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, setSession } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
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
  return (
    <section className="stack">
      <h1>{t('جلسات الحساب', 'Account sessions')}</h1>
      <p className="notice">
        {t(
          'إبطال الجلسة يمنع رموز الوصول والتجديد المرتبطة بها فورًا. قد تحتاج إلى تسجيل الدخول مجددًا إذا أبطلت جلستك الحالية.',
          'Revoking a session immediately blocks its access and refresh tokens. Revoking your current session requires signing in again.',
        )}
      </p>
      {(error || sessions.error) && <p className="notice error">{error || sessions.error}</p>}
      <button className="btn" onClick={() => sessions.reload()}>
        {t('تحديث', 'Refresh')}
      </button>
      <Link className="btn" href="/dashboard/audit">
        {t('نشاط الحساب وسجل الحذف والإدارة', 'Account activity, deletion and administration log')}
      </Link>
      {sessions.data.map((session) => (
        <article className="card" key={session.id}>
          <strong>
            {session.device_label || t('جهاز غير معروف', 'Unknown device')}{' '}
            {session.is_current && t('· الجلسة الحالية', '· Current session')}
          </strong>
          <small className="block">
            {session.revoked_at
              ? t('أُبطلت', 'Revoked')
              : new Date(session.expires_at) < new Date()
                ? t('انتهت', 'Expired')
                : t('نشطة', 'Active')}{' '}
            · {t('آخر نشاط', 'Last active')}:{' '}
            {new Date(session.last_seen_at ?? session.created_at).toLocaleString()}
          </small>
          <p>
            {t('بدأت', 'Created')}: {new Date(session.created_at).toLocaleString()} ·{' '}
            {t('تنتهي', 'Expires')}: {new Date(session.expires_at).toLocaleString()}
          </p>
          <button
            className="btn"
            disabled={!!session.revoked_at || new Date(session.expires_at) < new Date()}
            onClick={async () => {
              if (!confirm(t('إبطال هذه الجلسة؟', 'Revoke this session?'))) return;
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
              }
            }}
          >
            {t('إبطال الجلسة', 'Revoke session')}
          </button>
        </article>
      ))}
      <button
        className="btn"
        onClick={() => {
          setSession(null);
          window.location.assign('/login');
        }}
      >
        {t('العودة لتسجيل الدخول', 'Return to sign-in')}
      </button>
    </section>
  );
}
