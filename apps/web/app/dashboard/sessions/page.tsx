'use client';
import { useState } from 'react';
import { api, setSession } from '../../../lib/api';
import { useData } from '../../../components/business/useData';
import { useLocale } from '../../../components/product/locale';
export default function Sessions() {
  const { t } = useLocale();
  const sessions = useData<
    { id: string; tenant_id: string; created_at: string; expires_at: string }[]
  >('/auth/sessions', []);
  const [error, setError] = useState('');
  return (
    <main className="stack">
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
      {sessions.data.map((session) => (
        <article className="card" key={session.id}>
          <small dir="ltr">{session.id}</small>
          <p>
            {t('بدأت', 'Created')}: {new Date(session.created_at).toLocaleString()} ·{' '}
            {t('تنتهي', 'Expires')}: {new Date(session.expires_at).toLocaleString()}
          </p>
          <button
            className="btn"
            onClick={async () => {
              if (!confirm(t('إبطال هذه الجلسة؟', 'Revoke this session?'))) return;
              try {
                await api('/auth/sessions/' + session.id + '/revoke', { method: 'POST' });
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
    </main>
  );
}
