'use client';
import { Dialog } from '../product/ProductUI';
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
  category_id?: string | null;
  specifications?: { name: string; value: string }[];
  options?: { name: string; priceCents: string }[];
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
  const categories = useData<{ id: string; name: string }[]>('/commerce/categories', []);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const closeEditor = () => {
    if (
      !busy &&
      (!editorDirty ||
        window.confirm(t('تجاهل تعديلات المنتج غير المحفوظة؟', 'Discard unsaved product changes?')))
    ) {
      setEditing(undefined);
      setEditorDirty(false);
    }
  };
  const [category, setCategory] = useState('all');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryEditing, setCategoryEditing] = useState('');
  const [copyingCategory, setCopyingCategory] = useState(false);
  const [details, setDetails] = useState<
    { id: number; name: string; value: string; kind: 'specification' | 'option' }[]
  >([]);
  const nextDetail = useRef(0);
  const selectedCategory = categories.data.find((item) => item.id === category);

  function openEditor(product: CatalogProduct | null) {
    setDraftImage(product?.image_url ?? null);
    setDetails([
      ...(product?.specifications ?? []).map((item) => ({
        ...item,
        id: nextDetail.current++,
        kind: 'specification' as const,
      })),
      ...(product?.options ?? []).map((item) => ({
        name: item.name,
        value: productDecimal(item.priceCents),
        id: nextDetail.current++,
        kind: 'option' as const,
      })),
    ]);
    setEditorDirty(false);
    setError('');
    setEditing(product);
  }

  function openCategory(id = '', copy = false) {
    setError('');
    setCategoryEditing(id);
    setCopyingCategory(copy);
    setCategoriesOpen(true);
  }
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [serverPreview, setServerPreview] = useState('');
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
        (category === 'all' ||
          (category === 'none' ? !p.category_id : p.category_id === category)) &&
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
          categoryId: f.get('category') || null,
          ...(f.get('image') ? { imageUrl: f.get('image') } : {}),
          ...(f.get('link') ? { linkUrl: f.get('link') } : {}),
          ...(f.get('catalog') ? { catalogId: f.get('catalog') } : {}),
          ...(f.get('retailer') ? { retailerId: f.get('retailer') } : {}),
          archived: f.get('archived') === 'on',
          specifications: details
            .filter((item) => item.kind === 'specification')
            .map(({ name, value }) => ({ name, value })),
          options: details
            .filter((item) => item.kind === 'option')
            .map(({ name, value }) => ({ name, priceCents: productMinorUnits(value.trim()) })),
        }),
      });
      await products.reload();
      setEditing(undefined);
      setEditorDirty(false);
      setSuccess(t('تم حفظ المنتج.', 'Product saved.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function saveCategory(form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const f = new FormData(form);
      const saved = await api<{ id: string }>(
        '/commerce/categories' +
          (categoryEditing ? '/' + categoryEditing : '') +
          (copyingCategory ? '/duplicate' : ''),
        {
          method: categoryEditing && !copyingCategory ? 'PATCH' : 'POST',
          body: JSON.stringify({ name: f.get('categoryName') }),
        },
      );
      await Promise.all([categories.reload(), copyingCategory && products.reload()]);
      setCategory(saved.id);
      setQuery('');
      if (copyingCategory) setStatus('all');
      setCategoriesOpen(false);
      setSuccess(
        copyingCategory
          ? t('تم نسخ القسم ومنتجاته.', 'Category and products copied.')
          : t('تم حفظ القسم.', 'Category saved.'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function previewSaved(p: CatalogProduct) {
    setError('');
    setServerPreview('');
    setPreview(p);
    try {
      const r = await api<{ content: { text?: string } }>(`/commerce/products/${p.id}/preview`, {
        method: 'POST',
      });
      setServerPreview(r.content.text ?? '');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className={styles.root} aria-label={t('إدارة المنتجات', 'Product management')}>
      {editing === undefined && (
        <>
          <header className={styles.catalogHeader}>
            <div>
              <h2>{t('كتالوج المنتجات', 'Product catalog')}</h2>
              <p>
                {t(
                  'نظّم منتجاتك في أقسام واختر منها داخل البوت.',
                  'Organize your products into categories for use in the bot.',
                )}
              </p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => openCategory()}>
                {t('إضافة قسم', 'Add category')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openEditor(null)}>
                {t('إضافة منتج', 'Add product')}
              </button>
            </div>
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
          <label className="field">
            {t('ابحث عن قسم', 'Find a category')}
            <input type="search" value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)}
              placeholder={t('اسم القسم…', 'Category name…')} />
          </label>
          <nav className={styles.categoryShelf} aria-label={t('الأقسام', 'Categories')}>
            {[
              { id: 'all', name: t('كل المنتجات', 'All products') },
              ...categories.data,
              { id: 'none', name: t('دون قسم', 'Uncategorized') },
            ].filter((item) => item.id === 'all' || item.id === 'none' ||
              item.name.toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase())).map((item) => (
              <button
                type="button"
                className="btn"
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.name}
                <small>
                  {
                    products.data.filter(
                      (product) =>
                        item.id === 'all' ||
                        (item.id === 'none'
                          ? !product.category_id
                          : product.category_id === item.id),
                    ).length
                  }
                </small>
              </button>
            ))}
          </nav>
          {categories.error && <p role="alert">{categories.error}</p>}
          {selectedCategory && (
            <header className={styles.header}>
              <h3>{selectedCategory.name}</h3>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => openCategory(selectedCategory.id)}
                >
                  {t('تعديل اسم القسم', 'Rename category')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => openCategory(selectedCategory.id, true)}
                >
                  {t('نسخ القسم ومنتجاته', 'Duplicate category and products')}
                </button>
              </div>
            </header>
          )}
          <Dialog
            open={categoriesOpen}
            onClose={() => {
              if (!busy) setCategoriesOpen(false);
            }}
            title={
              copyingCategory
                ? t('نسخ القسم ومنتجاته', 'Duplicate category and products')
                : categoryEditing
                  ? t('تعديل اسم القسم', 'Rename category')
                  : t('إضافة قسم', 'Add category')
            }
          >
            <form
              className="stack"
              key={String(categoriesOpen) + categoryEditing + String(copyingCategory)}
              onSubmit={(event) => {
                event.preventDefault();
                void saveCategory(event.currentTarget);
              }}
            >
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              {copyingCategory && (
                <p>
                  {t(
                    'هيتعمل قسم مستقل بمنتجات وأسعار ومواصفات منسوخة، وبرموز منتجات جديدة.',
                    'Create an independent category with copied products, prices and details, and new product codes.',
                  )}
                </p>
              )}
              <label className="field">
                {t('اسم القسم', 'Category name')}
                <input
                  name="categoryName"
                  required
                  maxLength={120}
                  defaultValue={
                    copyingCategory
                      ? t('نسخة من ', 'Copy of ') + (selectedCategory?.name ?? '').slice(0, 105)
                      : selectedCategory?.id === categoryEditing
                        ? selectedCategory.name
                        : ''
                  }
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {copyingCategory
                  ? t('إنشاء النسخة', 'Create copy')
                  : t('حفظ القسم', 'Save category')}
              </button>
            </form>
          </Dialog>
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
              <select
                aria-label={t('الحالة', 'Status')}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">{t('نشط', 'Active')}</option>
                <option value="archived">{t('مؤرشف', 'Archived')}</option>
                <option value="all">{t('الكل', 'All')}</option>
              </select>
            </label>
            <label className="field">
              {t('الترتيب', 'Sort')}
              <select
                aria-label={t('الترتيب', 'Sort')}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
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
                    <span className="semantic-state" data-tone={p.archived ? 'danger' : 'active'}>
                      {p.archived ? t('مؤرشف', 'Archived') : t('نشط', 'Active')}
                    </span>
                    <h3>{p.name}</h3>
                    <small>
                      {categories.data.find((c) => c.id === p.category_id)?.name ??
                        t('دون قسم', 'Uncategorized')}
                    </small>
                    <strong dir="ltr">{productPrice(p.price_cents, p.currency)}</strong>
                    <p>{p.description}</p>
                    <small>SKU: {p.sku}</small>
                    {!!p.options?.length && (
                      <small>
                        {p.options.length} {t('خيارات بسعر', 'priced options')}
                      </small>
                    )}
                    <div className="form-actions">
                      <button className="btn" onClick={() => openEditor(p)}>
                        {t('تعديل', 'Edit')}
                      </button>
                      <button className="btn" onClick={() => void previewSaved(p)}>
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
        </>
      )}
      {editing !== undefined && (
        <Dialog open onClose={closeEditor} className={styles.editorDialog}
          title={editing ? t('تعديل المنتج', 'Edit product') : t('منتج جديد', 'New product')}>
          <form
            className={styles.productForm}
            onChange={() => setEditorDirty(true)}
            key={editing?.id ?? 'new'}
            onSubmit={(e) => {
              e.preventDefault();
              void save(e.currentTarget);
            }}
          >
            <div className={styles.editorFields}>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <label className="field">
              {t('قسم المنتج', 'Product category')}
              <select
                aria-label={t('قسم المنتج', 'Product category')}
                name="category"
                defaultValue={editing ? (editing.category_id ?? '') : (selectedCategory?.id ?? '')}
              >
                <option value="">{t('دون قسم', 'Uncategorized')}</option>
                {categories.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
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
                {t('وصف المنتج', 'Product description')}
                <textarea
                  name="description"
                  rows={4}
                  maxLength={1000}
                  defaultValue={editing?.description}
                />
              </label>
            </fieldset>
            <fieldset className={styles.priceSection}>
              <legend>{t('السعر والعملة', 'Price and currency')}</legend>
              <div className="form-grid">
                <label className="field">
                  {t('سعر المنتج (مثال 150.00)', 'Product price (e.g. 150.00)')}
                  <input
                    name="price"
                    inputMode="decimal"
                    pattern="[0-9]{1,13}(\.[0-9]{1,2})?"
                    required
                    defaultValue={editing ? productDecimal(editing.price_cents) : ''}
                    placeholder="150.00"
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
            {(['specification', 'option'] as const).map((kind) => (
              <fieldset className={styles.section} key={kind}>
                <legend>
                  {kind === 'specification'
                    ? t('مواصفات المنتج', 'Specifications')
                    : t('خيارات المنتج وأسعارها', 'Product options and prices')}
                </legend>
                {details
                  .filter((item) => item.kind === kind)
                  .map((item) => (
                    <div className={styles.detailRow} key={item.id}>
                      <label className="field">
                        {kind === 'specification'
                          ? t('اسم المواصفة', 'Specification name')
                          : t('اسم الخيار', 'Option name')}
                        <input
                          required
                          maxLength={kind === 'specification' ? 80 : 120}
                          value={item.name}
                          onChange={(e) =>
                            setDetails((rows) =>
                              rows.map((row) =>
                                row.id === item.id ? { ...row, name: e.target.value } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        {kind === 'specification'
                          ? t('القيمة', 'Value')
                          : t('السعر بعملة المنتج', 'Price in product currency')}
                        <input
                          required
                          maxLength={kind === 'specification' ? 200 : 16}
                          inputMode={kind === 'option' ? 'decimal' : 'text'}
                          pattern={kind === 'option' ? '[0-9]{1,13}(\\.[0-9]{1,2})?' : undefined}
                          value={item.value}
                          onChange={(e) =>
                            setDetails((rows) =>
                              rows.map((row) =>
                                row.id === item.id ? { ...row, value: e.target.value } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn"
                        aria-label={t('إزالة السطر', 'Remove row')}
                        onClick={() => {
                          setEditorDirty(true);
                          setDetails((rows) => rows.filter((row) => row.id !== item.id));
                        }}
                      >
                        {t('إزالة', 'Remove')}
                      </button>
                    </div>
                  ))}
                <button
                  type="button"
                  className="btn"
                  disabled={details.filter((row) => row.kind === kind).length >= 100}
                  onClick={() => {
                    const id = nextDetail.current++;
                    setDetails((rows) => [...rows, { id, name: '', value: '', kind }]);
                    setEditorDirty(true);
                  }}
                >
                  {kind === 'specification'
                    ? t('+ إضافة مواصفة', '+ Add specification')
                    : t('+ إضافة خيار بسعر', '+ Add priced option')}
                </button>
              </fieldset>
            ))}
            <details className={styles.section}>
              <summary>{t('الصور والروابط (اختياري)', 'Images and links (optional)')}</summary>
              <label className="field">
                {t('رابط الصورة', 'Image URL')}
                <input
                  name="image"
                  type="url"
                  onChange={(e) => setDraftImage(e.target.value || null)}
                  defaultValue={editing?.image_url ?? ''}
                  dir="ltr"
                />
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
            </details>
            {draftImage && (
              <div className={styles.preview}>
                <ProductImage
                  key={draftImage}
                  product={{ name: t('معاينة الصورة', 'Image preview'), image_url: draftImage }}
                />
              </div>
            )}
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
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المنتج', 'Save product')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={closeEditor}>
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </form>
        </Dialog>
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
            {!!preview.specifications?.length && (
              <dl>
                {preview.specifications.map((item, index) => (
                  <div key={index}>
                    <dt>{item.name}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!!preview.options?.length && (
              <ul>
                {preview.options.map((item, index) => (
                  <li key={index}>
                    {item.name} · <bdi>{productPrice(item.priceCents, preview.currency)}</bdi>
                  </li>
                ))}
              </ul>
            )}
            {serverPreview && <p>{serverPreview}</p>}
          </div>
        </section>
      )}
    </section>
  );
}
