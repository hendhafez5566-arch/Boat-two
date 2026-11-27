'use client';
import { NavIcon } from '../product/NavIcon';
import { useTransientNotice } from '../product/useTransientNotice';
import ProductCatalog from './ProductCatalog';
import CommerceOrders from './CommerceOrders';
import { AppointmentHours, readAppointmentHours } from './AppointmentHours';
import { checkoutEnabled } from './CheckoutEditor';
import catalogStyles from './product-catalog.module.css';

import DataSourcesPanel from './DataSourcesPanel';
import ChannelScope from '../product/ChannelScope';
import { useChannelContext } from '../product/useChannelContext';
import { channelHref } from '../../lib/channel-context';

import { useRef, useState } from 'react';
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
export default function Commerce({
  initialTab, openOrders, orderId, orderOrigin,
}: {
  initialTab?: string;
  openOrders?: boolean;
  orderId?: string;
  orderOrigin?: { conversationId: string; channelId: string };
} = {}) {
  const { t } = useLocale();
  const [channelId, setChannelId] = useChannelContext();
  const [appointmentTab,setAppointmentTab]=useState<'bookings'|'book'|'services'>('bookings');
  const [tab, setTab] = useState(initialTab ?? (checkoutEnabled && openOrders ? 'orders' : 'products')),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState('');
  const [resultTemporary,setResultTemporary]=useState(false);
  useTransientNotice(resultTemporary?result:'',()=>setResult(''));
  const [bookingSearch,setBookingSearch]=useState('');
  const [bookingFilter,setBookingFilter]=useState('all');
  const [serviceFormOpen,setServiceFormOpen]=useState(false);
  const [calendarConnection,setCalendarConnection]=useState('');
  const statusLabel=(status:string)=>({confirmed:t('مؤكد','Confirmed'),cancelled:t('ملغى','Cancelled')} as Record<string,string>)[status]||status;
  const calendarLabel=(status:string)=>({not_requested:t('حجز محلي','Local booking'),synced:t('تمت المزامنة','Synced'),pending:t('بانتظار المزامنة','Pending'),failed:t('تعذرت المزامنة','Sync failed')} as Record<string,string>)[status]||status;
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
      if(response?.available===false){setError(response?.content?.text||t('الموعد غير متاح. اختر توقيتًا آخر.','This time is unavailable. Choose another time.'));return;}
      setResultTemporary(response?.persisted!==false);
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
            <NavIcon name={({products:'commerce',sources:'upload',appointments:'calendar',orders:'list'} as Record<string,string>)[id]||'grid'}/>{t(ar, en)}
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
      {!orderId && <header className={catalogStyles.commerceHeader}>
        <h1><NavIcon name="commerce"/>
          {initialTab === 'appointments'
            ? t('حجز المواعيد', 'Appointment Booking')
            : initialTab === 'products'
              ? t('كتالوج المنتجات', 'Product Catalog')
              : t('التجارة والمواعيد', 'Commerce and appointments')}
        </h1>
        {initialTab !== 'appointments' && catalogNavigation}
        {initialTab && contextActions}
      </header>}
      {initialTab === 'appointments' && channelScope}
      {!initialTab && tab !== 'orders' && (
        <div className={catalogStyles.scopeBar}>{channelScope}{contextActions}</div>
      )}
      {tab === 'appointments' && (error || services.error) && (
        <p className="notice error" role="alert">
          {error || services.error}
        </p>
      )}
      {tab === 'sources' && <DataSourcesPanel />}
      {tab === 'orders' && checkoutEnabled && <CommerceOrders contacts={contacts.data.items} origin={orderOrigin} orderId={orderId}/>}
      {tab === 'products' && <ProductCatalog />}
      {tab === 'appointments' && (
        <div className={catalogStyles.appointments}>
          <nav className={catalogStyles.appointmentNav} aria-label={t('إدارة المواعيد','Appointment management')}>{([['bookings',t('الحجوزات','Bookings')],['book',t('حجز موعد','Book appointment')],['services',t('الخدمات','Services')]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={appointmentTab===key} onClick={()=>setAppointmentTab(key)}><NavIcon name={key==='bookings'?'list':key==='book'?'calendar':'settings'}/>{label}</button>)}</nav>
          <section className={catalogStyles.appointmentPanel} hidden={appointmentTab!=='services'}>
            <div className={catalogStyles.appointmentToolbar}><h2><NavIcon name="calendar"/>{t('الخدمات الحالية','Existing services')}</h2><button type="button" className="btn btn-primary" aria-expanded={serviceFormOpen} onClick={()=>setServiceFormOpen(v=>!v)}><NavIcon name="plus"/>{serviceFormOpen?t('إخفاء النموذج','Hide form'):t('خدمة جديدة','New service')}</button></div>
            {services.loading&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
            {!services.loading&&!services.error&&!services.data.length&&<p className="muted">{t('لم تُضف خدمات بعد','No services yet')}</p>}
            {services.data.map(s=><div key={s.id} className={catalogStyles.serviceRow}><strong><NavIcon name="calendar"/>{s.name}</strong><span><NavIcon name="stopwatch"/>{s.duration_minutes} {t('دقيقة','min')} · {s.timezone}</span><span className="workbench-state" data-active={s.enabled}>{s.enabled?t('مفعّلة','Enabled'):t('متوقفة','Disabled')}</span></div>)}
          </section>
          <form hidden={appointmentTab!=='services'||!serviceFormOpen}
            className={catalogStyles.appointmentForm}
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
            <h2><NavIcon name="plus"/>{t('إنشاء خدمة مواعيد', 'Create appointment service')}</h2><div className={catalogStyles.serviceBasics}>
            <label className="field">
              {t('اسم الخدمة', 'Service name')}
              <input required name="name" maxLength={120} />
            </label>
            <label className="field">
              {t('المدة بالدقائق', 'Duration in minutes')}
              <input name="duration" type="number" min={5} max={1440} defaultValue={30} required />
            </label>
            </div><AppointmentHours />
            <div className={catalogStyles.serviceBasics}><label className="field">
              {t(
                'حساب Calendar اختياري — المزامنة تحتاج أمرًا منفصلًا',
                'Optional Calendar account — synchronization requires a separate action',
              )}
              <select name="connection" value={calendarConnection} onChange={e=>setCalendarConnection(e.target.value)}>
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
            <label hidden={!calendarConnection} className="field">Calendar ID<input name="calendar" defaultValue="primary"/></label></div>
            <button className="btn btn-primary" disabled={busy}><NavIcon name="check"/>{t('حفظ الخدمة', 'Save service')}</button>
          </form>
          <form hidden={appointmentTab!=='book'}
            className={catalogStyles.appointmentForm}
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
            <h2><NavIcon name="calendar"/>{t('فحص وحجز موعد', 'Check and book an appointment')}</h2><div className={catalogStyles.bookingFields}>
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
            </div><p className={catalogStyles.formHint}>{t('فحص التوفر لا ينشئ حجزًا. الحجز محلي ولا ينشئ حدث Calendar تلقائيًا.','Checking availability does not create a booking. Local bookings do not automatically create Calendar events.')}</p><div className="form-actions">
              <button className="btn" value="preview" disabled={busy}>
                <NavIcon name="search"/>{t('فحص التوفر دون حجز', 'Check availability without booking')}
              </button>
              <button className="btn btn-primary" value="save" disabled={busy}>
                <NavIcon name="check"/>{t('حجز محلي فعلي', 'Create local booking')}
              </button>
            </div>
          </form>
          <section hidden={appointmentTab!=='bookings'} className={catalogStyles.appointmentPanel}>
            <div className={catalogStyles.appointmentToolbar}><h2><NavIcon name="calendar"/>{t('الحجوزات', 'Bookings')}</h2><button className="btn btn-primary" type="button" onClick={()=>setAppointmentTab('book')}><NavIcon name="plus"/>{t('حجز موعد','Book appointment')}</button></div>
            <div className={catalogStyles.bookingMetrics}>{['all','confirmed','cancelled'].map(key=><button type="button" key={key} data-state={key} aria-pressed={bookingFilter===key} onClick={()=>setBookingFilter(key)}><NavIcon name={key==='all'?'calendar':key==='confirmed'?'circleCheck':'circleClose'}/><span>{key==='all'?t('كل الحجوزات','All bookings'):statusLabel(key)}<strong>{bookings.loading||bookings.error?'—':bookings.data.filter(b=>key==='all'||b.status===key).length}</strong></span></button>)}</div>
            <input className={catalogStyles.bookingSearch} type="search" aria-label={t('بحث الحجوزات','Search bookings')} placeholder={t('ابحث بالخدمة أو العميل…','Search service or customer…')} value={bookingSearch} onChange={e=>setBookingSearch(e.target.value)}/>
            {bookings.loading&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
            {!bookings.loading&&!bookings.error&&bookings.data.length>0&&!bookings.data.some(b=>(bookingFilter==='all'||b.status===bookingFilter)&&[b.service_name,b.contact_name].join(' ').toLowerCase().includes(bookingSearch.trim().toLowerCase()))&&<p>{t('لا توجد حجوزات مطابقة.','No matching bookings.')}</p>}
            {!bookings.loading&&!bookings.error&&!bookings.data.length&&<p className="muted">{t('لا توجد حجوزات مسجلة','No bookings recorded')}</p>}
            {bookings.error && <p role="alert">{bookings.error}</p>}
            {bookings.data.filter(b=>(bookingFilter==='all'||b.status===bookingFilter)&&[b.service_name,b.contact_name].join(' ').toLowerCase().includes(bookingSearch.trim().toLowerCase())).map((b) => (
              <article className={catalogStyles.bookingRow} key={b.id}>
                <div><strong>{b.service_name}</strong><small><NavIcon name="user"/>{b.contact_name}</small></div>
                <div><time dateTime={b.starts_at}><NavIcon name="calendar"/>{new Date(b.starts_at).toLocaleString()}</time><small>{t('إلى','Until')} {new Date(b.ends_at).toLocaleString()}</small></div>
                <div><span className={catalogStyles.bookingState} data-state={b.status}>{statusLabel(b.status)}</span><small>{calendarLabel(b.calendar_status)}</small></div>
                {b.calendar_error && <p>{b.calendar_error}</p>}
                <div className="form-actions">
                  <button
                    className="btn"
                    disabled={busy || b.status !== 'confirmed'}
                    onClick={() => {
                      if(confirm(t('إلغاء هذا الحجز المحلي؟','Cancel this local booking?')))void act(() =>
                        api(`/commerce/appointments/${b.id}/cancel`, { method: 'POST' }),
                      );
                    }}
                  >
                    <NavIcon name="circleClose"/>{t('إلغاء الحجز المحلي', 'Cancel local booking')}
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
        <p role="status" className={catalogStyles.bookingResult}><NavIcon name="circleCheck"/>{result}<button type="button" className="btn" onClick={()=>setResult('')}>{t('إغلاق','Dismiss')}</button></p>
      )}
    </section>
  );
}
