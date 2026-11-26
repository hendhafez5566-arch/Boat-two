'use client';
import { OrderWorkflowProgress, OrderWorkflowSettings, WorkflowWorkspace } from './OrderWorkflow';
import { QuoteDetails } from '../inbox/InboxQuoteDialog';
import { DisclosureSummary } from '../product/DisclosureSummary';
import { Dialog } from '../product/ProductUI';
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

export default function CommerceOrders({ contacts, origin, orderId }: { contacts: { id: string; name: string }[]; origin?: Origin; orderId?: string }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [orderQuery, setOrderQuery] = useState(orderId ?? '');
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
  const selectionRevision = useRef(0);
  const [workflowSettings, setWorkflowSettings] = useState(false);
  const [linkedWorkflowOrder, setLinkedWorkflowOrder] = useState<string | null>(null);
  const [workflowOrder, setWorkflowOrder] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [followup, setFollowup] = useState<Order | null>(null);
  const [notice, setNotice] = useState('');
  const followupRetry = useRef<{ key: string; id: string } | null>(null);
  const members = useData<{ members: { user_id: string; full_name: string }[] }>(
    (followup || assignmentId) ? '/crm/workspace/members' : null, { members: [] },
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set());
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(orderId ?? null);
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [ownership, setOwnership] = useState<'all' | 'unassigned' | 'mine'>('all');
  const identity = useData<{ user: { id: string } } | null>('/auth/me', null);
  const workspace = useData<{ role: string } | null>('/workspace', null);
  const canAssign = ['owner', 'admin'].includes(workspace.data?.role ?? '');
  const history = useData<{ status: string; created_at: string }[]>(historyId ? '/commerce/orders/' + historyId + '/history' : null, []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const products = useData<{ rows: CatalogProduct[] }>(creating ? '/commerce/products/page?q=' + encodeURIComponent(search) : null, { rows: [] });
  const orderParams = new URLSearchParams({ page: String(page), q: orderQuery });
  if (orderStatus) orderParams.set('status', orderStatus);
  const orderPath = '/commerce/orders?' + orderParams;
  const orders = useData<Order[]>(origin && !orderQuery ? null : orderPath, []);
  const customer = useData<{ contact_name: string } | null>(origin ? '/conversations/' + origin.conversationId : null, null);
  const summary = useData<{ status: string; count: string }[]>(origin ? null : '/commerce/orders/summary', []);
  const [packageId, setPackageId] = useState('');
  async function submit(form: HTMLFormElement, save: boolean) {
    if (!picked || lock.current) return;
    const revision = selectionRevision.current;
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
        const saved = await api<{ id: string }>(origin ? '/commerce/orders/from-conversation' : '/commerce/orders', {
          method: 'POST', body: JSON.stringify({ ...payload, requestId: retry.current.id }),
        });
        retry.current = null;
        setNotice(t('تم حفظ الطلب.', 'Order saved.'));
        setPicked(null);
        setCreating(false);
        setSearch('');
        setPackageId('');
        setOrderStatus('');
        setOrderQuery(saved.id);
        setSelectedId(saved.id);
        setOwnership('all');
        void summary.reload();
        setPreview(null);
        setPage(1);
      } else {
        const quote = await api<Snapshot>('/commerce/checkout/quote', {
          method: 'POST', body: JSON.stringify(selection),
        });
        if (revision === selectionRevision.current) setPreview(quote);
      }
    } catch (e) {
      if (save || revision === selectionRevision.current) setError((e as Error).message);
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
  const pageRows = matches ? orders.data.slice(0, 50) : [];
  const visibleRows = pageRows.filter(o => ownership === 'all' ||
    (ownership === 'unassigned' ? !o.assigned_to || !o.assignee_name : !!identity.data?.user?.id && o.assigned_to === identity.data.user.id));
  const selected = pageRows.find(o => o.id === selectedId);
  const nextAction = (o: Order) => {
    if (['completed', 'cancelled'].includes(o.status)) return t('عرض التفاصيل', 'View details');
    if (!o.assignee_name && canAssign) return t('تعيين مسؤول', 'Assign owner');
    return ({new:t('ابدأ المراجعة', 'Start review'),review:t('راجع الطلب', 'Review order'),
      documents_required:t('راجع المستندات', 'Review documents'),processing:t('تابع التنفيذ', 'Track progress'),
      confirmed:t('تابع الطلب', 'Follow up')} as Record<string,string>)[o.status] ?? t('فتح الطلب', 'Open order');
  };
  function openOrder(o: Order, action = false) {
    setSelectedId(o.id);
    setAssignmentId(action && !o.assignee_name && canAssign && !['completed','cancelled'].includes(o.status) ? o.id : null);
    setExpandedOrders(new Set([o.id]));
    setWorkflowOrder(action && o.status === 'processing' ? o.id : null);
    setLinkedWorkflowOrder(null);
    setHistoryId(null);
    setFollowup(null);
    setError('');
  }
  function closeOrder() {
    if (busy) return;
    setSelectedId(null);
    setAssignmentId(null);
    setWorkflowOrder(null);
    setLinkedWorkflowOrder(null);
    setHistoryId(null);
    setFollowup(null);
    setExpandedOrders(new Set());
  }
  function selectStatus(status: string) {
    setOrderStatus(status); setPage(1); setOrderQuery(''); setSelectedId(null); setOwnership('all');
  }
  return <section className={styles.workspace}>
    <header className={styles.heading}>
      <h2><NavIcon name="list"/> {t('الطلبات والحجوزات', 'Orders and bookings')}</h2>
      <button className="btn btn-primary" type="button" aria-expanded={creating}
        onClick={() => setCreating(!creating)}><NavIcon name="plus"/>
        {creating ? t('إخفاء النموذج', 'Hide form') : t('طلب جديد', 'New order')}
      </button>
    </header>
    {!origin && <div className={styles.workspaceTools}><button className="btn" type="button" onClick={() => setWorkflowSettings(true)}>{t('إعدادات سير العمل', 'Workflow settings')}</button></div>}
    <Dialog open={workflowSettings} onClose={() => setWorkflowSettings(false)} title={t('إدارة سير العمل', 'Manage workflows')} className={styles.workflowDialog}>
      {workflowSettings && <div className={styles.workflowWorkspace}><OrderWorkflowSettings/><WorkflowWorkspace/></div>}
    </Dialog>
    {!origin && <div className={styles.metrics} aria-label={t('ملخص كل الطلبات', 'All orders summary')}>
      {summary.error ? <p role="alert">{summary.error}</p> : [['', t('كل الطلبات', 'All orders')], ...Object.entries(statusLabels)].map(([status, label]) =>
        <button key={status} type="button" className={styles.metric} data-status={status || 'all'} aria-pressed={orderStatus === status}
          onClick={() => selectStatus(orderStatus === status ? '' : status)}>
          <span>{label}</span><strong>{summary.loading ? '…' : (status ? counts.get(status) ?? 0 : [...counts.values()].reduce((a,b)=>a+b,0)).toLocaleString()}</strong>
        </button>,
      )}
    </div>}
    {!origin && <div className={styles.filters}>
      <label><NavIcon name="search"/> {t('بحث في الطلبات', 'Search orders')}
        <input type="search" value={orderQuery} maxLength={120} placeholder={t('العميل أو المنتج أو رقم الطلب', 'Customer, product or order ID')}
          onChange={(e) => { setOrderQuery(e.target.value); setSelectedId(null); setPage(1); }}/>
      </label>
      <label>{t('الحالة', 'Status')} <select value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setSelectedId(null); setPage(1); }}>
        <option value="">{t('كل الحالات', 'All statuses')}</option>
        {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
      </select></label>
      {(orderQuery || orderStatus) && <button type="button" className="btn"
        onClick={() => { setOrderQuery(''); setOrderStatus(''); setOwnership('all'); setSelectedId(null); setPage(1); }}>
        {t('مسح البحث والتصفية', 'Clear search and filters')}
      </button>}
    </div>}
    <div className={creating ? 'card stack' : undefined} hidden={!creating}>
      <h3>{t('طلب جديد', 'New order')}</h3>
      {origin && <p>
        {t('العميل', 'Customer')} <strong>{customer.data?.contact_name ?? (customer.loading ? '…' : t('تعذر تحديد العميل', 'Customer unavailable'))}</strong>
        {' · '}<Link href={'/dashboard/inbox?conversation=' + origin.conversationId}>{t('فتح المحادثة', 'Open conversation')}</Link>
      </p>}
      {origin && customer.error && <p role="alert">{customer.error}</p>}
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
      {picked && <form key={picked.id} className="stack" onChange={() => {
        selectionRevision.current++;
        setPreview(null);
      }}
        onSubmit={(e) => {
          e.preventDefault();
          const button = (e.nativeEvent as SubmitEvent).submitter;
          void submit(e.currentTarget, button?.getAttribute('value') === 'save');
        }}>
        {!origin && <label>{t('العميل', 'Customer')} <select name="contact" defaultValue="" required>
          <option value="">{t('اختر عميلاً', 'Choose customer')}</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>}
        <CheckoutSelection product={picked} packageId={packageId} onPackage={setPackageId}/>
        <button className="btn" disabled={busy}>{t('معاينة السعر', 'Preview price')}</button>
        {preview && <section className="card" role="status"><QuoteDetails quote={preview}/></section>}
        {picked.checkout?.kind === 'appointment'
          ? <p>{t('احجز عبر تبويب المواعيد.', 'Book from the Appointments tab.')}</p>
          : <button className="btn btn-primary" value="save" disabled={busy || Boolean(origin && !customer.data)}>{t('حفظ الطلب', 'Save order')}</button>}
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
    {matches && pageRows.length > 0 && <section className={styles.queue} aria-label={t('قائمة الطلبات', 'Order list')}>
      <div className={styles.queueToolbar}>
        <div className={styles.queueFilters}>
          <strong>{t('الطلبات', 'Orders')} <span className={styles.queueCount}>{visibleRows.length}</span></strong>
          <label className={styles.ownershipLabel}>{t('المسؤول في الصفحة الحالية', 'Assignee on this page')}
            <select value={ownership} onChange={e => setOwnership(e.target.value as typeof ownership)}>
              <option value="all">{t('الكل', 'All')}</option>
              <option value="unassigned">{t('بدون مسؤول', 'Unassigned')}</option>
              <option value="mine" disabled={!identity.data?.user?.id}>{t('طلباتي', 'My orders')}</option>
            </select>
          </label>
        </div>
        <div className={styles.viewToggle} role="group" aria-label={t('طريقة العرض', 'View mode')}>
          <button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}>{t('قائمة', 'List')}</button>
          <button type="button" aria-pressed={view==='cards'} onClick={()=>setView('cards')}>{t('بطاقات', 'Cards')}</button>
        </div>
      </div>
      {visibleRows.length === 0 ? <p className={styles.emptyQueue}>{t('لا توجد طلبات مطابقة في هذه الصفحة.', 'No matching orders on this page.')}</p> :
      <div className={styles.orderTable} data-view={view}>
        <table>
          <thead><tr>
            <th>{t('الطلب والعميل', 'Order and customer')}</th>
            <th>{t('الحالة', 'Status')}</th>
            <th>{t('الإجمالي', 'Total')}</th>
            <th>{t('المسؤول', 'Assignee')}</th>
            <th>{t('تاريخ الإنشاء', 'Created')}</th>
            <th>{t('الإجراء التالي', 'Next action')}</th>
          </tr></thead>
          <tbody>{visibleRows.map(o => <tr key={o.id}>
            <td><button className={styles.orderTitle} type="button" onClick={()=>openOrder(o)}>{o.snapshot.name}</button>
              <small>{o.contact_name} · <bdi title={o.id}>#{o.id.slice(0,8)}</bdi></small>
              <small>{o.snapshot.package?.name ?? ''}{o.snapshot.package ? ' · ' : ''}× {o.snapshot.quantity}</small>
            </td>
            <td data-label={t('الحالة', 'Status')}><span className={styles.status} data-status={o.status}>{statusLabels[o.status] ?? o.status}</span></td>
            <td data-label={t('الإجمالي', 'Total')}><strong className={styles.money}><bdi>{amount(o.snapshot)}</bdi></strong></td>
            <td data-label={t('المسؤول', 'Assignee')}><span className={!o.assignee_name ? styles.unassigned : undefined}>{o.assignee_name ?? t('غير معيّن', 'Unassigned')}</span></td>
            <td data-label={t('التاريخ', 'Date')}><time dateTime={o.created_at}>{new Date(o.created_at).toLocaleDateString()}</time></td>
            <td className={styles.rowActions}><button className="btn" type="button" onClick={()=>openOrder(o,true)}>{nextAction(o)}</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <footer className={styles.queueFooter}>
        <span>{t('صفحة', 'Page')} {page}</span>
        <div><button type="button" className="btn" disabled={page <= 1 || orders.loading} onClick={()=>{setPage(page-1);setSelectedId(null)}}>{t('السابق', 'Previous')}</button>
        <button type="button" className="btn" disabled={orders.data.length <= 50 || orders.loading} onClick={()=>{setPage(page+1);setSelectedId(null)}}>{t('التالي', 'Next')}</button></div>
      </footer>
    </section>}
    {matches && !pageRows.length && page>1 && <button className="btn" onClick={()=>setPage(page-1)}>{t('السابق','Previous')}</button>}
    <Dialog open={!!selected} onClose={closeOrder} title={t('إدارة الطلب', 'Manage order')} className={styles.orderDialog}>
    {selected && [selected].map((o) => <article key={o.id} className={styles.order}>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <header className={styles.heading}>
        <div><h3>{o.snapshot.name}</h3><Link href={'/dashboard/crm?contact=' + o.contact_id}>{o.contact_name}</Link>
          {' · '}<time dateTime={o.created_at}>{new Date(o.created_at).toLocaleDateString()}</time></div>
        <span className={styles.status} data-status={o.status}>{statusLabels[o.status]}</span>
      </header>
      <div className={styles.detailNext}><div><small>{t('الإجراء المقترح', 'Suggested next action')}</small><strong>{nextAction(o)}</strong></div>
        {o.status === 'new' && <button className="btn btn-primary" disabled={busy} onClick={()=>void changeStatus(o.id,'review')}>{t('ابدأ المراجعة','Start review')}</button>}
      </div>
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
          {canAssign ? <button className="btn" aria-expanded={assignmentId === o.id}
            onClick={() => setAssignmentId(assignmentId === o.id ? null : o.id)}>
            {t('المسؤول', 'Assignee')} · {o.assignee_name ?? t('غير معيّن', 'Unassigned')}
          </button> : <p>{t('المسؤول', 'Assignee')} · {o.assignee_name ?? t('غير معيّن', 'Unassigned')}</p>}
          {canAssign && assignmentId === o.id && <label>{t('إسناد الطلب', 'Assign order')}
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
          {o.snapshot.quantityUnit === 'room'
            ? o.snapshot.quantity === 1 ? t('غرفة', 'room') : t('غرف', 'rooms')
            : o.snapshot.quantityUnit === 'person'
              ? o.snapshot.quantity === 1 ? t('فرد', 'person') : t('أفراد', 'persons')
              : o.snapshot.quantityUnit === 'package'
                ? o.snapshot.quantity === 1 ? t('باقة', 'package') : t('باقات', 'packages')
                : o.snapshot.quantity === 1 ? t('وحدة', 'unit') : t('وحدات', 'units')}
        </strong>
        <strong>{amount(o.snapshot)}</strong>
      </div>
      <details className={styles.details} open={expandedOrders.has(o.id)} onToggle={(event) => {
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
      {o.origin && <button type="button" className="btn" aria-expanded={linkedWorkflowOrder === o.id}
        onClick={() => setLinkedWorkflowOrder(linkedWorkflowOrder === o.id ? null : o.id)}>
        {t('سير عمل المحادثة المرتبطة', 'Linked conversation workflow')}
      </button>}
      {o.origin && linkedWorkflowOrder === o.id &&
        <OrderWorkflowProgress key={o.origin.conversationId} id={o.origin.conversationId} source="conversation"/>}
      <button type="button" className="btn" aria-expanded={workflowOrder === o.id}
        onClick={() => setWorkflowOrder(workflowOrder === o.id ? null : o.id)}>{t('سير العمل', 'Workflow')}</button>
      {workflowOrder === o.id && <OrderWorkflowProgress key={o.id} id={o.id} closed={['completed','cancelled'].includes(o.status)}/>}
      <button className="btn" aria-expanded={historyId === o.id} onClick={() => setHistoryId(historyId === o.id ? null : o.id)}>
        {t('سجل الحالة', 'Status history')}
      </button>
      {historyId === o.id && (history.loading ? <p role="status">{t('جارٍ التحميل', 'Loading')}</p>
        : history.error ? <p role="alert">{history.error}</p>
        : history.loadedPath === '/commerce/orders/' + o.id + '/history' && <ol>{history.data.map((event, i) =>
          <li key={i}>{statusLabels[event.status]} · {new Date(event.created_at).toLocaleString()}</li>)}</ol>)}

    </article>)}
    </Dialog>
  </section>;
}
