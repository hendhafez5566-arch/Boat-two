'use client';
import { DisclosureSummary } from '../product/DisclosureSummary';
import { useEffect, useRef, useState } from 'react';
import { NavIcon } from '../product/NavIcon';
import Link from 'next/link';
import { api, apiBlob } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { productPrice } from '../../lib/product-money';
import CheckoutSelection, { checkoutSelection } from './CheckoutSelection';
import styles from './commerce-orders.module.css';
import type { CatalogProduct } from './ProductCatalog';

type Snapshot = {
  name: string; kind: string; currency: string; totalCents: string | null;
  package: { name: string } | null; quantity: number; documents: string[];
  quantityUnit?: 'item' | 'room' | 'person' | 'package';
  customerName?: string | null;
  travelers?: number | null;
  options?: { name: string; priceCents: string | number }[];
  questions?: { id: string; label: string }[];
  answers?: { id: string; value: string }[];
  unitCents?: string | null;
  subtotalCents?: string | null;
  discountCents?: string | null;
  taxCents?: string | null;
};
type Origin = { conversationId: string; channelId: string };
type Order = { origin?: Origin | null; id: string; contact_id: string; contact_name: string; created_at: string; status: string; assigned_to?: string | null; assignee_name?: string | null; snapshot: Snapshot };

function OrderDetails({ snapshot }: { snapshot: Snapshot }) {
  const { t } = useLocale();
  const answers = (snapshot.questions ?? []).flatMap((question) => {
    const answer = snapshot.answers?.find(({ id }) => id === question.id);
    return answer?.value ? [{ ...question, value: answer.value }] : [];
  });
  const unit = snapshot.quantityUnit ?? 'item';
  const unitNames = {
    item: [t('وحدة', 'unit'), t('وحدات', 'units')],
    person: [t('فرد', 'person'), t('أفراد', 'persons')],
    room: [t('غرفة', 'room'), t('غرف', 'rooms')],
    package: [t('باقة', 'package'), t('باقات', 'packages')],
  };
  const quantityName = (unitNames[unit] ?? unitNames.item)[snapshot.quantity === 1 ? 0 : 1];
  const amounts = [
    [t('سعر الوحدة', 'Unit price'), snapshot.unitCents],
    [t('المجموع الفرعي', 'Subtotal'), snapshot.subtotalCents],
    [t('الخصم', 'Discount'), snapshot.discountCents],
    [t('الضريبة', 'Tax'), snapshot.taxCents],
    [t('الإجمالي', 'Total'), snapshot.totalCents],
  ] as const;

  return <div className="stack">
    <section>
      <h4>{t('تفاصيل الحجز', 'Booking details')}</h4>
      <dl>
        <div><dt>{t('العدد', 'Quantity')}</dt><dd>{snapshot.quantity} {quantityName}</dd></div>
        {snapshot.customerName && <div><dt>{t('اسم الحاجز', 'Booker name')}</dt><dd>{snapshot.customerName}</dd></div>}
        {snapshot.travelers && <div><dt>{t('عدد المسافرين', 'Travelers')}</dt><dd>{snapshot.travelers}</dd></div>}
      </dl>
    </section>
    <section>
      <h4>{t('الإجابات', 'Answers')}</h4>
      {answers.length ? <dl>{answers.map((answer) =>
        <div key={answer.id}><dt>{answer.label}</dt><dd>{answer.value}</dd></div>,
      )}</dl> : <p>{t('لا توجد إجابات إضافية', 'No additional answers')}</p>}
    </section>
    <section>
      <h4>{t('الإضافات', 'Add-ons')}</h4>
      {snapshot.options?.length ? <ul>{snapshot.options.map((option) =>
        <li key={option.name}>{option.name} · {productPrice(String(option.priceCents), snapshot.currency)}</li>,
      )}</ul> : <p>{t('لا توجد إضافات', 'No add-ons')}</p>}
    </section>
    <dl>{amounts.map(([label, value]) => value != null &&
      <div key={label}><dt>{label}</dt><dd>{productPrice(value, snapshot.currency)}</dd></div>,
    )}</dl>
  </div>;
}

