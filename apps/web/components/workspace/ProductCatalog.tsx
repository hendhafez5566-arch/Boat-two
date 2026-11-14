'use client';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { productDecimal, productMinorUnits, productPrice } from '../../lib/product-money';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import styles from './product-catalog.module.css';
export type CatalogProduct = {
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
export function ProductImage({ product }: { product: Pick<CatalogProduct, 'image_url' | 'name'> }) {
  const [failed, setFailed] = useState(false);
  return product.image_url && !failed ? (
    <img
      className={styles.image}
      src={product.image_url}
      alt={product.name}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className={styles.placeholder} aria-label={product.name}>
      ◇
    </div>
  );
}
export default function ProductCatalog() {
  const { t } = useLocale();
  const products = useData<CatalogProduct[]>('/commerce/products', []);
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('active'),
    [sort, setSort] = useState('name');
  const [editing, setEditing] = useState<CatalogProduct | null | undefined>(undefined);
  const [preview, setPreview] = useState<CatalogProduct | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const lock = useRef(false);
  const rows = products.data
    .filter(
      (p) =>
        (status === 'all' || p.archived === (status === 'archived')) &&
        `${p.name} ${p.sku} ${p.description}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : a.currency.localeCompare(b.currency) ||
          (BigInt(a.price_cents) < BigInt(b.price_cents)
            ? -1
            : BigInt(a.price_cents) > BigInt(b.price_cents)
              ? 1
              : 0),
    );
  async function save(form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const f = new FormData(form);
      await api('/commerce/products' + (editing ? '/' + editing.id : ''), {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          sku: f.get('sku'),
          description: f.get('description'),
          priceCents: productMinorUnits(String(f.get('price'))),
          currency: f.get('currency'),
          ...(f.get('image') ? { imageUrl: f.get('image') } : {}),
          ...(f.get('link') ? { linkUrl: f.get('link') } : {}),
          ...(f.get('catalog') ? { catalogId: f.get('catalog') } : {}),
          ...(f.get('retailer') ? { retailerId: f.get('retailer') } : {}),
          archived: f.get('archived') === 'on',
        }),
      });
      await products.reload();
      setEditing(undefined);
      setSuccess(t('تم حفظ المنتج.', 'Product saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.root} aria-label={t('إدارة المنتجات', 'Product management')}>
      <header className={styles.header}>
        <div>
          <h2>{t('المنتجات', 'Products')}</h2>
          <p>
            {t(
              'أضف منتجاتك اليدوية ثم اخترها داخل البوت. مصادر البيانات تُدار في تبويب مستقل.',
              'Create manual products, then select them in your bot. Manage dynamic data in the separate Data sources tab.',
            )}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setError('');
          }}
        >
          {t('إضافة منتج', 'Add product')}
        </button>
      </header>
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      {(products.error || (error && editing === undefined)) && (
        <p className="notice error" role="alert">
          {products.error || error}
          <button className="btn" onClick={() => void products.reload()}>
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </p>
      )}
      <div className={styles.toolbar}>
        <label className="field">
          {t('البحث', 'Search')}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('اسم المنتج أو SKU', 'Product name or SKU')}
          />
        </label>
        <label className="field">
          {t('الحالة', 'Status')}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">{t('نشط', 'Active')}</option>
            <option value="archived">{t('مؤرشف', 'Archived')}</option>
            <option value="all">{t('الكل', 'All')}</option>
          </select>
        </label>
        <label className="field">
          {t('الترتيب', 'Sort')}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{t('الاسم', 'Name')}</option>
            <option value="price">{t('العملة ثم السعر', 'Currency, then price')}</option>
          </select>
        </label>
        <span role="status">
          {rows.length} {t('منتج', 'products')}
        </span>
      </div>
      {products.loading ? (
        <p role="status">{t('جارٍ تحميل المنتجات…', 'Loading products…')}</p>
      ) : rows.length ? (
        <div className={styles.grid}>
          {rows.map((p) => (
            <article className={styles.card} key={p.id}>
              <ProductImage key={p.image_url} product={p} />
              <div className={styles.body}>
                <span className={styles.badge}>
                  {p.archived ? t('مؤرشف', 'Archived') : t('نشط', 'Active')}
                </span>
                <h3>{p.name}</h3>
                <strong dir="ltr">{productPrice(p.price_cents, p.currency)}</strong>
                <p>{p.description}</p>
                <small>SKU: {p.sku}</small>
                <div className="form-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      setEditing(p);
                      setError('');
                    }}
                  >
                    {t('تعديل', 'Edit')}
                  </button>
                  <button className="btn" onClick={() => setPreview(p)}>
                    {t('معاينة', 'Preview')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h3>{t('لا توجد منتجات في هذا العرض', 'No products in this view')}</h3>
          <p>
            {t(
              'أضف أول منتج أو غيّر البحث والحالة.',
              'Add your first product or adjust the search and status.',
            )}
          </p>
        </div>
      )}
      {editing !== undefined && (
        <div className={styles.editor}>
          <form
            className="card stack"
            key={editing?.id ?? 'new'}
            onSubmit={(e) => {
              e.preventDefault();
              void save(e.currentTarget);
            }}
          >
            <header className={styles.header}>
              <h2>{editing ? t('تعديل المنتج', 'Edit product') : t('منتج جديد', 'New product')}</h2>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                {t('إغلاق', 'Close')}
              </button>
            </header>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <fieldset className={styles.section}>
              <legend>{t('المعلومات الأساسية', 'Basic information')}</legend>
              <div className="form-grid">
                <label className="field">
                  {t('اسم المنتج', 'Product name')}
                  <input
                    autoFocus
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={editing?.name}
                  />
                </label>
                <label className="field">
                  {t('رمز المنتج SKU', 'Product code (SKU)')}
                  <input name="sku" required maxLength={80} defaultValue={editing?.sku} />
                </label>
              </div>
              <label className="field">
                {t('الوصف', 'Description')}
                <textarea name="description" maxLength={1000} defaultValue={editing?.description} />
              </label>
            </fieldset>
            <fieldset className={styles.section}>
              <legend>{t('السعر', 'Price')}</legend>
              <div className="form-grid">
                <label className="field">
                  {t('سعر المنتج (مثال 150.00)', 'Product price (e.g. 150.00)')}
                  <input
                    name="price"
                    inputMode="decimal"
                    pattern="[0-9]{1,13}(\.[0-9]{1,2})?"
                    required
                    defaultValue={editing ? productDecimal(editing.price_cents) : '0.00'}
                    dir="ltr"
                  />
                </label>
                <label className="field">
                  {t('العملة', 'Currency')}
                  <input
                    name="currency"
                    pattern="[A-Z]{3}"
                    maxLength={3}
                    required
                    defaultValue={editing?.currency ?? 'EGP'}
                    dir="ltr"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className={styles.section}>
              <legend>{t('الصور والروابط', 'Images and links')}</legend>
              <label className="field">
                {t('رابط الصورة', 'Image URL')}
                <input name="image" type="url" defaultValue={editing?.image_url ?? ''} dir="ltr" />
              </label>
              <p>
                {t(
                  'أدخل رابط صورة مستضافة؛ رفع الملفات غير متاح هنا.',
                  'Use a hosted image URL. File uploads are unavailable here.',
                )}
              </p>
              <label className="field">
                {t('رابط المنتج', 'Product URL')}
                <input name="link" type="url" defaultValue={editing?.link_url ?? ''} dir="ltr" />
              </label>
            </fieldset>
            <details>
              <summary>
                {t('تكامل كتالوج Meta (إعدادات متقدمة)', 'Meta catalog integration (advanced)')}
              </summary>
              <p>
                {t(
                  'هذه معرّفات المزود وليست تصنيفات محلية. المنتجات الأصلية تتطلب كتالوجًا معتمدًا.',
                  'These are provider IDs, not local categories. Native products require an approved catalog.',
                )}
              </p>
              <div className="form-grid">
                <label className="field">
                  Catalog ID
                  <input name="catalog" defaultValue={editing?.catalog_id ?? ''} />
                </label>
                <label className="field">
                  Retailer ID
                  <input name="retailer" defaultValue={editing?.retailer_id ?? ''} />
                </label>
              </div>
            </details>
            <label>
              <input type="checkbox" name="archived" defaultChecked={editing?.archived} />
              {t('أرشفة المنتج (يصبح غير متاح للبوت)', 'Archive product (unavailable to bots)')}
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المنتج', 'Save product')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        </div>
      )}
      {preview && (
        <section className="card stack" aria-label={t('معاينة المنتج', 'Product preview')}>
          <header className={styles.header}>
            <h2>{t('معاينة البيانات المحفوظة', 'Saved product preview')}</h2>
            <button className="btn" onClick={() => setPreview(null)}>
              {t('إغلاق المعاينة', 'Close preview')}
            </button>
          </header>
          <p>
            {t(
              'بطاقة بيانات محلية دون إرسال. الشكل النهائي يعتمد على القناة ونوع عقدة البوت.',
              'Local data card, no message sent. Final appearance depends on the channel and bot node type.',
            )}
          </p>
          <div className={styles.preview}>
            <ProductImage key={preview.image_url} product={preview} />
            <h3>{preview.name}</h3>
            <strong dir="ltr">{productPrice(preview.price_cents, preview.currency)}</strong>
            <p>{preview.description}</p>
          </div>
        </section>
      )}
    </section>
  );
}
