'use client';
import { useEffect, useState } from 'react';
import { api, getSession, setSession } from '../../lib/api';

type Workspace = {
  tenant: { name: string };
  role: string;
  plan: { plan_name: string; status: string; trial_ends_at: string | null; limits: Record<string, number> };
  usage: { agents: number };
};

export default function Dashboard() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    api<Workspace>('/workspace').then(setWs).catch((e) => setError(e.message));
  }, []);

  async function logout() {
    const s = getSession();
    if (s) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => {});
    setSession(null);
    window.location.href = '/login';
  }

  if (error) return <main className="p-6 text-red-600">{error}</main>;
  if (!ws) return <main className="p-6">جارٍ التحميل...</main>;

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-2xl font-bold">{ws.tenant.name}</h1>
      <p>دورك: {ws.role}</p>
      <p>
        الخطة: {ws.plan.plan_name} ({ws.plan.status})
        {ws.plan.trial_ends_at && ` — التجربة تنتهي ${new Date(ws.plan.trial_ends_at).toLocaleDateString('ar-EG')}`}
      </p>
      <p>
        الموظفين: {ws.usage.agents} / {ws.plan.limits.agents === -1 ? 'غير محدود' : ws.plan.limits.agents}
      </p>
      <a href="/dashboard/inbox" className="mt-4 block font-semibold underline">صندوق الوارد</a>
      <a href="/dashboard/channels" className="mt-2 block underline">إدارة القنوات</a>
      <a href="/dashboard/flows" className="mt-2 block underline">السيناريوهات (Flows)</a>
      <a href="/dashboard/ai" className="mt-2 block underline">الذكاء الاصطناعي</a>
      <a href="/dashboard/knowledge" className="mt-2 block underline">قاعدة المعرفة</a>
      <button onClick={logout} className="mt-4 rounded border px-3 py-1">تسجيل خروج</button>
    </main>
  );
}
