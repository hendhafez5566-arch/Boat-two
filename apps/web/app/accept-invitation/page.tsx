'use client';
import { FormEvent, useState } from 'react';
import { api, setSession, Session } from '../../lib/api';
export default function AcceptInvitation() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) throw new Error('رابط الدعوة غير صالح');
      const r = await api<Session>('/auth/accept-invitation', {
        method: 'POST',
        body: JSON.stringify({ token, password: f.get('password'), fullName: f.get('fullName') }),
      });
      setSession(r);
      window.location.replace('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <main className="auth-card card">
        <p className="eyebrow">ELHAFEZ BOAT</p>
        <h1 className="text-2xl font-bold mb-3">الانضمام إلى الفريق</h1>
        <p className="muted mb-4">
          إذا كان لديك حساب، استخدم كلمة مروره الحالية. الدعوة صالحة لمدة 7 أيام.
        </p>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            اسمك
            <input name="fullName" required maxLength={120} autoComplete="name" />
          </label>
          <label className="field">
            كلمة المرور
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'جارٍ الانضمام…' : 'قبول الدعوة'}
          </button>
        </form>
      </main>
    </div>
  );
}
