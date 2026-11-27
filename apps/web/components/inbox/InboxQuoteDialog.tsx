'use client';

import { useRef, useState, type FormEvent } from 'react';
import {NavIcon} from '../product/NavIcon';
import {useTransientNotice} from '../product/useTransientNotice';
import styles from './inbox-dialogs.module.css';
import { api } from '../../lib/api';
import { productPrice } from '../../lib/product-money';
import { useData } from '../business/useData';
import { Dialog } from '../product/ProductUI';
import { useLocale } from '../product/locale';
import CheckoutSelection, { checkoutSelection, type CheckoutItem } from '../workspace/CheckoutSelection';

export type QuoteSummary = {
  name: string;
  quantity: number;
  currency: string;
  totalCents: string | null;
  package?: { name: string } | null;
  options?: { name: string }[];
};

export function QuoteDetails({ quote }: { quote: QuoteSummary }) {
  const { t } = useLocale();
  return <dl className={styles.quoteFacts}>
    <div><dt>{t('المنتج', 'Product')}</dt><dd>{quote.name}{quote.package && ' · ' + quote.package.name}</dd></div>
    <div><dt>{t('الكمية', 'Quantity')}</dt><dd>{quote.quantity}</dd></div>
    {!!quote.options?.length && <div><dt>{t('الإضافات', 'Add-ons')}</dt><dd>{quote.options.map(option => option.name).join(' · ')}</dd></div>}
    <div><dt>{t('الإجمالي', 'Total')}</dt><dd>{quote.totalCents === null ? t('يحدد بعد المراجعة', 'Pending review') :
      <bdi>{productPrice(quote.totalCents, quote.currency)}</bdi>}</dd></div>
  </dl>;
}

export function InboxQuoteDialog({ conversationId, customer, close, insert }: {
  conversationId: string;
  customer: string;
  close: () => void;
  insert?: (draft: string) => void;
}) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<CheckoutItem | null>(null);
  const [packageId, setPackageId] = useState('');
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useTransientNotice(copied,()=>setCopied(false));
  const revision = useRef(0);
  const lock = useRef(false);
  const path = '/conversations/' + conversationId;
  const products = useData<CheckoutItem[]>(path + '/quote-products?q=' + encodeURIComponent(search), []);
  const total = quote?.totalCents == null ? t('يتحدد بعد المراجعة', 'Pending review') : productPrice(quote.totalCents, quote.currency);
  const draft = quote ? [
    t('أهلًا ' + customer + '، ده عرض السعر لطلبك:', 'Hi ' + customer + ', here is your quote:'),
    t('المنتج', 'Product') + ': ' + quote.name + (quote.package ? ' · ' + quote.package.name : ''),
    t('الكمية', 'Quantity') + ': ' + quote.quantity,
    ...(quote.options?.length ? [t('الإضافات', 'Add-ons') + ': ' + quote.options.map(option => option.name).join('، ')] : []),
    t('الإجمالي', 'Total') + ': ' + total,
    t('لو العرض مناسب، أكد لنا عشان نراجع التوفر ونكمّل الحجز.', 'If the quote works for you, let us know so we can confirm availability and proceed.'),
  ].join('\n') : '';
  function clearQuote() {
    revision.current++;
    setQuote(null);
    setCopied(false);
    setError('');
  }
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const version = revision.current;
    try {
      const result = await api<QuoteSummary>(path + '/quote-preview', {
        method: 'POST', body: JSON.stringify(checkoutSelection(product, packageId, new FormData(event.currentTarget))),
      });
      if (version === revision.current) setQuote(result);
    } catch (err) {
      if (version === revision.current) setError((err as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <Dialog open className={styles.dialog} title={t('عرض سعر من الكتالوج', 'Catalog quote')} onClose={()=>{if(!busy)close();}}>
    <div className={styles.content}>
      <div className={styles.intro}><span className={styles.brand} data-tone="purple"><NavIcon name="commerce"/></span><div><strong>{customer}</strong><small>{t('إنشاء عرض سعر من المنتجات الفعلية • لا يرسل تلقائيًا','Build a quote from catalog items • not sent automatically')}</small></div></div>
      <label>{t('بحث بالمنتج أو SKU', 'Find product by name or SKU')}
        <input type="search" placeholder={t('اسم المنتج أو SKU…','Product name or SKU…')} value={search} maxLength={120} onChange={e => setSearch(e.target.value)} />
      </label>
      <label>{t('المنتج', 'Product')}
        <select value={product?.id ?? ''} disabled={products.loading}
          onChange={e => {
            setProduct(products.data.find(item => item.id === e.target.value) ?? null);
            setPackageId('');
            clearQuote();
          }}>
          <option value="">{t('اختر المنتج', 'Choose product')}</option>
          {product && !products.data.some(item => item.id === product.id) && <option value={product.id}>{product.name}</option>}
          {products.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {products.loading&&<p role="status">{t('جارٍ تحميل المنتجات…','Loading products…')}</p>}{products.error && <div className={styles.warning} role="alert"><NavIcon name="flag"/><span>{products.error}</span><button type="button" className="btn" onClick={()=>void products.reload()}>{t('إعادة المحاولة','Retry')}</button></div>}
      {!products.loading && !products.error && !products.data.length && <p>{t('لا توجد منتجات مطابقة.', 'No matching products.')}</p>}
      {product && <form className="stack" key={product.id} onChange={clearQuote} onSubmit={preview}>
        <CheckoutSelection product={product} packageId={packageId} onPackage={setPackageId} />
        <button className="btn btn-primary" disabled={busy}><NavIcon name="eye"/>{busy?t('جارٍ الحساب…','Calculating…'):t('معاينة عرض السعر', 'Preview quote')}</button>
      </form>}
      {error && <p role="alert">{error}</p>}
      {quote && <section className={styles.quoteResult}><h3><NavIcon name="circleCheck"/>{t('تفاصيل عرض السعر','Quote details')}</h3>
        <QuoteDetails quote={quote} />
        <label>{t('مسودة الرسالة', 'Message draft')}<textarea rows={7} value={draft} readOnly /></label>
        {!insert && <p>{t('الرد المباشر غير متاح حاليًا. في واتساب، استخدم قالبًا معتمدًا عند انتهاء نافذة الرد.', 'Direct reply is unavailable. For WhatsApp, use an approved template after the reply window ends.')}</p>}
        <div className="form-actions">
          {insert && <button type="button" className="btn btn-primary" onClick={() => insert(draft)}><NavIcon name="chat"/>{t('إضافة إلى مسودة الرد', 'Add to reply draft')}</button>}
          <button type="button" className="btn" onClick={async () => {
            try {
              await navigator.clipboard.writeText(draft);
              setCopied(true);
            } catch {
              setError(t('تعذر النسخ. يمكنك تحديد نص المسودة ونسخه.', 'Copy failed. Select the draft text to copy it.'));
            }
          }}><NavIcon name={copied?'check':'copy'}/>{copied ? t('تم النسخ', 'Copied') : t('نسخ المسودة', 'Copy draft')}</button>
        </div>
      </section>}
    </div>
  </Dialog>;
}
