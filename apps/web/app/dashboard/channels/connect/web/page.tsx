'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../../../../lib/api';
import { useData } from '../../../../../components/business/useData';
import { useLocale } from '../../../../../components/product/locale';
import { Dialog } from '../../../../../components/product/ProductUI';
import styles from '../../../../../components/product/meta-connection-page.module.css';
type Widget = {
  type: string;
  id: string;
  name: string;
  status: string;
  widgetSnippet?: string;
  settings?: Partial<typeof defaults> & {
    allowedOrigins?: string[];
    position?: string;
    verticalPosition?: string;
  };
};
const defaults = {
  title: '',
  website: '',
  themeBackground: '#fbfbfc',
  themeText: '#000000',
  bubbleBackground: '#ffffff',
  bubbleText: '#19181a',
  wallpaper: '#ffffff',
  logoUrl: '',
  font: 'system-ui',
  placement: 'bottom-left',
  startup: 'closed',
  offsetX: 10,
  offsetY: 10,
  loadingDelay: 0,
};
export default function WebchatConnectionPage() {
  const { t, language } = useLocale();
  const data = useData<Widget[]>('/channels', []),
    rows = data.data.filter((a) => a.type === 'web');
  const [open, setOpen] = useState(false),
    [form, setForm] = useState(defaults),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [code, setCode] = useState<Widget | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [editing, setEditing] = useState<Widget | null>(null);
  const visible = rows.filter((widget) =>
    [widget.name, ...(widget.settings?.allowedOrigins ?? [])].some((value) =>
      value.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  function openForm(widget: Widget | null) {
    setSaved('');
    setEditing(widget);
    setError('');
    const settings = widget?.settings;
    setForm(
      widget
        ? {
            ...defaults,
            ...settings,
            title: settings?.title ?? widget.name,
            website: settings?.allowedOrigins?.[0] ?? '',
            placement:
              (settings?.verticalPosition ?? 'bottom') + '-' + (settings?.position ?? 'left'),
          }
        : defaults,
    );
    setOpen(true);
  }
  const set = (key: string, value: string | number) => setForm((f) => ({ ...f, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const origin = new URL(form.website).origin;
      await api(editing ? '/channels/' + editing.id : '/channels', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(!editing && { type: 'web' }),
          name: form.title,
          settings: {
            title: form.title,
            allowedOrigins: [
              ...new Set([origin, ...(editing?.settings?.allowedOrigins?.slice(1) ?? [])]),
            ],
            themeBackground: form.themeBackground,
            themeText: form.themeText,
            bubbleBackground: form.bubbleBackground,
            bubbleText: form.bubbleText,
            wallpaper: form.wallpaper,
            logoUrl: form.logoUrl,
            font: form.font,
            position: form.placement.endsWith('left') ? 'left' : 'right',
            verticalPosition: form.placement.startsWith('top') ? 'top' : 'bottom',
            startup: form.startup,
            offsetX: form.offsetX,
            offsetY: form.offsetY,
            loadingDelay: form.loadingDelay,
            direction: language === 'ar' ? 'rtl' : 'ltr',
          },
        }),
      });
      setOpen(false);
      setForm(defaults);
      await data.reload();
      setSaved(
        editing
          ? t('تم حفظ إعدادات الويدجت.', 'Widget settings saved.')
          : t('تم إنشاء الويدجت.', 'Widget created.'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`stack ${styles.page}`}>
      <nav>
        <Link href="/dashboard/channels">{t('ربط الحساب', 'Connect Account')}</Link> / Webchat
      </nav>
      <div className="page-heading">
        <div>
          <h1>{t('تكامل Webchat', 'Webchat Integration')}</h1>
          <p>{t('أضف المحادثة المباشرة إلى موقعك.', 'Add live chat to your website.')}</p>
        </div>
      </div>
      <div className={styles.statistics}>
        {[
          [t('إجمالي الويدجت', 'Total Widgets'), rows.length],
          [t('نشط', 'Active'), rows.filter((a) => a.status === 'active').length],
          [t('غير نشط', 'Inactive'), rows.filter((a) => a.status !== 'active').length],
        ].map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{data.loading ? '—' : count}</strong>
          </div>
        ))}
      </div>
      <section className="card stack">
        <h2>{t('أنشئ ويدجت المحادثة المباشرة', 'Create Your Live Chat Widget')}</h2>
        <p>
          {t(
            'خصّص نافذة المحادثة وحدد المواقع التي يمكن عرضها عليها.',
            'Customize the chat window and choose the websites that can display it.',
          )}
        </p>
        <button
          className="btn btn-primary"
          style={{ alignSelf: 'start' }}
          onClick={() => openForm(null)}
        >
          {t('إنشاء ويدجت محادثة مباشرة', 'Create Live Chat Widget')}
        </button>
      </section>
      <section className="card stack">
        <h2>{t('ويدجت المحادثة', 'Your Chat Widgets')}</h2>
        <label>
          {t('بحث', 'Search')}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {saved && <p role="status">{saved}</p>}
        {data.error && (
          <div className="notice error">
            <p role="alert">{data.error}</p>
            <button type="button" className="btn" onClick={() => void data.reload()}>
              {t('إعادة تحميل الويدجت', 'Reload widgets')}
            </button>
          </div>
        )}
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                {[
                  t('اسم الويدجت', 'Widget Name'),
                  t('الموقع', 'Website'),
                  t('الحالة', 'Status'),
                  t('الإجراءات', 'Actions'),
                ].map((a) => (
                  <th key={a}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.settings?.allowedOrigins?.join(', ') || '—'}</td>
                  <td>{a.status === 'active' ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}</td>
                  <td>
                    <button className="btn" onClick={() => openForm(a)}>
                      {t('الإعدادات', 'Settings')}
                    </button>
                    {a.widgetSnippet && (
                      <button className="btn" onClick={() => {
                        setCopyMessage('');
                        setCode(a);
                      }}>
                        {t('كود التضمين', 'Get Embed Code')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && !data.loading && (
          <p>
            {rows.length
              ? t('لا توجد نتائج مطابقة.', 'No matching widgets.')
              : t('لا توجد ويدجت بعد.', 'No widgets yet.')}
          </p>
        )}
      </section>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={t('إعداد ويدجت المحادثة المباشرة', 'Set Up Your Live Chat Widget')}
      >
        <form className="stack" onSubmit={save}>
          <label>
            {t('عنوان نافذة المحادثة', 'Chatbox Display Title')}
            <input
              required
              maxLength={60}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <label>
            {t('رابط الموقع', 'Website URL')}
            <input
              required
              type="url"
              placeholder="https://example.com"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </label>
          <div className={styles.filters}>
            {[
              ['themeBackground', t('خلفية المظهر', 'Theme Background')],
              ['themeText', t('نص المظهر', 'Theme Text')],
              ['bubbleBackground', t('خلفية فقاعة المحادثة', 'Chat Bubble Background')],
              ['bubbleText', t('نص فقاعة المحادثة', 'Chat Bubble Text')],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  type="color"
                  value={String(form[key as keyof typeof form])}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label>
            {t('رابط شعار العلامة التجارية', 'Brand Logo URL')}
            <input
              type="url"
              placeholder="https://"
              value={form.logoUrl}
              onChange={(e) => set('logoUrl', e.target.value)}
            />
          </label>
          <label>
            {t('لون خلفية المحادثة', 'Wallpaper Color')}
            <input
              type="color"
              value={form.wallpaper}
              onChange={(e) => set('wallpaper', e.target.value)}
            />
          </label>
          <label>
            {t('الخط', 'Font')}
            <select
              aria-label={t('الخط', 'Font')}
              value={form.font}
              onChange={(e) => set('font', e.target.value)}
            >
              <option value="system-ui">System</option>
              <option>Arial</option>
              <option>Tahoma</option>
            </select>
          </label>
          <div className={styles.filters}>
            <label>
              {t('الموضع', 'Position')}
              <select
                aria-label={t('الموضع', 'Position')}
                value={form.placement}
                onChange={(e) => set('placement', e.target.value)}
              >
                {['top-left', 'bottom-left', 'top-right', 'bottom-right'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('حالة البداية', 'Startup State')}
              <select
                aria-label={t('حالة البداية', 'Startup State')}
                value={form.startup}
                onChange={(e) => set('startup', e.target.value)}
              >
                <option value="open">{t('مفتوح', 'Stay Open')}</option>
                <option value="closed">{t('مغلق', 'Stay Closed')}</option>
              </select>
            </label>
          </div>
          <div className={styles.filters}>
            {['X', 'Y'].map((axis) => (
              <label key={axis}>
                {t('الإزاحة', 'Offset')} {axis}
                <input
                  type="number"
                  min={0}
                  max={200}
                  required
                  value={axis === 'X' ? form.offsetX : form.offsetY}
                  onChange={(e) => set('offset' + axis, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <label>
            {t('تأخير الظهور', 'Loading Delay')} ({form.loadingDelay}s)
            <input
              type="range"
              min={0}
              max={30}
              value={form.loadingDelay}
              onChange={(e) => set('loadingDelay', Number(e.target.value))}
            />
          </label>
          <p className="muted">
            {t(
              'رفع ملفات الزوار وتبويبات مقالات المساعدة غير متاحة في الويدجت الحالي.',
              'Visitor file upload and help article tabs are not available in the current widget.',
            )}
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t('جارٍ الربط…', 'Connecting…') : t('ربط', 'Connect')}
          </button>
        </form>
      </Dialog>
      <Dialog
        open={!!code}
        onClose={() => setCode(null)}
        title={t('كود التضمين', 'Get Embed Code')}
      >
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {code?.widgetSnippet}
        </pre>
        <button
          type="button"
          className="btn"
          disabled={!code?.widgetSnippet}
          onClick={async () => {
            if (!code?.widgetSnippet) return;
            try {
              await navigator.clipboard.writeText(code.widgetSnippet);
              setCopyMessage(t('تم نسخ الكود.', 'Code copied.'));
            } catch {
              setCopyMessage(t('تعذر النسخ. حدّد الكود وانسخه يدويًا.', 'Select the code to copy it manually.'));
            }
          }}
        >
          {t('نسخ كود التضمين', 'Copy embed code')}
        </button>
        {copyMessage && <p role="status">{copyMessage}</p>}
      </Dialog>
    </main>
  );
}
