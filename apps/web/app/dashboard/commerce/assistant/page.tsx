'use client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useRef, useState } from 'react';
import { useLocale } from '../../../../components/product/locale';
import { checkoutEnabled } from '../../../../components/workspace/CheckoutEditor';
import type { CatalogProduct } from '../../../../components/workspace/ProductCatalog';
import { useData } from '../../../../components/business/useData';
import { api } from '../../../../lib/api';
import CheckoutSelection, { checkoutSelection, type CheckoutItem } from '../../../../components/workspace/CheckoutSelection';
import { productPrice } from '../../../../lib/product-money';
import styles from './assistant.module.css';

type Readiness = { revision: string; blockers: string[]; warnings: string[]; repairs: { productId: string; name: string; field: string }[]; products: { id: string; name: string }[] };
type Preview = {
  state: { vars?: { selectedProductId?: string } };
  transcript: { role: string; content: string | { text?: string; buttons?: { id: string; title: string }[]; list?: { sections: { rows: { id: string; title: string }[] }[] } } }[];
};
type Release = { id: string; flow_id: string; created_at: string };
export default function AssistantPage() {
  if (!checkoutEnabled) notFound();
  return <Assistant/>;
}
function PreviewCheckout({ id }: { id: string }) {
  const { t } = useLocale();
  const product = useData<CheckoutItem | null>('/commerce/checkout/products/' + id, null);
  const [packageId, setPackageId] = useState('');
  const [quote, setQuote] = useState<{ totalCents: string | null; currency: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectionRevision = useRef(0);
  if (product.loading) return <p role="status">{t('جارٍ تحميل المنتج', 'Loading product')}</p>;
  if (product.error || !product.data) return <p role="alert">{product.error}</p>;
  const item = product.data;
  return <form className="card stack" onChange={() => { selectionRevision.current++; setQuote(null); }}
    onSubmit={async (event) => {
      event.preventDefault();
      const revision = selectionRevision.current;
      const data = checkoutSelection(item, packageId, new FormData(event.currentTarget));
      setBusy(true);
      setError('');
      try {
        const response = await api<{ totalCents: string | null; currency: string }>('/commerce/checkout/quote', {
          method: 'POST', body: JSON.stringify(data),
        });
        if (revision === selectionRevision.current) setQuote(response);
      } catch (e) {
        if (revision === selectionRevision.current) setError((e as Error).message);
      } finally { setBusy(false); }
    }}>
    <h3>{item.name}</h3>
    <CheckoutSelection product={item} packageId={packageId} onPackage={setPackageId}/>
    <button className="btn btn-primary" disabled={busy}>{t('معاينة السعر', 'Preview price')}</button>
    {quote && <p role="status">{quote.totalCents === null
      ? t('بانتظار عرض سعر', 'Quote pending') : productPrice(quote.totalCents, quote.currency)}</p>}
    {error && <p role="alert">{error}</p>}
  </form>;
}

function Assistant() {
  const { t } = useLocale();
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [selected, setSelected] = useState<CatalogProduct[]>([]);
  const [settings, setSettings] = useState({
    name: '', channelId: '', assigneeId: '', welcome: 'أهلًا وسهلًا / Welcome',
    fallback: 'اختَر عنصرًا من القائمة / Choose a catalog item',
  });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const channels = useData<{ id: string; name: string; status: string }[]>('/channels', []);
  const staff = useData<{ members: {user_id: string; full_name: string}[] }>('/crm/workspace/members', { members: [] });
  const catalog = useData<{ rows: CatalogProduct[] }>('/commerce/products/page?q=' + encodeURIComponent(search), {rows: []});
  const releases = useData<Release[]>('/catalog-assistant/releases', []);
  const steps = [t('الكتالوج', 'Catalog'), t('الإعدادات', 'Settings'), t('المسودة', 'Draft'),
    t('الجاهزية', 'Readiness'), t('المعاينة', 'Preview'), t('النشر التجريبي', 'Demo release')];
  const setup = { ...settings, assigneeId: settings.assigneeId || undefined, productIds: manual ? selected.map((p) => p.id) : undefined };
  function invalidate() {
    setDraft('');
    setReadiness(null);
    setPreview(null);
    setConfirm(false);
    setResult('');
    setError('');
  }
  async function act(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await operation(); } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const post = <T,>(url: string, body: unknown) =>
    api<T>(url, { method: 'POST', body: JSON.stringify(body) });
  const verified = readiness && !readiness.blockers.length;
  const check = async () => {
    invalidate();
    setReadiness(await post<Readiness>('/catalog-assistant/readiness', setup));
    setStep(3);
  };
  return <main className="stack">
    <header className={styles.hero}>
      <h1>{t('مساعد إعداد البوت الذكي', 'Smart bot setup')}</h1>
      <Link href="/dashboard/flows">{t('مدير البوت', 'Bot Manager')}</Link>
    </header>
    <nav className={styles.steps} aria-label={t('خطوات الإعداد', 'Setup steps')}>
      {steps.map((label, index) => <button className={'btn ' + (step === index ? 'btn-primary' : '')}
        type="button" key={label} aria-current={step === index ? 'step' : undefined} disabled={busy}
        onClick={() => { setStep(index); setError(''); }}>{index + 1}. {label}</button>)}
    </nav>
    {error && <p role="alert">{error}</p>}
    {step === 0 && <section className="card stack">
      <h2>{steps[0]}</h2>
      <label><input type="checkbox" checked={manual} onChange={(e) => { invalidate(); setManual(e.target.checked); }}/>
        {t('تحديد المنتجات يدويًا', 'Select products manually')}</label>
      <p>{t('القائمة الحالية تدعم حتى 1000 منتج نشط.', 'The current list supports up to 1,000 active products.')}</p>
      {manual && <>
        <label>{t('ابحث في الكتالوج', 'Search the catalog')} <input value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)}/></label>
        <ul>{selected.map((p) => <li key={p.id}>{p.name} <button type="button" className="btn" onClick={() => {
          invalidate(); setSelected(selected.filter((item) => item.id !== p.id));
        }}>{t('إزالة', 'Remove')}</button></li>)}</ul>
        {catalog.loading && <p role="status">{t('جارٍ التحميل', 'Loading')}</p>}
        {catalog.error && <p role="alert">{catalog.error}</p>}
        {catalog.data.rows.filter((p) => !p.archived && !selected.some((item) => item.id === p.id)).map((p) =>
          <button className="btn" key={p.id} disabled={selected.length >= 1000} onClick={() => { invalidate(); setSelected([...selected, p]); }}>
            {p.name} · {p.sku}
          </button>)}
      </>}
      <button className="btn btn-primary" onClick={() => setStep(1)}>{t('متابعة', 'Continue')}</button>
    </section>}
    {step === 1 && <form className="card stack" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
      <h2>{steps[1]}</h2>
      {(['name', 'welcome', 'fallback'] as const).map((key) => <label key={key}>
        {{name: t('اسم المسار', 'Flow name'), welcome: t('رسالة الترحيب', 'Welcome message'), fallback: t('رسالة عدم الفهم', 'Fallback message')}[key]}
        <input required maxLength={key === 'name' ? 120 : 1024} value={settings[key]}
          onChange={(e) => { invalidate(); setSettings({ ...settings, [key]: e.target.value }); }}/>
      </label>)}
      <label>{t('القناة', 'Channel')} <select aria-label={t('القناة', 'Channel')} required value={settings.channelId}
        onChange={(e) => { invalidate(); setSettings({ ...settings, channelId: e.target.value }); }}>
        <option value="">{t('اختر قناة', 'Choose channel')}</option>
        {channels.data.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label>{t('مسؤول التحويل', 'Handoff assignee')}
        <select aria-label={t('مسؤول التحويل', 'Handoff assignee')} value={settings.assigneeId}
          onChange={(e) => { invalidate(); setSettings({ ...settings, assigneeId: e.target.value }); }}>
          <option value="">{t('بدون تحويل اختياري', 'No optional handoff')}</option>
          {staff.data.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
        </select>
      </label>
      <button className="btn btn-primary">{t('متابعة', 'Continue')}</button>
    </form>}
    {(step === 2 || step === 3) && <section className="card stack">
      <h2>{steps[step]}</h2>
      <p>{t('الترحيب ← قائمة المنتجات ← نهاية المسار، مع رسالة بديلة عند تعذّر الاختيار.',
        'Welcome → product list → end, with a fallback message for unsuccessful selections.')}</p>
      <button className="btn" disabled={busy || !settings.name || !settings.channelId} onClick={() => void act(check)}>{t('فحص الجاهزية', 'Check readiness')}</button>
      {readiness && <>
        <h3>{t('العوائق', 'Blockers')}</h3><ul>{readiness.blockers.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <h3>{t('التحذيرات', 'Warnings')}</h3><ul>{readiness.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <ul>{readiness.products.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
        {!!readiness.repairs.length && <ul>{readiness.repairs.map((repair) =>
          <li key={repair.productId + repair.field}>
            <Link target="_blank" rel="noopener" href={'/dashboard/commerce?' + new URLSearchParams({ edit: repair.productId, field: repair.field })}>
              {t('إصلاح', 'Fix')} {repair.name} · {repair.field === 'category' ? t('التصنيف', 'Category')
                : repair.field === 'stock' ? t('المخزون', 'Stock') : t('إعدادات الطلب', 'Checkout settings')}
            </Link>
          </li>)}</ul>}
        <button className="btn btn-primary" disabled={busy || !verified || !!draft} onClick={() => void act(async () => {
          const response = await post<{ id: string }>('/catalog-assistant/draft', { setup, revision: readiness.revision });
          setDraft(response.id);
          setStep(4);
        })}>{t('إنشاء مسودة في محرر البوت', 'Create Flow Builder draft')}</button>
      </>}
    </section>}
    {step === 4 && <section className="card stack">
      <h2>{steps[4]}</h2>
      {draft && <Link href={'/dashboard/flows/' + draft}>{t('فتح المسودة', 'Open draft')}</Link>}
      <button className="btn" disabled={!draft || busy} onClick={() => void act(async () => {
        setPreview(await post<Preview>('/flows/' + draft + '/test', {}));
      })}>{t('تشغيل المعاينة المعزولة', 'Run isolated preview')}</button>
      {preview && <ul>{preview.transcript.filter((row) => row.role === 'bot').map(({ content }, i) =>
        <li key={i}>{typeof content === 'string' ? content : <>
          {content.text}
          {(content.buttons ?? content.list?.sections.flatMap((section) => section.rows) ?? []).map((choice) =>
            <button key={choice.id} className="btn" disabled={busy} onClick={() => void act(async () => {
              setPreview(await post<Preview>('/flows/' + draft + '/test', { state: preview.state, replyId: choice.id }));
            })}>{choice.title}</button>)}
        </>}</li>)}</ul>}
      {preview?.state.vars?.selectedProductId && <PreviewCheckout
        key={preview.state.vars.selectedProductId} id={preview.state.vars.selectedProductId}/>}

    </section>}
    {step === 5 && <section className="card stack">
      <h2>{steps[5]}</h2>
      <label><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)}/>
        {t('أوافق على إنشاء إصدار تجريبي معزول', 'Confirm isolated demo release')}</label>
      <button className="btn btn-primary" disabled={!draft || !verified || !confirm || busy} onClick={() => void act(async () => {
        const release = await post<Release>('/catalog-assistant/releases', {setup, revision: readiness?.revision, flowId: draft, confirm});
        setResult(release.id);
        setConfirm(false);
        await releases.reload();
      })}>{t('حفظ إصدار تجريبي', 'Save demo release')}</button>
      {result && <p role="status">{t('تم حفظ الإصدار', 'Release saved')} · {result}</p>}
      <ul>{releases.data.map((r) => <li key={r.id}>{new Date(r.created_at).toLocaleString()} · <Link href={'/dashboard/flows/' + r.flow_id}>{r.id}</Link>
        <button className="btn" disabled={busy} onClick={() => {
          if (window.confirm(t('استرجاع هذه النسخة التجريبية؟', 'Restore this demo version?'))) void act(async () => {
            const restored = await post<Release>('/catalog-assistant/releases/' + r.id + '/restore', { confirm: true });
            setResult(restored.id);
            await releases.reload();
          });
        }}>{t('استرجاع نسخة تجريبية', 'Restore demo version')}</button>
      </li>)}</ul>
    </section>}
  </main>;
}
