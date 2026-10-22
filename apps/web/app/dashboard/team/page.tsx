'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
type Member = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  available: boolean;
};
type Invite = { id: string; email: string; role: string; expires_at: string };
export default function Team() {
  const { t } = useLocale();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const [team, w] = await Promise.all([
        api<{ members: Member[]; pendingInvitations: Invite[] }>('/team'),
        api<{ role: string }>('/workspace'),
      ]);
      setMembers(team.members);
      setInvites(team.pendingInvitations);
      setRole(w.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function action(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError('');
    setUrl('');
    try {
      const r = await api<{ inviteUrl: string }>('/team/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), role: f.get('role') }),
      });
      setUrl(r.inviteUrl);
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PEOPLE & ACCESS</p>
          <h1>{t('الفريق والصلاحيات', 'Team & permissions')}</h1>
          <p>
            {t(
              'المالك يدير الأدوار، والمدير يدير العمل، والموظف يتابع المحادثات.',
              'Owners manage roles, admins manage operations, agents handle conversations.',
            )}
          </p>
        </div>
        <span className="badge">
          {members.length} {t('عضو', 'members')}
        </span>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <section className="card table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('الموظف', 'Member')}</th>
              <th>{t('الدور', 'Role')}</th>
              <th>{t('التوفر', 'Availability')}</th>
              <th>{t('إدارة', 'Manage')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <strong>{m.full_name}</strong>
                  <div className="muted">{m.email}</div>
                </td>
                <td>
                  {role === 'owner' && m.role !== 'owner' ? (
                    <select
                      aria-label={t('تغيير الدور', 'Change role')}
                      disabled={busy}
                      value={m.role}
                      onChange={(e) =>
                        action('/team/members/' + m.user_id, 'PATCH', { role: e.target.value })
                      }
                    >
                      <option value="admin">{t('مدير', 'Admin')}</option>
                      <option value="agent">{t('موظف', 'Agent')}</option>
                    </select>
                  ) : (
                    m.role
                  )}
                </td>
                <td>{m.available ? t('متاح', 'Available') : t('غير متاح', 'Away')}</td>
                <td>
                  {m.role !== 'owner' &&
                    (role === 'owner' || (role === 'admin' && m.role === 'agent')) && (
                      <button
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          confirm(t('إزالة العضو من الشركة؟', 'Remove this member?')) &&
                          action('/team/members/' + m.user_id, 'DELETE')
                        }
                      >
                        {t('إزالة', 'Remove')}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>}
      </section>
      {role !== 'agent' && (
        <section className="card">
          <h2>{t('دعوة موظف', 'Invite a teammate')}</h2>
          <form onSubmit={invite}>
            <div className="form-grid">
              <label className="field">
                {t('البريد الإلكتروني', 'Email')}
                <input name="email" type="email" required />
              </label>
              <label className="field">
                {t('الدور', 'Role')}
                <select name="role">
                  <option value="agent">{t('موظف', 'Agent')}</option>
                  {role === 'owner' && <option value="admin">{t('مدير', 'Admin')}</option>}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button disabled={busy} className="btn btn-primary">
                {t('إنشاء رابط دعوة', 'Create invitation link')}
              </button>
            </div>
          </form>
          {url && (
            <div className="notice">
              <p>
                {t(
                  'شارك الرابط بشكل آمن. لا تُرسل رسائل بريد تلقائيًا.',
                  'Share this link securely. Email is not sent automatically.',
                )}
              </p>
              <input
                aria-label="Invitation link"
                className="w-full p-2 mt-2"
                readOnly
                dir="ltr"
                value={url}
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}
        </section>
      )}
      <section className="card">
        <h2>{t('الدعوات المعلّقة', 'Pending invitations')}</h2>
        {!invites.length ? (
          <p className="muted">{t('لا توجد دعوات معلقة.', 'No pending invitations.')}</p>
        ) : (
          invites.map((i) => (
            <div className="step" key={i.id}>
              <div>
                <strong>{i.email}</strong>
                <small>
                  {i.role} · {new Date(i.expires_at).toLocaleDateString()}
                </small>
              </div>
              <button
                disabled={busy}
                className="btn btn-danger"
                onClick={() => action('/team/invitations/' + i.id, 'DELETE')}
              >
                {t('إلغاء الدعوة', 'Revoke')}
              </button>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
