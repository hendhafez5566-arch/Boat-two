'use client';
import { FormEvent, useId, useState } from 'react';
import { api } from '../../lib/api';
import { statusLabel } from './status';
import { useLocale } from './locale';
type Channel = {
  id: string;
  type: string;
  name: string;
  status: string;
  settings?: Record<string, unknown>;
};
type Job = {
  id: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
};
export default function ChannelSettings({
  channel,
  onSaved,
}: {
  channel: Channel;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const panelId = useId();
  const [widgetPreview,setWidgetPreview]=useState({title:String(channel.settings?.title || t('تحدث معنا','Chat with us')),welcome:String(channel.settings?.welcomeMessage || t('أهلًا بك! كيف يمكننا مساعدتك؟','Hi! How can we help?')),direction:String(channel.settings?.direction || 'rtl')});
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const settings =
        channel.type === 'web'
          ? {
              title: f.get('title'),
              color: f.get('color'),
              welcomeMessage: f.get('welcomeMessage'),
              direction: f.get('direction'),
              allowedOrigins: String(f.get('allowedOrigins') || '')
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : undefined;
      await api('/channels/' + channel.id, {
        method: 'PATCH',
        body: JSON.stringify({ name: f.get('name'), status: f.get('status'), settings }),
      });
      setMessage(t('تم حفظ الإعدادات.', 'Settings saved.'));
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reconnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    try {
      await api(`/channels/${channel.id}/credentials`, {
        method: 'POST',
        body: JSON.stringify({
          accessToken: f.get('accessToken'),
          ...(f.get('wabaId') ? { wabaId: f.get('wabaId') } : {}),
        }),
      });
      form.reset();
      setMessage(
        t(
          'تم حفظ الرمز مشفرًا. لم يتم التحقق من اتصال المزود.',
          'Token saved encrypted. Provider connectivity has not been verified.',
        ),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadJobs() {
    setBusy(true);
    setError('');
    try {
      setJobs(await api<Job[]>(`/channels/${channel.id}/webhook-jobs`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setBusy(true);
    try {
      await api(`/channels/${channel.id}/webhook-jobs/${id}/retry`, { method: 'POST' });
      await loadJobs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const s = channel.settings || {};
  return (
    <div className="mt-3">
      <button
        className="btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {t('الإعدادات وحالة القناة', 'Channel settings & status')}
      </button>
      {open && (
        <div className="stack mt-4" id={panelId}>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <form onSubmit={save} onChange={e=>{if(channel.type !== 'web')return;const form=e.currentTarget;setWidgetPreview({title:(form.elements.namedItem('title') as HTMLInputElement).value,welcome:(form.elements.namedItem('welcomeMessage') as HTMLInputElement).value,direction:(form.elements.namedItem('direction') as HTMLSelectElement).value});}}>
            <div className="form-grid">
              <label className="field">
                {t('اسم القناة', 'Channel name')}
                <input name="name" required maxLength={80} defaultValue={channel.name} />
              </label>
              <label className="field">
                {t('الحالة المحلية', 'Local status')}
                <select name="status" defaultValue={channel.status}>
                  <option value="active">{t('مفعّلة', 'Enabled')}</option>
                  <option value="disabled">{t('معطّلة', 'Disabled')}</option>
                </select>
              </label>
              {channel.type === 'web' && (
                <>
                  <div className="notice"><p>{t('راجع العنوان والترحيب مع اتجاه العرض قبل الحفظ. المحتوى الحالي لا يُترجم تلقائيًا.','Review title and welcome text with the direction before saving. Existing content is not translated automatically.')}</p><button type="button" className="btn" onClick={e=>{const form=e.currentTarget.form;if(!form)return;(form.elements.namedItem('title') as HTMLInputElement).value='تحدث معنا';(form.elements.namedItem('welcomeMessage') as HTMLInputElement).value='أهلًا بك! كيف يمكننا مساعدتك؟';(form.elements.namedItem('direction') as HTMLSelectElement).value='rtl';setWidgetPreview({title:'تحدث معنا',welcome:'أهلًا بك! كيف يمكننا مساعدتك؟',direction:'rtl'});}}>{t('استخدام ترحيب عربي مقترح (راجع ثم احفظ)','Use suggested Arabic welcome (review then save)')}</button></div>
                  <label className="field">
                    {t('عنوان الويدجت', 'Widget title')}
                    <input
                      name="title"
                      maxLength={60}
                      defaultValue={String(s.title || t('تحدث معنا','Chat with us'))}
                    />
                  </label>
                  <label className="field">
                    {t('اللون', 'Brand color')}
                    <input name="color" type="color" defaultValue={String(s.color || '#3d5afe')} />
                  </label>
                  <label className="field">
                    {t('رسالة الترحيب', 'Welcome message')}
                    <input
                      name="welcomeMessage"
                      maxLength={500}
                      defaultValue={String(s.welcomeMessage || t('أهلًا بك! كيف يمكننا مساعدتك؟','Hi! How can we help?'))}
                    />
                  </label>
                  <label className="field">
                    {t('الاتجاه', 'Direction')}
                    <select name="direction" defaultValue={String(s.direction || 'rtl')}>
                      <option value="rtl">العربية RTL</option>
                      <option value="ltr">English LTR</option>
                    </select>
                  </label>
                  <div className="card" dir={widgetPreview.direction}><small>{t('معاينة المحتوى','Content preview')}</small><h3>{widgetPreview.title}</h3><p>{widgetPreview.welcome}</p></div>
                  <label className="field">
                    {t('المواقع المسموحة (رابط أصل لكل سطر)', 'Allowed origins (one per line)')}
                    <textarea
                      name="allowedOrigins"
                      placeholder="https://example.com"
                      defaultValue={((s.allowedOrigins as string[]) || []).join('\n')}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="form-actions">
              <button disabled={busy} className="btn btn-primary">
                {t('حفظ', 'Save')}
              </button>
            </div>
          </form>
          {channel.type !== 'web' && (
            <>
              <p className="muted">
                {t(
                  'الحالة المحلية لا تعني أن Meta وافقت على الربط. يلزم إعداد Webhooks والصلاحيات ورمز مزود صالح.',
                  'Local status does not establish Meta approval. Webhooks, permissions and a valid provider token are required.',
                )}
              </p>
              <form onSubmit={reconnect} className="flex flex-wrap gap-2">
                <input
                  aria-label={t('رمز وصول جديد للمزود', 'New provider access token')}
                  type="password"
                  name="accessToken"
                  required
                  minLength={10}
                  maxLength={4000}
                  placeholder={t('رمز وصول جديد', 'New access token')}
                  className="rounded border p-2"
                  autoComplete="off"
                />
                {channel.type === 'whatsapp' && (
                  <input
                    aria-label={t('معرّف حساب WhatsApp Business', 'WhatsApp Business Account ID')}
                    name="wabaId"
                    pattern="[0-9]+"
                    placeholder={t('معرّف WABA (اختياري)', 'WABA ID (optional)')}
                    className="rounded border p-2"
                  />
                )}
                <button disabled={busy} className="btn">
                  {t('تحديث الرمز بأمان', 'Replace token securely')}
                </button>
              </form>
              <button className="btn" disabled={busy} onClick={loadJobs}>
                {t('عرض آخر 50 عملية Webhook', 'View last 50 webhook jobs')}
              </button>
              {jobs && (
                <div className="table-wrap">
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th>{t('الحالة', 'Status')}</th>
                        <th>{t('المحاولات', 'Attempts')}</th>
                        <th>{t('الخطأ', 'Error')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => (
                        <tr key={j.id}>
                          <td>{statusLabel(j.status, t)}</td>
                          <td>{j.attempts}</td>
                          <td>{j.error || '—'}</td>
                          <td>
                            {j.status === 'failed' && (
                              <button className="btn" disabled={busy} onClick={() => retry(j.id)}>
                                {t('إعادة المحاولة', 'Retry')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!jobs.length && (
                    <p className="muted">
                      {t('لا توجد عمليات مستلمة.', 'No webhook jobs received.')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