function OrderDocuments({ order }: { order: Order }) {
  const { t } = useLocale();
  const path = '/commerce/orders/' + order.id + '/documents';
  const files = useData<{ slot: number; filename: string }[]>(path, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const closed = ['completed', 'cancelled'].includes(order.status);
  return <section className="stack">
    {files.error && <p role="alert">{files.error}</p>}
    {uploadNotice && <p role="status">{uploadNotice}</p>}
    {!closed && <p className="muted">{t('PDF أو JPG أو PNG، حتى 2 ميجابايت لكل ملف.', 'PDF, JPG or PNG, up to 2 MB per file.')}</p>}
    {error && <p role="alert">{error}</p>}
    {order.snapshot.documents.map((name, slot) => {
      const file = files.data.find((f) => f.slot === slot);
      return <div className="stack" key={slot}>
        {closed ? <span>{name}</span> : <label>{name}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={async (e) => {
            const input = e.currentTarget;
            const picked = input.files?.[0];
            if (!picked) return;
            setUploadNotice('');
            if (picked.size > 2 * 1024 * 1024) {
              input.value = '';
              setError(t('حجم الملف يتجاوز 2 ميجابايت.', 'The file exceeds 2 MB.'));
              return;
            }
            setBusy(true);
            setError('');
            try {
              const payload = new FormData();
              payload.append('file', picked);
              await api(path + '/' + slot, { method: 'POST', body: payload });
              setUploadNotice(t('تم رفع المستند.', 'Document uploaded.'));
              await files.reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              input.value = '';
              setBusy(false);
            }
          }}/>
        </label>}
        {file && <button className="btn" onClick={async () => {
          setError('');
          try {
            const blob = await apiBlob(path + '/' + slot);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = file.filename;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) { setError((e as Error).message); }
        }}>{t('تنزيل', 'Download')} · {file.filename}</button>}
      </div>;
    })}
  </section>;
}

export default function CommerceOrders({ contacts, origin }: { contacts: { id: string; name: string }[]; origin?: Origin }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [creating, setCreating] = useState(Boolean(origin));
  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get('status') ?? '';
    if (['new','review','documents_required','processing','confirmed','completed','cancelled'].includes(candidate)) {
      setOrderStatus(candidate);
      setPage(1);
    }
  }, []);
  const [picked, setPicked] = useState<CatalogProduct | null>(null);
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [followup, setFollowup] = useState<Order | null>(null);
  const [notice, setNotice] = useState('');
  const followupRetry = useRef<{ key: string; id: string } | null>(null);
  const members = useData<{ members: { user_id: string; full_name: string }[] }>(
    (followup || assignmentId) ? '/crm/workspace/members' : null, { members: [] },
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set());
  const [historyId, setHistoryId] = useState<string | null>(null);
  const history = useData<{ status: string; created_at: string }[]>(historyId ? '/commerce/orders/' + historyId + '/history' : null, []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const products = useData<{ rows: CatalogProduct[] }>('/commerce/products/page?q=' + encodeURIComponent(search), { rows: [] });
  const orderParams = new URLSearchParams({ page: String(page), q: orderQuery });
  if (orderStatus) orderParams.set('status', orderStatus);
  const orderPath = '/commerce/orders?' + orderParams;
  const orders = useData<Order[]>(orderPath, []);
  const summary = useData<{ status: string; count: string }[]>(origin ? null : '/commerce/orders/summary', []);
  const [packageId, setPackageId] = useState('');
  async function submit(form: HTMLFormElement, save: boolean) {
    if (!picked || lock.current) return;
    const data = new FormData(form);
    const selection = checkoutSelection(picked, packageId, data);
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (save) {
        const payload = { ...selection, ...(origin ?? { contactId: data.get('contact') }) };
        const key = JSON.stringify(payload);
        if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
        await api(origin ? '/commerce/orders/from-conversation' : '/commerce/orders', {
          method: 'POST', body: JSON.stringify({ ...payload, requestId: retry.current.id }),
        });
        retry.current = null;
        setNotice(t('تم حفظ الطلب.', 'Order saved.'));
        setPicked(null);
        if (!origin) setCreating(false);
        void summary.reload();
        setPreview(null);
        if (page === 1) await orders.reload();
        else setPage(1);
      } else {
        setPreview(await api<Snapshot>('/commerce/checkout/quote', {
          method: 'POST', body: JSON.stringify(selection),
        }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function createFollowup(order: Order, form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = new FormData(form);
      const payload = {
        contactId: order.contact_id, dueAt: new Date(String(data.get('due'))).toISOString(),
        assignedTo: data.get('assignee') || null,
        title: t('متابعة الطلب', 'Follow up on order') + ': ' + order.snapshot.name + ' · ' + order.id,
      };
      const key = JSON.stringify(payload);
      if (followupRetry.current?.key !== key) followupRetry.current = { key, id: crypto.randomUUID() };
      await api('/crm/tasks', { method:'POST', body:JSON.stringify({ ...payload, requestId:followupRetry.current.id }) });
      followupRetry.current = null;
      setFollowup(null);
      setNotice(t('تم إنشاء متابعة في CRM.', 'CRM follow-up created.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function changeStatus(id: string, status: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/commerce/orders/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(t('تم تحديث حالة الطلب.', 'Order status updated.'));
      await orders.reload();
      void summary.reload();
      if (historyId === id) await history.reload();
      await products.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function assignOrder(id: string, userId: string | null) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/commerce/orders/' + id + '/assignee', {
        method: 'PATCH', body: JSON.stringify({ userId }),
      });
      await orders.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const transitions: Record<string, string[]> = {
    new: ['review', 'confirmed', 'cancelled'],
    review: ['documents_required', 'processing', 'confirmed', 'cancelled'],
    documents_required: ['review', 'processing', 'cancelled'],
    processing: ['documents_required', 'completed', 'cancelled'],
    confirmed: ['documents_required', 'processing', 'completed', 'cancelled'],
  };
  const statusLabels: Record<string, string> = {
    new: t('جديد', 'New'), review: t('قيد المراجعة', 'In review'),
    documents_required: t('مطلوب مستندات', 'Documents required'), processing: t('قيد التنفيذ', 'In progress'),
    confirmed: t('مؤكد', 'Confirmed'),
    completed: t('مكتمل', 'Completed'), cancelled: t('ملغى', 'Cancelled'),
  };
  const amount = (snapshot: Snapshot) => snapshot.totalCents === null
    ? t('بانتظار عرض سعر', 'Quote pending') : productPrice(snapshot.totalCents, snapshot.currency);
  const matches = orders.loadedPath === orderPath && !orders.error;
  const counts = new Map(summary.data.map(({ status, count }) => [status, Number(count)]));
  return <section className={styles.workspace}>
    <header className={styles.heading}>
      <h2><NavIcon name="list"/> {t('الطلبات والحجوزات', 'Orders and bookings')}</h2>
      {!origin && <button className="btn btn-primary" type="button" aria-expanded={creating}
        onClick={() => setCreating(!creating)}><NavIcon name="plus"/>
        {creating ? t('إخفاء النموذج', 'Hide form') : t('طلب جديد', 'New order')}
      </button>}
    </header>
    {!origin && <div className={styles.metrics} aria-label={t('ملخص كل الطلبات', 'All orders summary')}>
      {summary.error ? <p role="alert">{summary.error}</p> : Object.entries(statusLabels).map(([status, label]) =>
        <button key={status} type="button" className={styles.metric} aria-pressed={orderStatus === status}
          onClick={() => { setOrderStatus(orderStatus === status ? '' : status); setPage(1); }}>
          <span>{label}</span><strong>{summary.loading ? '…' : (counts.get(status) ?? 0).toLocaleString()}</strong>
        </button>,
      )}
    </div>}
    <div className={styles.filters}>
      <label><NavIcon name="search"/> {t('بحث في الطلبات', 'Search orders')}
        <input type="search" value={orderQuery} maxLength={120} placeholder={t('العميل أو المنتج أو رقم الطلب', 'Customer, product or order ID')}
          onChange={(e) => { setOrderQuery(e.target.value); setPage(1); }}/>
      </label>
      <label>{t('الحالة', 'Status')} <select value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setPage(1); }}>
        <option value="">{t('كل الحالات', 'All statuses')}</option>
        {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
      </select></label>
      {(orderQuery || orderStatus) && <button type="button" className="btn"
        onClick={() => { setOrderQuery(''); setOrderStatus(''); setPage(1); }}>
        {t('مسح البحث والتصفية', 'Clear search and filters')}
      </button>}
    </div>
    <div className={creating ? 'card stack' : undefined} hidden={!creating}>
      <h3>{t('طلب جديد', 'New order')}</h3>
      <label>{t('بحث بالمنتج أو SKU', 'Find product by name or SKU')}
        <input value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)}/></label>
      <label>{t('المنتج', 'Product')}
        <select value={picked?.id ?? ''} disabled={busy || products.loading}
          onChange={(e) => {
            setPicked(products.data.rows.find((p) => p.id === e.target.value) ?? null);
            setPackageId('');
            setPreview(null);
          }}>
          <option value="">{t('اختر المنتج', 'Choose product')}</option>
          {picked && !products.data.rows.some((p) => p.id === picked.id) && <option value={picked.id}>{picked.name}</option>}
          {products.data.rows.filter((p) => !p.archived).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
        </select>
      </label>
      {picked && <form key={picked.id} className="stack" onChange={() => setPreview(null)}
        onSubmit={(e) => {
          e.preventDefault();
          const button = (e.nativeEvent as SubmitEvent).submitter;
          void submit(e.currentTarget, button?.getAttribute('value') === 'save');
        }}>
        {origin ? <p>{t('سيُربط الطلب بعميل المحادثة.', 'This order will use the conversation customer.')} {' '}
          <Link href={'/dashboard/inbox?conversation=' + origin.conversationId}>{t('فتح المحادثة', 'Open conversation')}</Link></p>
        : <label>{t('العميل', 'Customer')} <select name="contact" defaultValue="">
          <option value="">{t('اختر عميلاً', 'Choose customer')}</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>}
        <CheckoutSelection product={picked} packageId={packageId} onPackage={setPackageId}/>
        <button className="btn" disabled={busy}>{t('معاينة السعر', 'Preview price')}</button>
        {preview && <p role="status">{amount(preview)}</p>}
        {picked.checkout?.kind === 'appointment'
          ? <p>{t('احجز عبر تبويب المواعيد.', 'Book from the Appointments tab.')}</p>
          : <button className="btn btn-primary" value="save" disabled={busy}>{t('حفظ الطلب', 'Save order')}</button>}
      </form>}
      {products.error && <p role="alert">{products.error}</p>}
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {orders.loading && <p role="status">{t('جارٍ تحميل الطلبات', 'Loading orders')}</p>}
    {orders.error && <p role="alert">{orders.error}</p>}
    {matches && orders.data.length === 0 && <p>{orderQuery || orderStatus
      ? t('لا توجد طلبات مطابقة للبحث أو الحالة.', 'No orders match this search or status.')
      : t('لا توجد طلبات بعد.', 'No orders yet.')}</p>}
    {matches && orders.data.slice(0, 50).map((o) => <article key={o.id} className={styles.order}>
      <header className={styles.heading}>
        <div><h3>{o.snapshot.name}</h3><Link href={'/dashboard/crm?contact=' + o.contact_id}>{o.contact_name}</Link>
          {' · '}<time dateTime={o.created_at}>{new Date(o.created_at).toLocaleDateString()}</time></div>
        <span className={styles.status} data-status={o.status}>{statusLabels[o.status]}</span>
      </header>
      <div className={styles.filters}>
        {transitions[o.status] && <label>{t('حالة الطلب', 'Order status')}
          <select value={o.status} disabled={busy} onChange={(e) => {
            const status = e.target.value;
            if (status !== 'cancelled' || window.confirm(t('إلغاء الطلب؟', 'Cancel this order?')))
              void changeStatus(o.id, status);
          }}>
            <option value={o.status}>{statusLabels[o.status]}</option>
            {transitions[o.status].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>}
        <div>
          <button className="btn" aria-expanded={assignmentId === o.id}
            onClick={() => setAssignmentId(assignmentId === o.id ? null : o.id)}>
            {t('المسؤول', 'Assignee')} · {o.assignee_name ?? t('غير معيّن', 'Unassigned')}
          </button>
          {assignmentId === o.id && <label>{t('إسناد الطلب', 'Assign order')}
            <select value={o.assignee_name ? o.assigned_to ?? '' : ''} disabled={busy || members.loading}
              onChange={(e) => void assignOrder(o.id, e.target.value || null)}>
              <option value="">{t('غير معيّن', 'Unassigned')}</option>
              {members.data.members.map((member) =>
                <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
            </select>
            {members.error && <span role="alert">{members.error}</span>}
          </label>}
        </div>
      </div>
      <div className={styles.heading}>
        <strong>{o.snapshot.package?.name ?? o.snapshot.name} × {o.snapshot.quantity}{' '}
          {o.snapshot.quantityUnit === 'room' ? t('غرفة/غرف', 'rooms')
            : o.snapshot.quantityUnit === 'person' ? t('فرد/أفراد', 'persons')
            : o.snapshot.quantityUnit === 'package' ? t('باقة/باقات', 'packages')
            : t('وحدة/وحدات', 'units')}
        </strong>
        <strong>{amount(o.snapshot)}</strong>
      </div>
      <details className={styles.details} onToggle={(event) => {
        const open = event.currentTarget.open;
        setExpandedOrders((current) => {
          if (current.has(o.id) === open) return current;
          const next = new Set(current);
          if (open) next.add(o.id);
          else next.delete(o.id);
          return next;
        });
      }}>
        <DisclosureSummary>{t('تفاصيل الطلب والعميل', 'Order and customer details')}</DisclosureSummary>
        <OrderDetails snapshot={o.snapshot}/>
        {!!o.snapshot.documents.length && expandedOrders.has(o.id) && <>
          <h4>{t('المستندات', 'Documents')}</h4>
          <OrderDocuments order={o}/>
        </>}
        {o.origin && <p><Link href={'/dashboard/inbox?conversation=' + o.origin.conversationId}>
          {t('المحادثة الأصلية', 'Original conversation')}
        </Link></p>}
        <p><Link href={'/dashboard/crm?contact=' + o.contact_id}>{t('فتح ملف العميل', 'Open customer profile')}</Link></p>
      </details>
      <button className="btn" aria-expanded={followup?.id === o.id} onClick={() => setFollowup(followup?.id === o.id ? null : o)}>
        {t('متابعة في CRM', 'CRM follow-up')}
      </button>
      {followup?.id === o.id && <form className="stack" onSubmit={(e) => { e.preventDefault(); void createFollowup(o, e.currentTarget); }}>
        <label>{t('موعد المتابعة', 'Follow-up date')} <input type="datetime-local" name="due" required/></label>
        <label>{t('المسؤول', 'Assignee')} <select name="assignee">
          <option value="">{t('غير معيّن', 'Unassigned')}</option>
          {members.data.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
        </select></label>
        <button className="btn btn-primary" disabled={busy}>{t('إنشاء المتابعة', 'Create follow-up')}</button>
      </form>}
      <button className="btn" aria-expanded={historyId === o.id} onClick={() => setHistoryId(historyId === o.id ? null : o.id)}>
        {t('سجل الحالة', 'Status history')}
      </button>
      {historyId === o.id && (history.loading ? <p role="status">{t('جارٍ التحميل', 'Loading')}</p>
        : history.error ? <p role="alert">{history.error}</p>
        : history.loadedPath === '/commerce/orders/' + o.id + '/history' && <ol>{history.data.map((event, i) =>
          <li key={i}>{statusLabels[event.status]} · {new Date(event.created_at).toLocaleString()}</li>)}</ol>)}

    </article>)}
    {page > 1 && <button className="btn" onClick={() => setPage(page-1)}>{t('السابق', 'Previous')}</button>}
    {matches && orders.data.length > 50 && <button className="btn" onClick={() => setPage(page+1)}>{t('التالي', 'Next')}</button>}
  </section>;
}
