'use client';
import { useState } from 'react';
import { api, setSession } from '../../lib/api';

export default function Register() {
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const t = await api<{ accessToken: string; refreshToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: f.get('fullName'),
          workspaceName: f.get('workspaceName'),
          email: f.get('email'),
          password: f.get('password'),
        }),
      });
      setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken });
      window.location.href = '/dashboard/onboarding';
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-card card">
        <p className="eyebrow">ELHAFEZ BOAT</p>
        <h1 className="mb-4 text-2xl font-bold">إنشاء حساب</h1>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input name="fullName" placeholder="الاسم" required className="rounded border p-2" />
          <input
            name="workspaceName"
            placeholder="اسم الشركة"
            required
            className="rounded border p-2"
          />
          <input
            name="email"
            type="email"
            placeholder="الإيميل"
            required
            className="rounded border p-2"
          />
          <input
            name="password"
            type="password"
            minLength={8}
            placeholder="كلمة المرور (8 أحرف على الأقل)"
            required
            className="rounded border p-2"
          />
          <button className="rounded bg-black p-2 text-white">إنشاء</button>
          {error && <p className="text-red-600">{error}</p>}
        </form>
        <a href="/login" className="mt-4 block text-sm underline">
          عندي حساب
        </a>
      </main>
    </div>
  );
}
