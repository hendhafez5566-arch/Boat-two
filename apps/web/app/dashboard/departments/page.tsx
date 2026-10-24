'use client';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
export default function Departments() {
  const { t } = useLocale();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [range] = useState(() =>
    new URLSearchParams({
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
    }).toString(),
  );
  const metrics = useData<
    {
      id: string;
      conversations: number;
      responded: number;
      unanswered: number;
      average_response_seconds: number | null;
      current_target_breaches: number;
    }[]
  >('/departments/metrics?' + range, []);
  const data = useData<
    {
      id: string;
      name: string;
      sla_minutes: number;
      members: string[];
      archived_at: string | null;
      updated_at: string;
    }[]
  >('/departments?includeArchived=' + includeArchived, []);
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
      {(error || data.error || metrics.error) && (
        <p className="notice error">{error || data.error || metrics.error}</p>
      )}
      <label>
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />{' '}
        {t('عرض الأقسام المؤرشفة', 'Include archived departments')}
      </label>
      <p className="notice">
        {t(
          'المؤشرات لآخر 30 يومًا حسب تاريخ إنشاء المحادثة، بتوقيت UTC وزمن تقويمي. يُستخدم وقت إنشاء أول رسالة موظف عامة حالتها مرسلة؛ وليس وقت تأكيد المزود. المقارنة بهدف القسم وتعيين المحادثة الحاليين؛ ليست تقريرًا تاريخيًا لساعات العمل.',
          'Metrics cover conversations created in the last 30 days, in UTC wall-clock time. Response uses creation time of the first public staff message with sent status, not provider acknowledgement time. Targets and department assignments are current; this is not a historical business-hours SLA report.',
        )}
      </p>
      <div className="card-grid">
        {data.data.map((d) => (
          <section className="card" key={d.id}>
            <h2>{d.name}</h2>
            <span className="badge">
              SLA {d.sla_minutes} {t('دقيقة', 'minutes')}
            </span>
            {d.archived_at && <span className="badge">{t('مؤرشف', 'Archived')}</span>}
            {metrics.data
              .filter((metric) => metric.id === d.id)
              .map((metric) => (
                <p key={metric.id} className="notice">
                  {t('محادثات', 'Conversations')}: {metric.conversations} ·{' '}
                  {t('رُد عليها', 'Responded')}: {metric.responded} ·{' '}
                  {t('بلا رد موظف', 'No staff response')}: {metric.unanswered} ·{' '}
                  {t('متوسط الثواني', 'Average seconds')}: {metric.average_response_seconds ?? '—'}{' '}
                  · {t('تجاوز الهدف الحالي', 'Current target breaches')}:{' '}
                  {metric.current_target_breaches}
                </p>
              ))}
            <p className="muted mt-3">
              {d.members
                .map((id) => team.data.members.find((m) => m.user_id === id)?.full_name || id)
                .join(' · ') || t('لا يوجد أعضاء بعد', 'No members yet')}
            </p>
            <details>
              <summary>{t('تعديل القسم', 'Edit department')}</summary>
              <form
                key={d.updated_at}
                className="stack mt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError('');
                  try {
                    await api('/departments/' + d.id, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        name: f.get('name'),
                        slaMinutes: Number(f.get('sla')),
                        members: f.getAll('members'),
                        expectedUpdatedAt: d.updated_at,
                      }),
                    });
                    await data.reload();
                    await metrics.reload();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="field">
                  {t('الاسم', 'Name')}
                  <input name="name" defaultValue={d.name} required maxLength={100} />
                </label>
                <label className="field">
                  {t('هدف الرد بالدقائق', 'Response target minutes')}
                  <input
                    name="sla"
                    type="number"
                    min={1}
                    max={10080}
                    defaultValue={d.sla_minutes}
                    required
                  />
                </label>
                <fieldset>
                  <legend>{t('الأعضاء', 'Members')}</legend>
                  {team.data.members.map((member) => (
                    <label className="flex gap-2" key={member.user_id}>
                      <input
                        type="checkbox"
                        name="members"
                        value={member.user_id}
                        defaultChecked={d.members.includes(member.user_id)}
                      />
                      {member.full_name || member.email}
                    </label>
                  ))}
                </fieldset>
                <button className="btn btn-primary" disabled={busy}>
                  {t('حفظ القسم', 'Save department')}
                </button>
              </form>
            </details>
            <button
              className="btn mt-3"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    d.archived_at
                      ? t('استعادة القسم؟', 'Restore department?')
                      : t(
                          'أرشفة القسم مع حفظ محادثاته؟',
                          'Archive department and preserve its conversations?',
                        ),
                  )
                )
                  return;
                setBusy(true);
                setError('');
                try {
                  await api('/departments/' + d.id + '/archive', {
                    method: 'PATCH',
                    body: JSON.stringify({ archived: !d.archived_at }),
                  });
                  await data.reload();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {d.archived_at ? t('استعادة', 'Restore') : t('أرشفة', 'Archive')}
            </button>
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
