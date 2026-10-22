'use client';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
export default function Departments() {
  const { t } = useLocale();
  const data = useData<{ id: string; name: string; sla_minutes: number; members: string[] }[]>(
    '/departments',
    [],
  );
  const team = useData<{ members: { user_id: string; full_name: string; email: string }[] }>(
    '/team',
    { members: [] },
  );
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEAMS & SERVICE LEVELS</p>
          <h1>{t('الأقسام ومستوى الخدمة', 'Departments & service levels')}</h1>
          <p>
            {t(
              'اربط المحادثة بقسم وحدد هدف الرد بالدقائق.',
              'Route conversations to departments and define response targets in minutes.',
            )}
          </p>
        </div>
      </div>
      {(error || data.error) && <p className="notice error">{error || data.error}</p>}
      <div className="card-grid">
        {data.data.map((d) => (
          <section className="card" key={d.id}>
            <h2>{d.name}</h2>
            <span className="badge">
              SLA {d.sla_minutes} {t('دقيقة', 'minutes')}
            </span>
            <p className="muted mt-3">
              {d.members
                .map((id) => team.data.members.find((m) => m.user_id === id)?.full_name || id)
                .join(' · ') || t('لا يوجد أعضاء بعد', 'No members yet')}
            </p>
          </section>
        ))}
      </div>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          try {
            await api('/departments', {
              method: 'POST',
              body: JSON.stringify({
                name: f.get('name'),
                slaMinutes: Number(f.get('sla')),
                members,
              }),
            });
            form.reset();
            setMembers([]);
            data.reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{t('قسم جديد', 'New department')}</h2>
        <div className="form-grid">
          <label className="field">
            {t('الاسم', 'Name')}
            <input required name="name" />
          </label>
          <label className="field">
            {t('هدف الرد (دقائق)', 'Response target (minutes)')}
            <input type="number" min={1} max={10080} required name="sla" defaultValue={60} />
          </label>
        </div>
        <fieldset>
          <legend>{t('أعضاء القسم', 'Department members')}</legend>
          {team.data.members.map((m) => (
            <label className="flex gap-2 py-1" key={m.user_id}>
              <input
                type="checkbox"
                checked={members.includes(m.user_id)}
                onChange={(e) =>
                  setMembers((ids) =>
                    e.target.checked ? [...ids, m.user_id] : ids.filter((id) => id !== m.user_id),
                  )
                }
              />
              {m.full_name || m.email}
            </label>
          ))}
        </fieldset>
        <button disabled={busy} className="btn btn-primary self-start">
          {t('إنشاء القسم', 'Create department')}
        </button>
      </form>
    </main>
  );
}
