'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { useLocale } from '../../../../components/product/locale';
import { Dialog } from '../../../../components/product/ProductUI';
type Settings = {signature_enabled:boolean;signature_template:string;human_session_minutes:number;delivery_error_tag:string;sla_escalation_enabled:boolean;escalation_user_id:string|null; auto_assign: boolean; max_open_per_agent: number };
type Reply = { id: string; shortcut: string; title: string; content: string };
export default function InboxSettings() {
  const { t } = useLocale();
  const [team,setTeam]=useState<{user_id:string;full_name:string;email:string}[]>([]);
  useEffect(()=>{api<{members:typeof team}>('/team').then(r=>setTeam(r.members)).catch(()=>{});},[]);
  const [settings, setSettings] = useState<Settings | null>(null),
    [replies, setReplies] = useState<Reply[]>([]),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [edit, setEdit] = useState<Partial<Reply> | null>(null),
    [deleting, setDeleting] = useState<Reply | null>(null);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [s, r] = await Promise.all([
        api<Settings>('/inbox/settings'),
        api<Reply[]>('/canned-replies'),
      ]);
      setSettings(s);
      setReplies(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await fn();
      setSaved(true);
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
          <p className="eyebrow">{t('إدارة المحادثات', 'CONVERSATION OPERATIONS')}</p>
          <h1>{t('إعدادات صندوق الوارد', 'Inbox settings')}</h1>
          <p>
            {t(
              'اضبط توزيع المحادثات والردود المشتركة لفريقك.',
              'Configure assignment and shared replies for your team.',
            )}
          </p>
        </div>
        <Link className="btn" href="/dashboard/inbox">
          {t('افتح صندوق الوارد', 'Open Inbox')}
        </Link>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button className="btn" disabled={busy || loading} onClick={() => void load()}>
            {t('إعادة التحميل', 'Reload')}
          </button>
        </div>
      )}
      {saved && (
        <p role="status" className="notice">
          {t('تم حفظ التغيير.', 'Change saved.')}
        </p>
      )}
      {loading && <p role="status">{t('جارٍ التحميل…', 'Loading…')}</p>}
      {settings && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () =>
              setSettings(
                await api<Settings>('/inbox/settings', {
                  method: 'PUT',
                  body: JSON.stringify({
                    ...settings,
                    auto_assign: settings.auto_assign,
                    max_open_per_agent: settings.max_open_per_agent,
                  }),
                }),
              ),
            );
          }}
        >
          <h2>{t('التوقيع والجلسات وأخطاء التسليم','Signature, sessions and delivery errors')}</h2><label><input type="checkbox" checked={settings.signature_enabled} onChange={e=>setSettings({...settings,signature_enabled:e.target.checked})}/>{t('توقيع الموظف على الرسائل العادية','Employee signature on regular messages')}</label><label className="field">{t('نص التوقيع — {{agent.name}} لاسم الموظف','Signature template — {{agent.name}} inserts the employee name')}<input maxLength={200} value={settings.signature_template} onChange={e=>setSettings({...settings,signature_template:e.target.value})}/></label><label className="field">{t('مدة جلسة الموظف بالدقائق (0 = دون انتهاء تلقائي)','Human session minutes (0 = no automatic expiry)')}<input type="number" min={0} max={10080} value={settings.human_session_minutes} onChange={e=>setSettings({...settings,human_session_minutes:Number(e.target.value)})}/></label><label className="field">{t('وسم عند فشل تسليم رسالة (فارغ للتعطيل)','Delivery failure label (empty disables)')}<input maxLength={50} value={settings.delivery_error_tag} onChange={e=>setSettings({...settings,delivery_error_tag:e.target.value})}/></label><label><input type="checkbox" checked={settings.sla_escalation_enabled} onChange={e=>setSettings({...settings,sla_escalation_enabled:e.target.checked})}/>{t('تصعيد تجاوز SLA للقسم عند غياب رد موظف','Escalate a department SLA breach without an employee response')}</label><label className="field">{t('موظف التصعيد (فارغ يسجل التجاوز دون تغيير التعيين)','Escalation employee (empty records a breach without reassigning)')}<select value={settings.escalation_user_id??''} onChange={e=>setSettings({...settings,escalation_user_id:e.target.value||null})}><option value="">{t('دون تعيين جديد','No reassignment')}</option>{team.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name||m.email}</option>)}</select></label>
          <h2>{t('التوزيع التلقائي', 'Automatic assignment')}</h2>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={settings.auto_assign}
              onChange={(e) => setSettings({ ...settings, auto_assign: e.target.checked })}
            />
            {t(
              'عند التحويل من البوت، عيّن المحادثة لأقل موظف متاح انشغالاً.',
              'On bot handoff, assign the conversation to the least busy available agent.',
            )}
          </label>
          <label className="field">
            {t('أقصى محادثات مفتوحة لكل موظف', 'Maximum open conversations per agent')}
            <input
              type="number"
              required
              min={1}
              max={500}
              value={settings.max_open_per_agent}
              onChange={(e) =>
                setSettings({ ...settings, max_open_per_agent: Number(e.target.value) })
              }
            />
          </label>
          <p className="muted">
            {t(
              'الموظف غير المتاح لا يدخل في التوزيع. يمكنه تغيير إتاحته من صندوق الوارد.',
              'Unavailable agents are excluded. Agents can change availability in Inbox.',
            )}
          </p>
          <button className="btn btn-primary" disabled={busy}>
            {t('حفظ إعدادات التوزيع', 'Save assignment settings')}
          </button>
        </form>
      )}
      <section className="card stack">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>{t('الردود الجاهزة', 'Saved replies')}</h2>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setEdit({ shortcut: '', title: '', content: '' });
              setSaved(false);
            }}
          >
            {t('رد جديد', 'New reply')}
          </button>
        </div>
        <p className="muted">
          {t(
            'اكتب / ثم الاختصار في صندوق الرد. استخدم {{name}} لاسم العميل.',
            'Type / then a shortcut in the reply box. Use {{name}} for the customer name.',
          )}
        </p>
        {edit && (
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await api(edit.id ? `/canned-replies/${edit.id}` : '/canned-replies', {
                  method: edit.id ? 'PATCH' : 'POST',
                  body: JSON.stringify({
                    shortcut: edit.shortcut,
                    title: edit.title,
                    content: edit.content,
                  }),
                });
                setEdit(null);
                setReplies(await api<Reply[]>('/canned-replies'));
              });
            }}
          >
            <h3>{edit.id ? t('تعديل الرد', 'Edit reply') : t('إنشاء رد', 'Create reply')}</h3>
            <label className="field">
              {t('الاختصار', 'Shortcut')}
              <input
                dir="ltr"
                maxLength={30}
                required
                value={edit.shortcut || ''}
                onChange={(e) => setEdit({ ...edit, shortcut: e.target.value })}
              />
            </label>
            <label className="field">
              {t('العنوان', 'Title')}
              <input
                required
                maxLength={80}
                value={edit.title || ''}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label className="field">
              {t('نص الرد', 'Reply text')}
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={edit.content || ''}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {t('حفظ الرد', 'Save reply')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setEdit(null)}>
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        )}
        <ul className="stack">
          {replies.map((r) => (
            <li key={r.id} className="card stack">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  <bdi>/{r.shortcut}</bdi> · {r.title}
                </strong>
                <div className="flex gap-2">
                  <button className="btn" disabled={busy} onClick={() => setEdit(r)}>
                    {t('تعديل', 'Edit')}
                  </button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => setDeleting(r)}>
                    {t('حذف', 'Delete')}
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap break-words">{r.content}</p>
            </li>
          ))}
        </ul>
        {!loading && !replies.length && (
          <p className="empty">
            {t(
              'لا توجد ردود جاهزة بعد. أنشئ ردًا لتسريع المتابعة.',
              'No saved replies yet. Create one to speed up follow-up.',
            )}
          </p>
        )}
      </section>
      <Dialog
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('حذف الرد الجاهز؟', 'Delete saved reply?')}
      >
        <p>{deleting?.title}</p>
        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await api(`/canned-replies/${deleting!.id}`, { method: 'DELETE' });
                setDeleting(null);
                setReplies(await api<Reply[]>('/canned-replies'));
              })
            }
          >
            {t('تأكيد الحذف', 'Confirm deletion')}
          </button>
        </div>
      </Dialog>
    </main>
  );
}
