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
      setError('');
    }
  };
  const [category, setCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryEditing, setCategoryEditing] = useState('');
  const [copyingCategory, setCopyingCategory] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState<{id: string; name: string} | null>(null);
  const [categoryDeleteConfirmed, setCategoryDeleteConfirmed] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<CatalogProduct | null>(null);
  const [productDeleteConfirmed, setProductDeleteConfirmed] = useState(false);
  const [skuDraft, setSkuDraft] = useState('');
  const [details, setDetails] = useState<
    { id: number; name: string; value: string; kind: 'specification' | 'option' }[]
  >([]);
  const nextDetail = useRef(0);
  const selectedCategory = categories.data.find((item) => item.id === category);

  function openEditor(product: CatalogProduct | null) {
    setDraftImage(product?.image_url ?? null);
    setSkuDraft(product?.sku ?? `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
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
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);
  const products = useData<CatalogProduct[]>('/commerce/products', []);
  const categoryProductCount = deleteCategory
    ? products.data.filter((product) => product.category_id === deleteCategory.id).length
    : 0;
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('active'),
    [sort, setSort] = useState('name');
  const [editing, setEditing] = useState<CatalogProduct | null | undefined>(undefined);
  const [preview, setPreview] = useState<CatalogProduct | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const lock = useRef(false);
  const activeProducts = products.data.filter((product) => !product.archived).length;
  const archivedProducts = products.data.length - activeProducts;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const resetFilters = () => {
    setCategory('all');
    setCategorySearch('');
    setStatus('all');
    setQuery('');
  };
  const rows = products.data
    .filter(
      (p) =>
        (category === 'all' ||
          (category === 'none' ? !p.category_id : p.category_id === category)) &&
        (status === 'all' || p.archived === (status === 'archived')) &&
        `${p.name} ${p.sku} ${p.description}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
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
  function requestProductDelete(product: CatalogProduct) {
    setDeleteProduct(product);
    setProductDeleteConfirmed(false);
    setError('');
    setSuccess('');
  }
  async function removeOrArchiveProduct(action: 'delete' | 'archive') {
    if (!deleteProduct || lock.current || !productDeleteConfirmed) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(
        `/commerce/products/${deleteProduct.id}${action === 'archive' ? '/archive' : ''}`,
        { method: action === 'archive' ? 'POST' : 'DELETE', body: JSON.stringify({ confirm: true }) },
      );
      await products.reload();
      setSuccess(action === 'archive'
        ? t('تمت أرشفة المنتج، ولم تعد البوتات تستخدمه.', 'Product archived and unavailable to bots.')
        : t('تم حذف المنتج نهائيًا.', 'Product permanently deleted.'));
      setDeleteProduct(null);
      setProductDeleteConfirmed(false);
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message.includes('Product is used') || message.includes('referenced by existing records')
          ? t(
              'المنتج مرتبط ببوت أو بيانات موجودة. احذف الارتباط من التدفقات أولًا، ثم أعد المحاولة. لم نحذف أي بيانات.',
              'This product is linked to a bot or existing records. Remove references first; no data was deleted.',
            )
          : message,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function previewSaved(p: CatalogProduct) {
    const request = ++previewRequest.current;
    setError('');
    setServerPreview('');
    setPreview(p);
    setPreviewLoading(true);
    try {
      const r = await api<{ content: { text?: string } }>(`/commerce/products/${p.id}/preview`, {
        method: 'POST',
      });
      if (request === previewRequest.current) setServerPreview(r.content.text ?? '');
    } catch (e) {
      if (request === previewRequest.current) setError((e as Error).message);
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false);
    }
  }
  function closePreview() {
    ++previewRequest.current;
    setPreview(null);
    setServerPreview('');
    setPreviewLoading(false);
    setError('');
  }
  return (
    <section className={styles.root} aria-label={t('إدارة المنتجات', 'Product management')}>
      {editing === undefined && (
        <>
          <header className={styles.catalogHeader}>
            <div>
              <h2>{t('المنتجات', 'Products')}</h2>
              <p>
                {t(
                  'أضف منتجاتك ونظّمها في أقسام، ثم اختر ما يحتاجه البوت داخل مصمم التدفقات.',
                  'Create and organize products here, then select them inside the flow builder.',
                )}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" className="btn" onClick={() => openCategory()}>
                {t('قسم جديد', 'New category')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openEditor(null)}>
                {t('+ إضافة منتج', '+ Add product')}
              </button>
            </div>
          </header>
          <div className={styles.catalogSummary} aria-label={t('ملخص المنتجات', 'Product summary')}>
            <span>
              <strong>{products.data.length}</strong>
              {t('إجمالي المنتجات', 'Total products')}
            </span>
            <span>
              <strong>{activeProducts}</strong>
              {t('منتجات نشطة', 'Active products')}
            </span>
            <span>
              <strong>{archivedProducts}</strong>
              {t('منتجات مؤرشفة', 'Archived products')}
            </span>
            <span>
              <strong>{categories.data.length}</strong>
              {t('أقسام', 'Categories')}
            </span>
          </div>
          {success && (
            <p className="notice" role="status">
              {success}
            </p>
          )}
          {(products.error || (error && editing === undefined && !categoriesOpen && !deleteCategory && !preview)) && (
            <p className="notice error" role="alert">
              {products.error || error}
              <button type="button" className="btn" onClick={() => void products.reload()}>
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </p>
          )}
          <section className={styles.categoriesPanel} aria-label={t('أقسام المنتجات', 'Product categories')}>
            <div className={styles.categoryHeading}>
              <h3>{t('الأقسام', 'Categories')}</h3>
              <label className={styles.categorySearch}>
                <span>{t('البحث في الأقسام', 'Find category')}</span>
                <input
                  type="search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder={t('اسم القسم…', 'Category name…')}
                />
              </label>
            </div>
            <div className={styles.categoryChooser}>
              <label className={styles.categorySelect}>
                <span>{t('عرض منتجات قسم', 'Show products in')}</span>
                <select
                  aria-label={t('اختر قسم المنتجات', 'Choose product category')}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {[
                    { id: 'all', name: t('كل المنتجات', 'All products') },
                    { id: 'none', name: t('دون قسم', 'Uncategorized') },
                    ...categories.data,
                  ]
                    .filter((item) =>
                      item.id === 'all' ||
                      item.id === 'none' ||
                      item.id === category ||
                      item.name.toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase()),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({products.data.filter((product) =>
                          item.id === 'all' ||
                          (item.id === 'none'
                            ? !product.category_id
                            : product.category_id === item.id)).length})
                      </option>
                    ))}
                </select>
              </label>
              <div className={styles.categoryActions}>
                <button type="button" className="btn" onClick={() => openCategory()}>
                  {t('إضافة قسم', 'Add category')}
                </button>
                {selectedCategory && (
                  <>
                    <button type="button" className="btn" onClick={() => openCategory(selectedCategory.id)}>
                      {t('تعديل الاسم', 'Rename')}
                    </button>
                    <button type="button" className="btn" onClick={() => openCategory(selectedCategory.id, true)}>
                      {t('نسخ القسم', 'Duplicate')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setError('');
                        setCategoryDeleteConfirmed(false);
                        setDeleteCategory(selectedCategory);
                      }}
                    >
                      {t('حذف القسم', 'Delete category')}
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className={styles.categoryHint}>
              {t(
                'الأقسام تظهر في قائمة واحدة حتى لو كان لديك مئات الأقسام؛ ابحث بالاسم للوصول للقسم المطلوب.',
                'Categories stay in one dropdown, even for hundreds of categories. Search by name to find one.',
              )}
            </p>
            {categories.error && <p role="alert">{categories.error}</p>}
          </section>
          <Dialog
            open={!!deleteCategory}
            onClose={() => {
              if (!busy) {
                setDeleteCategory(null);
                setCategoryDeleteConfirmed(false);
                setError('');
              }
            }}
            title={t('حذف القسم', 'Delete category')}
          >
            {deleteCategory && (
              <div className={styles.deleteDialog}>
                <strong>{deleteCategory.name}</strong>
                <p>
                  {t(
                    'الحذف نهائي ولا يمكن التراجع عنه. حمايةً للبيانات، لا يمكن حذف قسم يحتوي على منتجات نشطة أو مؤرشفة.',
                    'Deletion is permanent. To protect data, a category cannot be deleted while it contains active or archived products.',
                  )}
                </p>
                <p className={categoryProductCount ? styles.blockedDeletion : styles.safeDeletion}>
                  {categoryProductCount
                    ? t(`القسم يحتوي على ${categoryProductCount} منتج. انقل كل المنتجات لقسم آخر أولًا.`,
                        `This category has ${categoryProductCount} products. Move them first.`)
                    : t('القسم فارغ ويمكن حذفه بعد التأكيد.', 'The category is empty and can be deleted after confirmation.')}
                </p>
                {error && <p className="notice error" role="alert">{error}</p>}
                <label className={styles.confirmCheckbox}>
                  <input
                    type="checkbox"
                    checked={categoryDeleteConfirmed}
                    onChange={(event) => setCategoryDeleteConfirmed(event.target.checked)}
                    disabled={busy || categoryProductCount > 0}
                  />
                  {t('أؤكد الحذف النهائي لهذا القسم', 'I confirm permanent deletion of this category')}
                </label>
                <div className="form-actions">
                  <button type="button" className="btn" disabled={busy} onClick={() => {
                    setDeleteCategory(null);
                    setCategoryDeleteConfirmed(false);
                    setError('');
                  }}>{t('إلغاء', 'Cancel')}</button>
                  <button type="button" className="btn btn-danger"
                    disabled={busy || !categoryDeleteConfirmed || categoryProductCount > 0}
                    onClick={async () => {
                      if (!deleteCategory || lock.current) return;
                      lock.current = true; setBusy(true); setError('');
                      try {
                        await api('/commerce/categories/' + deleteCategory.id, {
                          method: 'DELETE',
                          body: JSON.stringify({ confirm: true }),
                        });
                        await categories.reload();
                        setCategory('all');
                        setDeleteCategory(null);
                        setCategoryDeleteConfirmed(false);
                        setSuccess(t('تم حذف القسم الفارغ.', 'Empty category deleted.'));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        lock.current = false;
                        setBusy(false);
                      }
                    }}
                  >{busy ? t('جارٍ الحذف…', 'Deleting…') : t('حذف نهائيًا', 'Delete permanently')}</button>
                </div>
              </div>
            )}
          </Dialog>
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
              {t('البحث في المنتجات', 'Search products')}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('اسم المنتج أو الكود أو الوصف', 'Name, code, or description')}
              />
            </label>
            <label className="field">
              {t('الحالة', 'Status')}
              <select aria-label={t('الحالة', 'Status')} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">{t('النشطة', 'Active')}</option>
                <option value="archived">{t('المؤرشفة', 'Archived')}</option>
                <option value="all">{t('كل الحالات', 'All statuses')}</option>
              </select>
            </label>
            <label className="field">
              {t('الترتيب', 'Sort')}
              <select aria-label={t('الترتيب', 'Sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">{t('حسب الاسم', 'By name')}</option>
                <option value="price">{t('العملة ثم السعر', 'Currency, then price')}</option>
              </select>
            </label>
            <div className={styles.viewToggle} role="group" aria-label={t('طريقة عرض المنتجات', 'Product view')}>
              <button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>
                {t('قائمة', 'List')}
              </button>
              <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
                {t('بطاقات', 'Cards')}
              </button>
            </div>
            <span className={styles.resultCount} role="status">
              {rows.length} {t('منتج', 'products')}
            </span>
          </div>
          {products.loading ? (
            <p role="status">{t('جارٍ تحميل المنتجات…', 'Loading products…')}</p>
          ) : rows.length ? (
            <div className={styles.grid} data-view={viewMode}>
              {rows.map((p) => (
                <article className={styles.card} key={p.id}>
                  <ProductImage key={p.image_url} product={p} />
                  <div className={styles.body}>
                    <div className={styles.productHeading}>
                      <div>
                        <h3>{p.name}</h3>
                        <small>
                          {categories.data.find((c) => c.id === p.category_id)?.name ??
                            t('دون قسم', 'Uncategorized')}
                          {' · SKU: '}{p.sku}
                        </small>
                      </div>
                      <span className="semantic-state" data-tone={p.archived ? 'danger' : 'active'}>
                        {p.archived ? t('مؤرشف', 'Archived') : t('نشط', 'Active')}
                      </span>
                    </div>
                    <p>{p.description || t('بدون وصف', 'No description')}</p>
                    <div className={styles.productFooter}>
                      <div className={styles.productPrice}>
                        <strong dir="ltr">{productPrice(p.price_cents, p.currency)}</strong>
                        {!!p.options?.length && (
                          <small>
                            {p.options.length} {t('خيارات إضافية', 'priced options')}
                          </small>
                        )}
                      </div>
                      <div className={styles.productActions}>
                        <button type="button" className="btn" onClick={() => openEditor(p)}>
                          {t('تعديل', 'Edit')}
                        </button>
                        <button type="button" className="btn" onClick={() => void previewSaved(p)}>
                          {t('معاينة', 'Preview')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => requestProductDelete(p)}
                        >
                          {t('حذف', 'Delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <h3>
                {products.data.length
                  ? t('لا توجد منتجات تطابق الفلاتر', 'No products match these filters')
                  : t('ابدأ بإضافة أول منتج', 'Start with your first product')}
              </h3>
              <p>
                {products.data.length
                  ? t('جرّب تغيير القسم أو البحث أو حالة المنتج.', 'Change the category, search, or status.')
                  : t('أنشئ منتجًا يدويًا أو استخدم تبويب مصادر البيانات للاستيراد.', 'Create a product or use Data sources to import products.')}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={products.data.length ? resetFilters : () => openEditor(null)}
              >
                {products.data.length ? t('مسح الفلاتر', 'Clear filters') : t('إضافة منتج', 'Add product')}
              </button>
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
      <Dialog
        open={deleteProduct !== null}
        onClose={() => {
          if (!busy) {
            setDeleteProduct(null);
            setProductDeleteConfirmed(false);
            setError('');
          }
        }}
        title={t('حذف أو أرشفة المنتج', 'Delete or archive product')}
      >
        {deleteProduct && (
          <div className={styles.deleteDialog}>
            <strong>{deleteProduct.name}</strong>
            <p className={styles.deleteSku} dir="ltr">SKU: {deleteProduct.sku}</p>
            <p>
              {t(
                'الحذف النهائي يزيل المنتج من قائمة Boat Two ولا يمكن التراجع عنه. الأرشفة تحتفظ بالمنتج لكنها توقف إتاحته للبوت. في الحالتين سيتم منع العملية إذا كان المنتج مرتبطًا بتدفق أو جلسة.',
                'Permanent deletion cannot be undone. Archiving keeps the product but makes it unavailable to bots. Both actions are blocked when the product is referenced by a flow or session.',
              )}
            </p>
            {error && <p className="notice error" role="alert">{error}</p>}
            <label className={styles.confirmCheckbox}>
              <input
                type="checkbox"
                checked={productDeleteConfirmed}
                disabled={busy}
                onChange={(event) => setProductDeleteConfirmed(event.target.checked)}
              />
              {t('راجعت اسم المنتج وأؤكد الإجراء', 'I reviewed the product and confirm the action')}
            </label>
            <div className={styles.deleteActions}>
              <button
                type="button" className="btn"
                disabled={busy}
                onClick={() => {
                  setDeleteProduct(null);
                  setProductDeleteConfirmed(false);
                  setError('');
                }}
              >{t('إلغاء', 'Cancel')}</button>
              {!deleteProduct.archived && (
                <button
                  type="button" className="btn"
                  disabled={busy || !productDeleteConfirmed}
                  onClick={() => void removeOrArchiveProduct('archive')}
                >{t('أرشفة المنتج', 'Archive product')}</button>
              )}
              <button
                type="button" className="btn btn-danger"
                disabled={busy || !productDeleteConfirmed}
                onClick={() => void removeOrArchiveProduct('delete')}
              >{busy ? t('جارٍ التنفيذ…', 'Working…') : t('حذف نهائيًا', 'Delete permanently')}</button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        open={preview !== null}
        onClose={closePreview}
        title={t('معاينة المنتج', 'Product preview')}
      >
        {preview && (
          <div className={styles.previewDialog} aria-busy={previewLoading}>
            <div className={styles.previewProduct}>
              <ProductImage key={preview.image_url} product={preview} />
              <div className={styles.previewProductInfo}>
                <span className="semantic-state" data-tone={preview.archived ? 'danger' : 'active'}>
                  {preview.archived ? t('مؤرشف', 'Archived') : t('نشط', 'Active')}
                </span>
                <h3>{preview.name}</h3>
                <strong dir="ltr">{productPrice(preview.price_cents, preview.currency)}</strong>
                <p>{preview.description || t('بدون وصف', 'No description')}</p>
                <small>SKU: {preview.sku}</small>
              </div>
            </div>
            {!!preview.specifications?.length && (
              <section>
                <h4>{t('المواصفات', 'Specifications')}</h4>
                <dl className={styles.previewDetails}>
                  {preview.specifications.map((item, index) => (
                    <div key={index}>
                      <dt>{item.name}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {!!preview.options?.length && (
              <section>
                <h4>{t('الخيارات والأسعار', 'Options and prices')}</h4>
                <ul className={styles.previewOptions}>
                  {preview.options.map((item, index) => (
                    <li key={index}>
                      <span>{item.name}</span>
                      <bdi>{productPrice(item.priceCents, preview.currency)}</bdi>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {previewLoading && <p role="status">{t('جارٍ تجهيز المعاينة…', 'Loading preview…')}</p>}
            {error && <p role="alert" className="notice error">{error}</p>}
            {serverPreview && <p className={styles.previewResponse}>{serverPreview}</p>}
            <p className={styles.previewDisclaimer}>
              {t(
                'دي معاينة للبيانات المحفوظة فقط؛ مش بيتم إرسال أي رسالة للعميل.',
                'This previews saved product data only; no message is sent to a customer.',
              )}
            </p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={closePreview}>
                {t('إغلاق', 'Close')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => {
                const selected = preview;
                closePreview();
                openEditor(selected);
              }}>
                {t('تعديل المنتج', 'Edit product')}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
