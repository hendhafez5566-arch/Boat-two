'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { statusLabel } from '../product/status';
import { Dialog } from '../product/ProductUI';
import { api } from '../../lib/api';
import {
  SOCIAL_FORMATS,
  SocialFormat,
  SocialPost,
  socialFormat,
  socialMedia,
  socialKind,
} from '../../lib/social-posts';
import styles from '../../app/dashboard/social/social.module.css';
type Channel = { id: string; name: string; type: string; status: string };
export default function SocialWorkspace({
  format,
  create = false,
}: {
  format: SocialFormat;
  create?: boolean;
}) {
  const { t } = useLocale();
  const descriptor = SOCIAL_FORMATS[format];
  const posts = useData<SocialPost[]>('/commerce/social', []),
    channels = useData<Channel[]>('/channels', []);
  const [search, setSearch] = useState(''),
    [channel, setChannel] = useState(''),
    [kindFilter, setKindFilter] = useState('');
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const [kind, setKind] = useState(
    format === 'cta' ? 'cta' : format === 'carousel' ? 'carousel' : 'text',
  );
  const [body, setBody] = useState(''),
    [name, setName] = useState(''),
    [media, setMedia] = useState(''),
    [link, setLink] = useState('');
  const [preview, setPreview] = useState<SocialPost | null>(null),
    [scheduling, setScheduling] = useState<SocialPost | null>(null);
  const [editing, setEditing] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!create || posts.loading || initialized.current) return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      initialized.current = true;
      return;
    }
    const p = posts.data.find((p) => p.id === id && socialFormat(p) === format);
    if (!p || p.status !== 'draft') {
      setError(t('المسودة غير متاحة للتعديل.', 'Draft unavailable for editing.'));
      return;
    }
    setEditing(id);
    setName(p.name || '');
    setKind(socialKind(p));
    setBody(p.body);
    setMedia(p.media_urls.join('\n'));
    setLink(p.link_url || '');
    setChannel(p.channel_id);
    initialized.current = true;
  }, [posts.loading, posts.data, create, format, t]);
  const accounts = channels.data.filter((c) =>
    format === 'multimedia' ? ['facebook', 'instagram'].includes(c.type) : c.type === 'facebook',
  );
  const kindLabels: Record<string, string> = {
    text: t('نص', 'Text'),
    link: t('رابط', 'Link'),
    image: t('صورة / صور متعددة', 'Image / Carousel'),
    video: t('فيديو', 'Video'),
    carousel: t('صور متعددة', 'Carousel'),
    cta: t('دعوة لاتخاذ إجراء', 'Call to action'),
  };
  const filtered = posts.data.filter(
    (p) =>
      socialFormat(p) === format &&
      (!channel || p.channel_id === channel) &&
      (!kindFilter || socialKind(p) === kindFilter) &&
      (p.name + ' ' + p.body + ' ' + p.id).toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size)),
    current = Math.min(page, pages),
    rows = filtered.slice((current - 1) * size, current * size);
  const base = '/dashboard/social/' + format;
  async function act(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const imageUrls = socialMedia(media);
  const chosen = accounts.find((c) => c.id === channel);
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>
            {t(descriptor.ar, descriptor.en)}
            {create ? ' — ' + t('إنشاء', 'Create') : ''}
          </h1>
          <p>{t(descriptor.descriptionAr, descriptor.descriptionEn)}</p>
        </div>
        {!create && (
          <Link className="btn btn-primary" href={base + '/create'}>
            ＋ {t('إنشاء منشور جديد', 'Create New Post')}
          </Link>
        )}
      </header>
      <nav className={styles.breadcrumb}>
        <Link href="/dashboard/social">{t('النشر الاجتماعي', 'Social Posting')}</Link> /{' '}
        {create ? (
          <Link href={base}>{t(descriptor.ar, descriptor.en)}</Link>
        ) : (
          t(descriptor.ar, descriptor.en)
        )}
        {create ? ' / ' + t('إنشاء', 'Create') : ''}
      </nav>
      {(error || posts.error || channels.error) && (
        <p role="alert" className="notice error">
          {error || posts.error || channels.error}
        </p>
      )}
      {create ? (
        <div className={styles.composer}>
          <form
            className={styles.card}
            onSubmit={(e) => {
              e.preventDefault();
              if (!chosen) {
                setError(t('اختر حسابًا.', 'Choose an account.'));
                return;
              }
              if (new URLSearchParams(window.location.search).has('id') && !editing) {
                setError(t('المسودة غير متاحة.', 'Draft unavailable.'));
                return;
              }
              void act(async () => {
                await api('/commerce/social' + (editing ? '/' + editing : ''), {
                  method: editing ? 'PATCH' : 'POST',
                  body: JSON.stringify({
                    name,
                    format,
                    channelId: channel,
                    kind:
                      kind === 'link'
                        ? 'text'
                        : kind === 'image' && imageUrls.length > 1
                          ? 'carousel'
                          : kind,
                    body,
                    mediaUrls: imageUrls,
                    ...(link ? { linkUrl: link } : {}),
                  }),
                });
                window.location.assign(base);
              });
            }}
          >
            {!channels.loading && !channels.error && accounts.length === 0 && (
              <p role="status" className="notice">
                {t(
                  format === 'multimedia'
                    ? 'اربط حساب Facebook أو Instagram أولًا لتتمكن من حفظ المنشور.'
                    : 'اربط صفحة Facebook أولًا لتتمكن من حفظ المنشور.',
                  format === 'multimedia'
                    ? 'Connect a Facebook or Instagram account before saving a post.'
                    : 'Connect a Facebook page before saving a post.',
                )}{' '}
                <Link href="/dashboard/channels">{t('ربط حساب', 'Connect account')}</Link>
              </p>
            )}
            <label className="field">
              {t('الصفحة أو الحساب', 'Page or account')}
              <select required value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">{t('اختر', 'Choose')}</option>
                {accounts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.type}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.tabs} role="group" aria-label={t('نوع المنشور', 'Post type')}>
              {(format === 'cta'
                ? ['cta']
                : format === 'carousel'
                  ? ['carousel', 'video']
                  : ['text', 'link', 'image', 'video']
              ).map((k) => (
                <button
                  type="button"
                  key={k}
                  aria-pressed={kind === k || (k === 'image' && kind === 'carousel')}
                  onClick={() => {
                    setKind(k);
                    setMedia('');
                    setLink('');
                  }}
                >
                  {kindLabels[k]}
                </button>
              ))}
            </div>
            <label className="field">
              {t('اسم الحملة', 'Campaign Name')}
              <input
                required
                maxLength={120}
                pattern=".*\S.*"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              {t('النص', 'Text')}
              <textarea
                required
                maxLength={4096}
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            {['image', 'carousel', 'video'].includes(kind) && (
              <label className="field">
                {t('رابط الوسائط HTTPS — كل رابط في سطر', 'HTTPS media URLs — one per line')}
                <textarea
                  required
                  rows={3}
                  dir="ltr"
                  value={media}
                  onChange={(e) => setMedia(e.target.value)}
                />
              </label>
            )}
            {(kind === 'link' || kind === 'cta') && (
              <label className="field">
                {t('الرابط', 'Link')}
                <input
                  type="url"
                  required={kind === 'cta' || kind === 'link'}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </label>
            )}
            <footer className={styles.formFooter}>
              <Link href={base}>{t('رجوع', 'Back')}</Link>
              <button
                className="btn btn-primary"
                disabled={busy || posts.loading || channels.loading || !!channels.error || !chosen}
              >
                {t('حفظ مسودة', 'Save Draft')}
              </button>
            </footer>
          </form>
          <section
            className={`${styles.card} ${styles.preview}`}
            aria-label={t('معاينة المحتوى', 'Content preview')}
          >
            <strong>{chosen?.name || t('معاينة المنشور', 'Post preview')}</strong>
            <p>{body || t('النص يظهر هنا…', 'Text goes here…')}</p>
            {kind !== 'video' &&
              imageUrls
                .filter((url) => url.startsWith('https://'))
                .map((url) => <img key={url} src={url} alt="" />)}
            {kind === 'video' && imageUrls[0]?.startsWith('https://') && (
              <video controls src={imageUrls[0]} />
            )}
            <small>{link}</small>
          </section>
        </div>
      ) : (
        <section className={styles.card}>
          <div className={styles.filters}>
            <select
              aria-label={t('نوع المنشور', 'Post type')}
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('أي نوع', 'Any Type')}</option>
              {(format === 'cta'
                ? ['cta']
                : format === 'carousel'
                  ? ['carousel', 'video']
                  : ['text', 'link', 'image', 'carousel', 'video']
              ).map((k) => (
                <option key={k} value={k}>
                  {kindLabels[k]}
                </option>
              ))}
            </select>
            <select
              aria-label={t('الصفحة', 'Page')}
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('كل الصفحات والحسابات', 'All Pages / Accounts')}</option>
              {accounts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label={t('بحث المنشورات', 'Search posts')}
            />
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {[
                    '#',
                    t('معرف الحملة', 'Campaign ID'),
                    t('الاسم', 'Name'),
                    t('نوع الحملة', 'Campaign Type'),
                    t('الناشر', 'Publisher'),
                    t('نوع المنشور', 'Post Type'),
                    t('الإجراءات', 'Actions'),
                    t('الحالة', 'Status'),
                    t('موعد النشر', 'Scheduled At'),
                    t('الخطأ', 'Error Message'),
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.id}>
                    <td>{(current - 1) * size + i + 1}</td>
                    <td>{p.id}</td>
                    <td>{p.name || '—'}</td>
                    <td>{t(descriptor.ar, descriptor.en)}</td>
                    <td>{p.channel_name}</td>
                    <td>{socialKind(p)}</td>
                    <td>
                      <div className={styles.actions}>
                        <button type="button" onClick={() => setPreview(p)}>
                          {t('عرض', 'View')}
                        </button>
                        {p.status === 'draft' && (
                          <>
                            <Link href={base + '/create?id=' + encodeURIComponent(p.id)}>
                              {t('تعديل', 'Edit')}
                            </Link>
                            <button type="button" disabled={busy} onClick={() => setScheduling(p)}>
                              {t('جدولة', 'Schedule')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td>{statusLabel(p.status, t)}</td>
                    <td>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : '—'}</td>
                    <td>{p.error || '—'}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={10}>
                      {posts.loading
                        ? t('جارٍ التحميل…', 'Loading…')
                        : posts.error
                          ? '—'
                          : t('لا توجد بيانات في الجدول', 'No data available in table')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className={styles.pagination}>
            <select
              aria-label={t('الصفوف', 'Rows')}
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span>
              {filtered.length ? (current - 1) * size + 1 : 0}–
              {Math.min(current * size, filtered.length)} / {filtered.length}
            </span>
            <button disabled={current === 1} onClick={() => setPage(current - 1)}>
              {t('السابق', 'Previous')}
            </button>
            <button disabled={current === pages} onClick={() => setPage(current + 1)}>
              {t('التالي', 'Next')}
            </button>
          </footer>
        </section>
      )}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title={t('معاينة المنشور', 'Post preview')}
      >
        {preview && (
          <div className={styles.preview}>
            <strong>{preview.name || preview.channel_name}</strong>
            <p>{preview.body}</p>
            <p>{preview.link_url}</p>
            {preview.media_urls
              .filter((url) => url.startsWith('https://'))
              .map((url) =>
                preview.kind === 'video' ? (
                  <video key={url} controls src={url} />
                ) : (
                  <img key={url} src={url} alt="" />
                ),
              )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!scheduling}
        onClose={() => {
          if (!busy) setScheduling(null);
        }}
        title={t('جدولة النشر', 'Schedule post')}
      >
        {scheduling && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const at = String(new FormData(e.currentTarget).get('at'));
              if (
                !confirm(
                  t(
                    'نشر هذا المنشور خارجيًا في الموعد المحدد؟',
                    'Publish this post externally at the selected time?',
                  ),
                )
              )
                return;
              void act(async () => {
                await api('/commerce/social/' + scheduling.id + '/queue', {
                  method: 'POST',
                  body: JSON.stringify({ confirm: true, scheduledAt: new Date(at).toISOString() }),
                });
                setScheduling(null);
                await posts.reload();
              });
            }}
          >
            <p>{scheduling.name || scheduling.channel_name}</p>
            <label className="field">
              {t('الموعد حسب توقيت جهازك', 'Time in your device timezone')}
              <input name="at" type="datetime-local" required />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {t('تأكيد الجدولة', 'Confirm schedule')}
            </button>
          </form>
        )}
      </Dialog>
    </main>
  );
}
