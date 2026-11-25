'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';
import ProductCatalog from './ProductCatalog';
import CommerceOrders from './CommerceOrders';
import { AppointmentHours, readAppointmentHours } from './AppointmentHours';
import { checkoutEnabled } from './CheckoutEditor';
import catalogStyles from './product-catalog.module.css';

import DataSourcesPanel from './DataSourcesPanel';
import ChannelScope from '../product/ChannelScope';
import { useChannelContext } from '../product/useChannelContext';
import { channelHref } from '../../lib/channel-context';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { api } from '../../lib/api';
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
export default function Commerce({ initialTab }: { initialTab?: string } = {}) {
  const { t } = useLocale();
  const [channelId, setChannelId] = useChannelContext();
  const [tab, setTab] = useState(initialTab ?? 'products'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState('');
  const [orderOrigin, setOrderOrigin] = useState<{ conversationId: string; channelId: string }>();
  useEffect(() => {
    if (!checkoutEnabled || initialTab) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get('tab') === 'orders') setTab('orders');
    const conversationId = query.get('conversation');
    const channelId = query.get('channel');
    const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    if (conversationId && channelId && uuid.test(conversationId) && uuid.test(channelId)) {
      setOrderOrigin({ conversationId, channelId });
      setTab('orders');
    }
  }, [initialTab]);
  const services = useData<Service[]>(tab === 'appointments' ? '/commerce/services' : null, []),
    bookings = useData<Booking[]>(tab === 'appointments' ? '/commerce/appointments' : null, []),
    channels = useData<{ id: string; name: string; type: string }[]>('/channels', []),
    contacts = useData<{ items: { id: string; name: string; email: string | null }[] }>(
      tab === 'orders' || tab === 'appointments' ? '/crm/contacts?limit=100' : null,
      { items: [] },
    ),
    connections = useData<{ id: string; name: string; provider: string; enabled: boolean }[]>(
      tab === 'appointments' ? '/integrations' : null,
      [],
    );
  const actionLock = useRef(false);
  async function act(fn: () => Promise<unknown>, success?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setResult('');
    setError('');
    try {
      const response = (await fn()) as {
        available?: boolean;
        persisted?: boolean;
        start?: string;
        end?: string;
        content?: { text?: string };
      };
      setResult(
        response?.available && response.persisted === false
          ? t('الموعد متاح دون إنشاء حجز.', 'The time is available; no booking was created.') +
              (response.start && response.end
                ? ` ${new Date(response.start).toLocaleString()} — ${new Date(response.end).toLocaleString()}`
                : '')
          : success || response?.content?.text || t('تم تنفيذ الإجراء.', 'Action completed.'),
      );
      await Promise.all([services.reload(), bookings.reload()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const catalogNavigation = (
    <nav
      className={catalogStyles.commerceNavigation}
      aria-label={t('التنقل بين المنتجات ومصادرها', 'Product sections')}
    >
      {[
        ['products', 'المنتجات', 'Products'],
        ['sources', 'الاستيراد والمزامنة', 'Import & sync'],
        ['appointments', 'المواعيد', 'Appointments'],
        ...(checkoutEnabled ? [['orders', 'الطلبات', 'Orders']] : []),
      ]
        .filter(([id]) => !initialTab || id !== 'appointments')
        .map(([id, ar, en]) => (
          <button className={catalogStyles.commerceTab} key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {t(ar, en)}
          </button>
        ))}
    </nav>
  );
  const contextActions = (
    <div className={catalogStyles.commerceContextActions}>
      <Link className="btn" href={channelHref('/dashboard/flows?section=bot_reply', channelId)}>
        {initialTab === 'products'
          ? t('الانتقال إلى ردود البوت', 'Go to bot replies')
          : t('العودة إلى مدير البوت', 'Back to bot manager')}
      </Link>
      {tab === 'appointments' && (
        <Link className="btn" href="/dashboard/integrations">
          {t('تفويض Calendar والتكاملات', 'Calendar authorization and integrations')}
        </Link>
      )}
    </div>
  );
  const channelScope = (
    <ChannelScope value={channelId} onChange={setChannelId} channels={channels.data} workspaceWide />
  );
  return (
    <section className={`commerce-page ${catalogStyles.commerceWorkspace}`}>
      <header className={catalogStyles.commerceHeader}>
        <h1>
          {initialTab === 'appointments'
            ? t('حجز المواعيد', 'Appointment Booking')
            : initialTab === 'products'
              ? t('كتالوج المنتجات', 'Product Catalog')
              : t('التجارة والمواعيد', 'Commerce and appointments')}
        </h1>
        {initialTab !== 'appointments' && catalogNavigation}
        {initialTab && contextActions}
      </header>
      {initialTab === 'appointments' && channelScope}
      {!initialTab && (
        <details className="card">
          <DisclosureSummary>{t('سياق القناة', 'Channel context')}</DisclosureSummary>
          {channelScope}
          {contextActions}
        </details>
      )}
      {tab === 'appointments' && (error || services.error) && (
        <p className="notice error" role="alert">
          {error || services.error}
        </p>
      )}
      {tab === 'sources' && <DataSourcesPanel />}
      {tab === 'orders' && checkoutEnabled && <CommerceOrders contacts={contacts.data.items} origin={orderOrigin}/>}
      {tab === 'products' && <ProductCatalog />}
      {tab === 'appointments' && (
        <div className={catalogStyles.appointmentWorkspace}>
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
                    schedule: readAppointmentHours(f, t),
                    ...(f.get('connection') ? { calendarConnectionId: f.get('connection') } : {}),
                    calendarId: f.get('calendar') || 'primary',
                  }),
                }),
                t('تم حفظ خدمة المواعيد.', 'Appointment service saved.'),
              );
            }}
          >
            <h2>{t('إنشاء خدمة مواعيد', 'Create appointment service')}</h2>
            <label className="field">
              {t('اسم الخدمة', 'Service name')}
              <input required name="name" maxLength={120} />
            </label>
            <label className="field">
              {t('المدة بالدقائق', 'Duration in minutes')}
              <input name="duration" type="number" min={5} max={1440} defaultValue={30} required />
            </label>
            <AppointmentHours />
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
                save ? t('تم إنشاء الحجز المحلي.', 'Local booking created.') : undefined,
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
          <section className={`card stack ${catalogStyles.appointmentBookings}`}>
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
        </div>
      )}
      {result && (
        <p role="status" style={{ whiteSpace: 'pre-wrap' }}>
          {result}
        </p>
      )}
    </section>
  );
}
