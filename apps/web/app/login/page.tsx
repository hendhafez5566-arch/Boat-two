'use client';
import { useState } from 'react';
import { api, setSession } from '../../lib/api';

export default function Login() {
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const t = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
      });
      setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken });
      window.location.href = '/dashboard';
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold">تسجيل الدخول</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="الإيميل" required className="rounded border p-2" />
        <input name="password" type="password" placeholder="كلمة المرور" required className="rounded border p-2" />
        <button className="rounded bg-black p-2 text-white">دخول</button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
      <a href="/register" className="mt-4 block text-sm underline">إنشاء حساب جديد</a>
    </main>
  );
}
