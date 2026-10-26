'use client';
import ChannelScope from '../product/ChannelScope';
import { useChannelContext } from '../product/useChannelContext';

import { NavIcon } from '../product/NavIcon';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { api } from '../../lib/api';
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  price_cents: string;
  currency: string;
  image_url: string | null;
  link_url: string | null;
  catalog_id: string | null;
  retailer_id: string | null;
  archived: boolean;
};
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  timezone: string;
  calendar_connection_id: string | null;
  enabled: boolean;
};
type Booking = {
  id: string;
  service_name: string;
  contact_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  calendar_status: string;
  calendar_error: string | null;
};
type Social = {
  id: string;
  channel_id: string;
  channel_name: string;
  kind: string;
  body: string;
  media_urls: string[];
  status: string;
  provider_id: string | null;
  error: string | null;
  scheduled_at: string | null;
};
export default function Commerce({ initialTab }: { initialTab?: string } = {}) {
  const { t } = useLocale();
  const [channelId, setChannelId] = useChannelContext();
  const [tab, setTab] = useState(initialTab ?? 'products'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState(''),
    [editing, setEditing] = useState<Product | null>(null),
    [postKind, setPostKind] = useState('text');
  const products = useData<Product[]>('/commerce/products', []),
    services = useData<Service[]>('/commerce/services', []),
    bookings = useData<Booking[]>('/commerce/appointments', []),
    posts = useData<Social[]>('/commerce/social', []),
    channels = useData<{ id: string; name: string; type: string }[]>('/channels', []),
    contacts = useData<{ items: { id: string; name: string; email: string | null }[] }>(
      '/crm/contacts?limit=100',
      { items: [] },
    ),
    connections = useData<{ id: string; name: string; provider: string; enabled: boolean }[]>(
      '/integrations',
      [],
    );
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      setResult(JSON.stringify(await fn(), null, 2));
      await Promise.all([products.reload(), services.reload(), bookings.reload(), posts.reload()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack commerce-page">
      <ChannelScope
        value={channelId}
        onChange={setChannelId}
        channels={channels.data}
        workspaceWide
      />
      <h1>
        {initialTab === 'social'
          ? t('النشر الاجتماعي', 'Social Posting')
          : initialTab === 'appointments'
            ? t('حجز المواعيد', 'Appointment Booking')
            : initialTab === 'products'
              ? t('كتالوج المنتجات', 'Product Catalog')
              : t('التجارة والمواعيد والنشر', 'Commerce, appointments and publishing')}
      </h1>
      {!initialTab && (
        <nav className="form-actions">
          {[
            ['products', 'المنتجات', 'Products'],
            ['appointments', 'المواعيد', 'Appointments'],
            ['social', 'النشر الاجتماعي', 'Social publishing'],
          ].map(([id, ar, en]) => (
            <button className="btn" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {t(ar, en)}
            </button>
          ))}
          <Link className="btn" href="/dashboard/flows">
            {t('مدير البوت', 'Bot manager')}
          </Link>
          <Link className="btn" href="/dashboard/integrations">
            {t('تفويض Calendar والتكاملات', 'Calendar authorization and integrations')}
          </Link>
        </nav>
      )}
      {(error || products.error || services.error || posts.error) && (
        <p className="notice error" role="alert">
          {error || products.error || services.error || posts.error}
        </p>
      )}
      {tab === 'products' && (
        <>
          <form
            key={editing?.id ?? 'new'}
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api('/commerce/products' + (editing ? '/' + editing.id : ''), {
                  method: editing ? 'PATCH' : 'POST',
                  body: JSON.stringify({
                    sku: f.get('sku'),
                    name: f.get('name'),
                    description: f.get('description'),
                    priceCents: f.get('price'),
                    currency: f.get('currency'),
                    ...(f.get('image') ? { imageUrl: f.get('image') } : {}),
                    ...(f.get('link') ? { linkUrl: f.get('link') } : {}),
                    ...(f.get('catalog') ? { catalogId: f.get('catalog') } : {}),
                    ...(f.get('retailer') ? { retailerId: f.get('retailer') } : {}),
                    archived: f.get('archived') === 'on',
                  }),
                }),
              );
            }}
          >
            <h2>{editing ? t('تعديل المنتج', 'Edit product') : t('منتج جديد', 'New product')}</h2>
            <div className="form-grid">
              <label className="field">
                SKU
                <input name="sku" required defaultValue={editing?.sku} />
              </label>
              <label className="field">
                {t('اسم المنتج', 'Product name')}
                <input name="name" required maxLength={120} defaultValue={editing?.name} />
              </label>
              <label className="field">
                {t('السعر بأصغر وحدة (100 = 1.00)', 'Price in minor units (100 = 1.00)')}
                <input
                  name="price"
                  pattern="[0-9]{1,15}"
                  required
                  defaultValue={editing?.price_cents ?? '0'}
                />
              </label>
              <label className="field">
                {t('العملة', 'Currency')}
                <input
                  name="currency"
                  pattern="[A-Z]{3}"
                  defaultValue={editing?.currency ?? 'EGP'}
                  required
                />
              </label>
            </div>
            <label className="field">
              {t('الوصف', 'Description')}
              <textarea name="description" maxLength={1000} defaultValue={editing?.description} />
            </label>
            <label className="field">
              {t('صورة مستضافة HTTPS', 'Hosted image URL')}
              <input type="url" name="image" defaultValue={editing?.image_url ?? ''} />
            </label>
            <label className="field">
              {t('رابط المنتج', 'Product URL')}
              <input type="url" name="link" defaultValue={editing?.link_url ?? ''} />
            </label>
            <details>
              <summary>
                {t('معرفات كتالوج WhatsApp المعتمد', 'Approved WhatsApp catalog IDs')}
              </summary>
              <label className="field">
                Catalog ID
                <input name="catalog" defaultValue={editing?.catalog_id ?? ''} />
              </label>
              <label className="field">
                Retailer ID
                <input name="retailer" defaultValue={editing?.retailer_id ?? ''} />
              </label>
              <p>
                {t(
                  'الكتالوج الأصلي يتطلب اعتماد Meta؛ السعر الفعلي في المزود هو المرجع. بطاقة الرابط تستخدم السعر المحلي.',
                  'Native catalogs require Meta approval; provider pricing is authoritative. Link cards use the local price.',
                )}
              </p>
            </details>
            <label>
              <input type="checkbox" name="archived" defaultChecked={editing?.archived} />
              {t('مؤرشف', 'Archived')}
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {t('حفظ المنتج', 'Save product')}
              </button>
              {editing && (
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  {t('منتج جديد', 'New product')}
                </button>
              )}
            </div>
          </form>
          <section className="card stack">
            {products.data.map((p) => (
              <article className="form-actions" key={p.id}>
                <strong>{p.name}</strong>
                <span>
                  {p.price_cents} {p.currency} {t('وحدة صغرى', 'minor units')}
                </span>
                <span>{p.archived ? t('مؤرشف', 'Archived') : p.sku}</span>
                <button className="btn" onClick={() => setEditing(p)}>
                  {t('تعديل', 'Edit')}
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void act(() => api(`/commerce/products/${p.id}/preview`, { method: 'POST' }))
                  }
                >
                  {t('معاينة دون إرسال', 'Preview without sending')}
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      {tab === 'appointments' && (
        <>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api('/commerce/services', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: f.get('name'),
                    durationMinutes: Number(f.get('duration')),
                    timezone: f.get('timezone'),
                    schedule: JSON.parse(String(f.get('schedule') || '{}')),
                    ...(f.get('connection') ? { calendarConnectionId: f.get('connection') } : {}),
                    calendarId: f.get('calendar') || 'primary',
                  }),
                }),
              );
            }}
          >
            <h2>{t('إنشاء خدمة مواعيد', 'Create appointment service')}</h2>
            <label className="field">
              {t('اسم الخدمة', 'Service name')}
              <input required name="name" />
            </label>
            <label className="field">
              {t('المدة بالدقائق', 'Duration in minutes')}
              <input name="duration" type="number" min={5} max={1440} defaultValue={30} required />
            </label>
            <label className="field">
              {t('المنطقة الزمنية', 'Timezone')}
              <input name="timezone" defaultValue="Africa/Cairo" required />
            </label>
            <label className="field">
              {t(
                'حساب Calendar اختياري — المزامنة تحتاج أمرًا منفصلًا',
                'Optional Calendar account — synchronization requires a separate action',
              )}
              <select name="connection">
                <option value="">{t('حجز محلي فقط', 'Local booking only')}</option>
                {connections.data
                  .filter((c) => c.provider === 'google' && c.enabled)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Calendar ID
              <input name="calendar" defaultValue="primary" />
            </label>
            <details>
              <summary>{t('جدول أسبوعي اختياري JSON', 'Optional weekly schedule JSON')}</summary>
              <textarea
                name="schedule"
                rows={4}
                dir="ltr"
                defaultValue={'{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]]}'}
              />
            </details>
            <button className="btn" disabled={busy}>
              {t('حفظ الخدمة', 'Save service')}
            </button>
          </form>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const save =
                (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'save';
              void act(() =>
                api('/commerce/appointments', {
                  method: 'POST',
                  body: JSON.stringify({
                    serviceId: f.get('service'),
                    contactId: f.get('contact'),
                    start: new Date(String(f.get('start'))).toISOString(),
                    eventKey: crypto.randomUUID(),
                    dryRun: !save,
                  }),
                }),
              );
            }}
          >
            <h2>{t('فحص وحجز موعد', 'Check and book an appointment')}</h2>
            <label className="field">
              {t('الخدمة', 'Service')}
              <select required name="service">
                <option value="">{t('اختر', 'Choose')}</option>
                {services.data
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.duration_minutes}m · {s.timezone}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              {t('العميل', 'Contact')}
              <select required name="contact">
                <option value="">{t('اختر', 'Choose')}</option>
                {contacts.data.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email || c.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('وقت البدء حسب المنطقة الزمنية لجهازك', 'Start time in your device timezone')}
              <input name="start" type="datetime-local" required />
            </label>
            <div className="form-actions">
              <button className="btn" value="preview" disabled={busy}>
                {t('فحص التوفر دون حجز', 'Check availability without booking')}
              </button>
              <button className="btn btn-primary" value="save" disabled={busy}>
                {t('حجز محلي فعلي', 'Create local booking')}
              </button>
            </div>
          </form>
          <section className="card stack">
            <h2>{t('الحجوزات', 'Bookings')}</h2>
            {bookings.error && <p role="alert">{bookings.error}</p>}
            {bookings.data.map((b) => (
              <article className="card stack" key={b.id}>
                <strong>
                  {b.service_name} · {b.contact_name}
                </strong>
                <time dateTime={b.starts_at}>{new Date(b.starts_at).toLocaleString()}</time>
                <span>
                  {b.status} · Calendar: {b.calendar_status}
                </span>
                {b.calendar_error && <p>{b.calendar_error}</p>}
                <div className="form-actions">
                  <button
                    className="btn"
                    disabled={busy || b.status !== 'confirmed'}
                    onClick={() =>
                      void act(() =>
                        api(`/commerce/appointments/${b.id}/cancel`, { method: 'POST' }),
                      )
                    }
                  >
                    {t('إلغاء الحجز المحلي', 'Cancel local booking')}
                  </button>
                  {b.calendar_status !== 'not_requested' && (
                    <button
                      className="btn"
                      disabled={busy || b.status !== 'confirmed'}
                      onClick={() => {
                        if (
                          confirm(
                            t(
                              'تفويض إنشاء حدث Calendar خارجي لهذا الحجز دون دعوات بريدية؟',
                              'Authorize creating an external Calendar event without email invitations?',
                            ),
                          )
                        )
                          void act(() =>
                            api(`/commerce/appointments/${b.id}/calendar`, {
                              method: 'POST',
                              body: JSON.stringify({ confirm: true }),
                            }),
                          );
                      }}
                    >
                      {t('مزامنة Calendar بإذن صريح', 'Explicitly authorize Calendar sync')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {tab === 'social' && (
        <>
          <section
            className="social-posting-modes"
            aria-label={t('اختيار نوع المنشور', 'Choose a post format')}
          >
            {[
              [
                'image',
                'campaigns',
                'منشور متعدد الوسائط',
                'Multimedia post',
                'نص وصورة أو فيديو',
                'Text, image or video',
              ],
              [
                'cta',
                'flows',
                'منشور بدعوة لاتخاذ إجراء',
                'CTA post',
                'رابط واضح لاتخاذ الخطوة التالية',
                'A link to the next action',
              ],
              [
                'carousel',
                'channels',
                'منشور شرائح أو فيديو',
                'Carousel / video post',
                'مجموعة صور أو فيديو لحسابك',
                'Multiple images or a video',
              ],
            ].map(([kind, icon, ar, en, descriptionAr, descriptionEn]) => (
              <article className="card stack" key={kind}>
                <span className="tile-icon">
                  <NavIcon name={icon} />
                </span>
                <h2>{t(ar, en)}</h2>
                <p>{t(descriptionAr, descriptionEn)}</p>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={postKind === kind}
                  onClick={() => {
                    setPostKind(kind);
                    document
                      .getElementById('social-draft-form')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {t('إعداد المسودة', 'Prepare draft')}
                </button>
              </article>
            ))}
          </section>
          <p className="notice">
            {t(
              'الحفظ والمعاينة لا ينشران. النشر والجدولة يتطلبان إجراءً منفصلًا وصلاحيات Meta واعتماد المشغل.',
              'Saving and previewing do not publish. Publishing and scheduling require separate authorization, Meta permissions and operator enablement.',
            )}
          </p>
          <form
            id="social-draft-form"
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api('/commerce/social', {
                  method: 'POST',
                  body: JSON.stringify({
                    channelId: f.get('channel'),
                    kind: postKind,
                    body: f.get('body'),
                    mediaUrls: String(f.get('media') || '')
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                    ...(f.get('link') ? { linkUrl: f.get('link') } : {}),
                  }),
                }),
              );
            }}
          >
            <h2>{t('مسودة منشور', 'Post draft')}</h2>
            <label className="field">
              {t(
                'الصفحة أو حساب Instagram الاحترافي',
                'Facebook page or Instagram professional account',
              )}
              <select required name="channel">
                <option value="">{t('اختر', 'Choose')}</option>
                {channels.data
                  .filter(
                    (c) =>
                      ['facebook', 'instagram'].includes(c.type) &&
                      (!channelId || c.id === channelId),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.type}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              {t('نوع المنشور', 'Post type')}
              <select value={postKind} onChange={(e) => setPostKind(e.target.value)}>
                {['text', 'image', 'video', 'carousel', 'cta'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('المحتوى', 'Content')}
              <textarea name="body" required maxLength={4096} rows={5} />
            </label>
            <label className="field">
              {t('روابط HTTPS — رابط واحد لكل سطر', 'HTTPS media URLs — one per line')}
              <textarea name="media" dir="ltr" rows={4} />
            </label>
            <label className="field">
              {t('رابط CTA', 'CTA link')}
              <input type="url" name="link" required={postKind === 'cta'} />
            </label>
            <button className="btn" disabled={busy}>
              {t('حفظ مسودة فقط', 'Save draft only')}
            </button>
          </form>
          <section className="card stack">
            {posts.data
              .filter((p) => !channelId || p.channel_id === channelId)
              .map((p) => (
                <article className="card stack" key={p.id}>
                  <strong>
                    {p.channel_name} · {p.kind} · {p.status}
                  </strong>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p>
                  <div className="form-actions">
                    {p.media_urls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        {t('عرض وسيط', 'View media')}
                      </a>
                    ))}
                  </div>
                  {p.provider_id && <code>{p.provider_id}</code>}
                  {p.error && <p role="alert">{p.error}</p>}
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void act(() => api(`/commerce/social/${p.id}/preview`, { method: 'POST' }))
                    }
                  >
                    {t('معاينة Mock', 'Mock preview')}
                  </button>
                  {p.status === 'draft' && (
                    <form
                      className="form-actions"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (
                          !confirm(
                            t(
                              'تفويض النشر الخارجي في الموعد المحدد؟',
                              'Authorize external publication at the selected time?',
                            ),
                          )
                        )
                          return;
                        const f = new FormData(e.currentTarget);
                        void act(() =>
                          api(`/commerce/social/${p.id}/queue`, {
                            method: 'POST',
                            body: JSON.stringify({
                              confirm: true,
                              scheduledAt: new Date(String(f.get('at'))).toISOString(),
                            }),
                          }),
                        );
                      }}
                    >
                      <label>
                        {t('الموعد حسب جهازك', 'Schedule in device timezone')}
                        <input name="at" type="datetime-local" required />
                      </label>
                      <button className="btn" disabled={busy}>
                        {t('تفويض الجدولة', 'Authorize scheduling')}
                      </button>
                    </form>
                  )}
                  {['failed', 'ambiguous'].includes(p.status) && (
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            t(
                              'هل راجعت المزود وتحققت أن المنشور السابق غير منشور؟ ستُنشأ مسودة جديدة فقط.',
                              'Have you checked the provider and confirmed the previous post is unpublished? A new draft only will be created.',
                            ),
                          )
                        )
                          void act(() =>
                            api(`/commerce/social/${p.id}/retry-draft`, {
                              method: 'POST',
                              body: JSON.stringify({ reconciled: true }),
                            }),
                          );
                      }}
                    >
                      {t('مسودة إعادة محاولة بعد المراجعة', 'Retry draft after reconciliation')}
                    </button>
                  )}
                </article>
              ))}
          </section>
        </>
      )}
      {result && (
        <pre
          className="card"
          dir="ltr"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {result}
        </pre>
      )}
    </section>
  );
}
