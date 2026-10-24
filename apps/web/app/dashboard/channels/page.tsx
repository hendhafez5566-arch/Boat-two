'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import MetaConnect from '../../../components/product/MetaConnect';
import ChannelSettings from '../../../components/product/ChannelSettings';
import { useLocale } from '../../../components/product/locale';
import { statusLabel } from '../../../components/product/status';
import { Dialog } from '../../../components/product/ProductUI';
import { api, getSession } from '../../../lib/api';

type Channel = {
  id: string;
  type: string;
  name: string;
  external_id: string;
  status: string;
  widgetSnippet?: string;
  settings?: Record<string, unknown>;
};

const FIELDS: Record<string, { key: string; label: string }[]> = {
  web: [],
  whatsapp: [
    { key: 'phoneNumberId', label: 'Phone Number ID' },
    { key: 'wabaId', label: 'WhatsApp Business Account ID' },
    { key: 'accessToken', label: 'Access Token' },
  ],
  facebook: [
    { key: 'pageId', label: 'Page ID' },
    { key: 'pageAccessToken', label: 'Page Access Token' },
  ],
  instagram: [
    { key: 'igAccountId', label: 'Instagram Account ID' },
    { key: 'pageAccessToken', label: 'Page Access Token' },
  ],
};

export default function Channels() {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied,setCopied]=useState('');
  const [items, setItems] = useState<Channel[]>([]);
  const [type, setType] = useState('web');
  const [error, setError] = useState('');

  const load = () =>
    api<Channel[]>('/channels')
      .then((rows) => {
        setItems(rows);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setError('');
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Record<string, unknown> = { type, name: f.get('name') };
    if (type !== 'web') {
      body.credentials = Object.fromEntries(FIELDS[type].map((x) => [x.key, f.get(x.key)]));
    }
    try {
      await api('/channels', { method: 'POST', body: JSON.stringify(body) });
      form.reset();
      await load();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/channels/${id}`, { method: 'DELETE' });
      setDeleting(null);
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
          <p className="eyebrow">{t('ربط العملاء', 'CUSTOMER CONNECTIONS')}</p>
          <h1>{t('القنوات', 'Channels')}</h1>
          <p>
            {t(
              'أدر القنوات والويدجت وإعدادات الاتصال في مكان واحد.',
              'Manage channels, widgets and connection settings in one place.',
            )}
          </p>
        </div>
      </div>
      <MetaConnect onSaved={load} />
      {error && (
        <p className="notice error" role="alert">
          {error}{' '}
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {t('إعادة التحميل', 'Reload')}
          </button>
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          {t('أُضيفت القناة.', 'Channel added.')}
        </p>
      )}
      {loading && <p role="status">{t('جارٍ تحميل القنوات…', 'Loading channels…')}</p>}

      <ul className="mb-8 flex flex-col gap-3">
        {items.map((c) => (
          <li key={c.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <strong>
                {c.name}{' '}
                <span className="text-sm text-gray-500">
                  (
                  {
                    (
                      {
                        web: t('ويدجت الموقع', 'Website widget'),
                        whatsapp: 'WhatsApp',
                        facebook: 'Facebook Messenger',
                        instagram: 'Instagram',
                      } as Record<string, string>
                    )[c.type]
                  }
                  ) · {statusLabel(c.status, t)}
                </span>
              </strong>
              <button disabled={busy} onClick={() => setDeleting(c)} className="btn btn-danger">
                {t('حذف', 'Delete')}
              </button>
            </div>
            <ChannelSettings channel={c} onSaved={load} />
            {c.type === 'whatsapp' && (
              <Link className="btn mt-3" href={`/dashboard/channels/${c.id}/templates`}>
                {t('إدارة قوالب WhatsApp', 'Manage WhatsApp templates')} ↗
              </Link>
            )}
            {c.widgetSnippet && (
              <>
                <p className="mt-2 text-sm">
                  {t(
                    'الصق الكود في موقعك قبل </body>:',
                    'Paste this code before </body> on your website:',
                  )}
                </p>
                <pre dir="ltr" className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
                  {c.widgetSnippet}
                </pre>
                <div className="form-actions"><button className="btn" onClick={async()=>{try{await navigator.clipboard.writeText(c.widgetSnippet!);setCopied(c.id);}catch{setError(t('تعذر النسخ التلقائي. انسخ الكود الظاهر يدويًا.','Automatic copy failed. Copy the displayed code manually.'));}}}>{copied === c.id ? t('تم نسخ الكود','Code copied') : t('نسخ كود التثبيت','Copy installation code')}</button><a className="btn" target="_blank" rel="noopener noreferrer" href={'/widget-demo.html?key='+encodeURIComponent(c.external_id)}>{t('جرّب الويدجت','Try widget')}</a></div><p role="status">{copied === c.id && t('أرسل الكود لمسؤول موقعك وأضفه قبل إغلاق body. اضبط المواقع المسموحة من إعدادات القناة.','Share the code with your website administrator and insert before closing body. Set allowed origins in channel settings.')}</p>
                <p className="mt-1 text-xs">
                  {t('للتجربة:', 'Try it:')} <code>/widget-demo.html?key={c.external_id}</code>
                </p>
              </>
            )}
          </li>
        ))}
        {!loading && !items.length && (
          <li className="empty">
            {t(
              'لا توجد قنوات بعد. أضف ويدجت لتجربة أول محادثة.',
              'No channels yet. Add a website widget for your first conversation.',
            )}
          </li>
        )}
      </ul>

      <h2>{t('إضافة قناة', 'Add a channel')}</h2>
      <form onSubmit={create} className="card stack">
        <label className="field">
          {t('نوع القناة', 'Channel type')}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border p-2"
          >
            <option value="web">{t('ويدجت الموقع', 'Website widget')}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="facebook">Facebook Messenger</option>
            <option value="instagram">Instagram</option>
          </select>
        </label>
        <label className="field">
          {t('اسم القناة', 'Channel name')}
          <input name="name" required maxLength={80} />
        </label>
        {FIELDS[type].map((x) => (
          <label className="field" key={x.key + type}>
            {(
              {
                phoneNumberId: t('معرّف رقم الهاتف', 'Phone Number ID'),
                wabaId: t('معرّف حساب WhatsApp Business', 'WhatsApp Business Account ID'),
                accessToken: t('رمز الوصول', 'Access Token'),
                pageId: t('معرّف الصفحة', 'Page ID'),
                pageAccessToken: t('رمز وصول الصفحة', 'Page Access Token'),
                igAccountId: t('معرّف حساب Instagram', 'Instagram Account ID'),
              } as Record<string, string>
            )[x.key] || x.label}
            <input
              type={x.key.toLowerCase().includes('token') ? 'password' : 'text'}
              autoComplete="off"
              name={x.key}
              required
              dir="ltr"
              className="rounded border p-2"
            />
          </label>
        ))}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? t('جارٍ الإضافة…', 'Adding…') : t('إضافة القناة', 'Add channel')}
        </button>
      </form>
      <Dialog
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('حذف القناة ومحادثاتها؟', 'Delete channel and its conversations?')}
      >
        <p>{deleting?.name}</p>
        <p>
          {t(
            'سيحذف هذا الإجراء القناة ومحادثاتها.',
            'This removes the channel and its conversations.',
          )}
        </p>
        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => deleting && void remove(deleting.id)}
          >
            {t('تأكيد الحذف', 'Confirm deletion')}
          </button>
        </div>
      </Dialog>
    </main>
  );
}
