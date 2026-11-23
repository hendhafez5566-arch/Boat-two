'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiBlob } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { productPrice } from '../../lib/product-money';
import CheckoutSelection, { checkoutSelection } from './CheckoutSelection';
import type { CatalogProduct } from './ProductCatalog';

type Snapshot = {
  name: string; kind: string; currency: string; totalCents: string | null;
  package: { name: string } | null; quantity: number; documents: string[];
};
type Origin = { conversationId: string; channelId: string };
type Order = { origin?: Origin | null; id: string; contact_id: string; contact_name: string; status: string; snapshot: Snapshot };

function OrderDocuments({ order }: { order: Order }) {
  const { t } = useLocale();
  const path = '/commerce/orders/' + order.id + '/documents';
  const files = useData<{ slot: number; filename: string }[]>(path, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closed = ['completed', 'cancelled'].includes(order.status);
  return <section className="stack">
    {files.error && <p role="alert">{files.error}</p>}
    {error && <p role="alert">{error}</p>}
    {order.snapshot.documents.map((name, slot) => {
      const file = files.data.find((f) => f.slot === slot);
      return <div className="stack" key={slot}>
        {closed ? <span>{name}</span> : <label>{name}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={async (e) => {
            const input = e.currentTarget;
            const picked = input.files?.[0];
            if (!picked) return;
            setBusy(true);
            setError('');
            try {
              const payload = new FormData();
              payload.append('file', picked);
              await api(path + '/' + slot, { method: 'POST', body: payload });
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
  const [picked, setPicked] = useState<CatalogProduct | null>(null);
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [followup, setFollowup] = useState<Order | null>(null);
  const [followupMessage, setFollowupMessage] = useState('');
  const followupRetry = useRef<{ key: string; id: string } | null>(null);
  const members = useData<{ members: { user_id: string; full_name: string }[] }>(
    followup ? '/crm/workspace/members' : null, { members: [] },
  );
  const [documentsId, setDocumentsId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const history = useData<{ status: string; created_at: string }[]>(historyId ? '/commerce/orders/' + historyId + '/history' : null, []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const products = useData<{ rows: CatalogProduct[] }>('/commerce/products/page?q=' + encodeURIComponent(search), { rows: [] });
  const orders = useData<Order[]>('/commerce/orders?page=' + page, []);
  const [packageId, setPackageId] = useState('');
  async function submit(form: HTMLFormElement, save: boolean) {
    if (!picked || lock.current) return;
    const data = new FormData(form);
    const selection = checkoutSelection(picked, packageId, data);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (save) {
        const payload = { ...selection, ...(origin ?? { contactId: data.get('contact') }) };
        const key = JSON.stringify(payload);
        if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
        await api(origin ? '/commerce/orders/from-conversation' : '/commerce/orders', {
          method: 'POST', body: JSON.stringify({ ...payload, requestId: retry.current.id }),
        });
        retry.current = null;
        setPicked(null);
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
    setFollowupMessage('');
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
      setFollowupMessage(t('تم إنشاء متابعة في CRM.', 'CRM follow-up created.'));
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
    try {
      await api('/commerce/orders/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
      await orders.reload();
      if (historyId === id) await history.reload();
      await products.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const statusLabels: Record<string, string> = {
    new: t('جديد', 'New'), confirmed: t('مؤكد', 'Confirmed'),
    completed: t('مكتمل', 'Completed'), cancelled: t('ملغى', 'Cancelled'),
  };
  const amount = (snapshot: Snapshot) => snapshot.totalCents === null
    ? t('بانتظار عرض سعر', 'Quote pending') : productPrice(snapshot.totalCents, snapshot.currency);
  return <section className="stack">
    <header><h2>{t('الطلبات', 'Orders')}</h2></header>
    <div className="card stack">
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
      {(error || products.error) && <p role="alert">{error || products.error}</p>}
    </div>
    {followupMessage && <p role="status">{followupMessage}</p>}
    {orders.loading && <p role="status">{t('جارٍ تحميل الطلبات', 'Loading orders')}</p>}
    {orders.error && <p role="alert">{orders.error}</p>}
    {!orders.loading && !orders.error && orders.data.length === 0 && <p>{t('لا توجد طلبات.', 'No orders.')}</p>}
    {orders.data.slice(0, 50).map((o) => <article key={o.id} className="card">
      <h3>{o.snapshot.name}</h3>
      <Link href={'/dashboard/crm?contact=' + o.contact_id}>{o.contact_name}</Link>
      {o.origin && <p><Link href={'/dashboard/inbox?conversation=' + o.origin.conversationId}>
        {t('المحادثة الأصلية', 'Original conversation')}
      </Link></p>}
      <p>{o.snapshot.quantity} × {o.snapshot.package?.name ?? o.snapshot.name} · {amount(o.snapshot)}</p>
      <p>{statusLabels[o.status]}</p>
      {!!o.snapshot.documents.length && <button className="btn" aria-expanded={documentsId === o.id}
        onClick={() => setDocumentsId(documentsId === o.id ? null : o.id)}>{t('المستندات', 'Documents')}</button>}
      {documentsId === o.id && <OrderDocuments order={o}/>}

      {o.status === 'new' && <button className="btn" disabled={busy}
        onClick={() => void changeStatus(o.id, 'confirmed')}>{t('تأكيد الطلب', 'Confirm order')}</button>}
      {o.status === 'confirmed' && <button className="btn" disabled={busy}
        onClick={() => void changeStatus(o.id, 'completed')}>{t('إكمال الطلب', 'Complete order')}</button>}
      {['new', 'confirmed'].includes(o.status) && <button className="btn" disabled={busy} onClick={() => {
        if (window.confirm(t('إلغاء الطلب؟', 'Cancel this order?'))) void changeStatus(o.id, 'cancelled');
      }}>{t('إلغاء الطلب', 'Cancel order')}</button>}
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
    {orders.data.length > 50 && <button className="btn" onClick={() => setPage(page+1)}>{t('التالي', 'Next')}</button>}
  </section>;
}
