'use client';
import { Dialog } from '../product/ProductUI';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { productDecimal, productMinorUnits, productPrice } from '../../lib/product-money';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import styles from './product-catalog.module.css';
const catalogEditorModesEnabled = process.env.NEXT_PUBLIC_CATALOG_EDITOR_MODES === 'true';
const categoryTreeEnabled = process.env.NEXT_PUBLIC_CATALOG_CATEGORY_TREE === 'true';
type Category = { id: string; name: string; parent_id?: string | null };
const editorModePreference = 'boat.catalog.editor-mode';
type EditorMode = 'simple' | 'advanced';

function orderCategories(categories: Category[]) {
  if (!categoryTreeEnabled) return categories.map((category) => ({ ...category, label: category.name, ancestors: [] as string[] }));
  const children = new Map<string | null, Category[]>();
  for (const category of categories) {
    const parent = category.parent_id ?? null;
    const branch = children.get(parent) ?? [];
    branch.push(category);
    children.set(parent, branch);
  }
  const ordered: (Category & { ancestors: string[]; label: string })[] = [];
  const walk = (parent: string | null, path: string[], ancestors: string[]) => {
    for (const category of children.get(parent) ?? []) {
      const names = [...path, category.name];
      ordered.push({ ...category, ancestors, label: names.join(' / ') });
      walk(category.id, names, [...ancestors, category.id]);
    }
  };
  walk(null, [], []);
  return ordered;
}

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
  const { t } = useLocale();
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
    <div
      className={styles.placeholder}
      role="img"
      aria-label={t('لا توجد صورة للمنتج', 'No product image')}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="26" height="22" rx="3" />
        <circle cx="11" cy="12" r="2.4" />
        <path d="M5 24l8-8 6 5 4-4 6 6" />
      </svg>
      <span>{t('بدون صورة', 'No image')}</span>
    </div>
  );
}
export default function ProductCatalog({ navigation }: { navigation?: ReactNode } = {}) {
  const { t } = useLocale();
  const categories = useData<Category[]>('/commerce/categories', []);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('simple');

  useEffect(() => {
    if (!catalogEditorModesEnabled) return;
    try {
      if (localStorage.getItem(editorModePreference) === 'advanced') setEditorMode('advanced');
    } catch {
      // Switching modes still works when browser storage is unavailable.
    }
  }, []);

  function changeEditorMode(mode: EditorMode, form: HTMLFormElement | null) {
    if (mode === 'simple') {
      const invalid = form?.querySelector<HTMLInputElement>('[data-editor-advanced] input:invalid');
      if (invalid) {
        const section = invalid.closest('details');
        if (section) section.open = true;
        invalid.reportValidity();
        return;
      }
    }
    setEditorMode(mode);
    try {
      localStorage.setItem(editorModePreference, mode);
    } catch {
      // Only the display preference is local. Product values always use the existing API.
    }
  }
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
  const [page, setPage] = useState(1);
  const listStart = useRef<HTMLDivElement>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  useEffect(() => {
    if (!categoryTreeEnabled) return;
    const timeout = window.setTimeout(() => {
      setCatalogQuery(productSearch.trim());
      setPage(1);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [productSearch]);
  const [categoryEditing, setCategoryEditing] = useState('');
  const [categoryParent, setCategoryParent] = useState('');
  const [copyingCategory, setCopyingCategory] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState<{ id: string; name: string } | null>(null);
  const [categoryDeleteConfirmed, setCategoryDeleteConfirmed] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<CatalogProduct | null>(null);
  const [productDeleteConfirmed, setProductDeleteConfirmed] = useState(false);
  const [skuDraft, setSkuDraft] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    specification: false,
    option: false,
    media: false,
    meta: false,
  });

  const [details, setDetails] = useState<
    { id: number; name: string; value: string; kind: 'specification' | 'option' }[]
  >([]);
  const nextDetail = useRef(0);
  const orderedCategories = orderCategories(categories.data);
  const selectedCategory = orderedCategories.find((item) => item.id === category);
  const parentOptions = orderedCategories.filter(
    (item) => item.id !== categoryEditing && !item.ancestors.includes(categoryEditing),
  );

  function openEditor(product: CatalogProduct | null) {
    setDraftImage(product?.image_url ?? null);
    setExpandedSections({
      specification: !!product?.specifications?.length,
      option: !!product?.options?.length,
      media: !!(product?.image_url || product?.link_url),
      meta: !!(product?.catalog_id || product?.retailer_id),
    });

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

  function openCategory(id = '', copy = false, parent = '') {
    setError('');
    setCategoryEditing(id);
    setCategoryParent(parent || categories.data.find((item) => item.id === id)?.parent_id || '');
    setCopyingCategory(copy);
    setCategoriesOpen(true);
  }
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [serverPreview, setServerPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);
  const legacyProducts = useData<CatalogProduct[]>(categoryTreeEnabled ? null : '/commerce/products', []);
  const scope = useData<{ category_id: string | null; count: number }[]>(
    categoryTreeEnabled ? '/commerce/products/scope' : null,
    [],
  );
  const pagePath = '/commerce/products/page?' + new URLSearchParams({
    category,
    q: catalogQuery,
    page: String(page),
  });
  const pagedProducts = useData<{ rows: CatalogProduct[]; total: number; page: number }>(
    categoryTreeEnabled ? pagePath : null,
    { rows: [], total: 0, page: 1 },
  );
  const reloadProducts = () => categoryTreeEnabled
    ? Promise.all([pagedProducts.reload(), scope.reload()])
    : legacyProducts.reload();
  const productError = categoryTreeEnabled ? pagedProducts.error || scope.error : legacyProducts.error;
  const productsLoading = categoryTreeEnabled
    ? pagedProducts.loading || scope.loading || (!pagedProducts.error && pagedProducts.loadedPath !== pagePath)
    : legacyProducts.loading;
  const categoryProductCount = deleteCategory
    ? categoryTreeEnabled
      ? scope.data.find((row) => row.category_id === deleteCategory.id)?.count ?? 0
      : legacyProducts.data.filter((product) => product.category_id === deleteCategory.id).length
    : 0;
  const categoryHasChildren = deleteCategory
    ? categories.data.some((item) => item.parent_id === deleteCategory.id)
    : false;
  const categoryDeletionBlocked = categoryProductCount > 0 || categoryHasChildren ||
    (categoryTreeEnabled && (scope.loading || !!scope.error));
  const [editing, setEditing] = useState<CatalogProduct | null | undefined>(undefined);
  const [preview, setPreview] = useState<CatalogProduct | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [success]);
  function changeCategory(id: string) {
    setCategory(id);
    setPage(1);
  }
  const lock = useRef(false);
  const resetFilters = () => {
    changeCategory('all');
    setCategorySearch('');
    setProductSearch('');
    setCatalogQuery('');
  };
  const productQuery = productSearch.trim().toLocaleLowerCase();
  const branches = new Map(orderedCategories.map((item) => [item.id, item.ancestors]));
  const categoryCounts = new Map<string, number>();
  const productCounts = categoryTreeEnabled
    ? scope.data
    : legacyProducts.data.map((product) => ({ category_id: product.category_id, count: 1 }));
  for (const { category_id, count } of productCounts) {
    const id = category_id ?? 'none';
    for (const branch of ['all', id, ...(branches.get(id) ?? [])]) {
      categoryCounts.set(branch, (categoryCounts.get(branch) ?? 0) + count);
    }
  }
  const legacyRows = legacyProducts.data
    .filter((product) => category === 'all' ||
      (category === 'none' ? !product.category_id : product.category_id === category))
    .filter((product) =>
      [product.name, product.sku].some((value) => value?.toLocaleLowerCase().includes(productQuery)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const matchingPageLoaded = pagedProducts.loadedPath === pagePath && !pagedProducts.error;
  const resultCount = categoryTreeEnabled
    ? matchingPageLoaded ? pagedProducts.data.total : 0
    : legacyRows.length;
  const productCount = categoryCounts.get('all') ?? 0;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(resultCount / pageSize));
  const currentPage = categoryTreeEnabled ? pagedProducts.data.page : Math.min(page, pageCount);
  const firstRow = (currentPage - 1) * pageSize;
  const visibleRows = categoryTreeEnabled
    ? matchingPageLoaded ? pagedProducts.data.rows : []
    : legacyRows.slice(firstRow, firstRow + pageSize);
  useEffect(() => {
    if (!categoryTreeEnabled) setPage((value) => Math.min(value, pageCount));
  }, [pageCount]);
  const pageNumbers = Array.from(
    new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount]),
  )
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  function changePage(value: number) {
    setPage(value);
    listStart.current?.scrollIntoView({ block: 'start' });
    listStart.current?.focus({ preventScroll: true });
  }
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
          imageUrl: String(f.get('image') ?? '').trim() || null,
          linkUrl: String(f.get('link') ?? '').trim() || null,
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
      await reloadProducts();
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
    setSuccess('');
    try {
      const f = new FormData(form);
      const saved = await api<{ id: string }>(
        '/commerce/categories' +
          (categoryEditing ? '/' + categoryEditing : '') +
          (copyingCategory ? '/duplicate' : ''),
        {
          method: categoryEditing && !copyingCategory ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: f.get('categoryName'),
            ...(categoryTreeEnabled && !copyingCategory ? { parentId: f.get('parent') || null } : {}),
          }),
        },
      );
      await Promise.all([categories.reload(), copyingCategory && reloadProducts()]);
      changeCategory(saved.id);
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
    setSuccess('');
    try {
      await api(`/commerce/products/${deleteProduct.id}${action === 'archive' ? '/archive' : ''}`, {
        method: action === 'archive' ? 'POST' : 'DELETE',
        body: JSON.stringify({ confirm: true }),
      });
      await reloadProducts();
      setSuccess(
        action === 'archive'
          ? t(
              'تمت أرشفة المنتج، ولم تعد البوتات تستخدمه.',
              'Product archived and unavailable to bots.',
            )
          : t('تم حذف المنتج نهائيًا.', 'Product permanently deleted.'),
      );
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
          <div className={styles.compactActions}>
            {navigation}
            <div className={styles.headerActions}>
              <button type="button" className="btn btn-primary" onClick={() => openEditor(null)}>
                {t('+ إضافة منتج', '+ Add product')}
              </button>
              <button type="button" className="btn" onClick={() => openCategory()}>
                {t('إضافة قسم', 'Add category')}
              </button>
            </div>
          </div>
          {success && (
            <div className={styles.successToast} role="status" aria-live="polite">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 3 3 5-6" />
              </svg>
              <span>{success}</span>
            </div>
          )}
          {(productError ||
            (error && editing === undefined && !categoriesOpen && !deleteCategory && !preview)) && (
            <p className="notice error" role="alert">
              {productError || error}
              <button type="button" className="btn" onClick={() => void reloadProducts()}>
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </p>
          )}
          <section
            className={styles.categoriesPanel}
            aria-label={t('أقسام المنتجات', 'Product categories')}
          >
            <div className={styles.categoryHeading}>
              <h3>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="2" />
                  <rect x="14" y="3" width="7" height="7" rx="2" />
                  <rect x="3" y="14" width="7" height="7" rx="2" />
                  <rect x="14" y="14" width="7" height="7" rx="2" />
                </svg>
                {t('الأقسام', 'Categories')}
              </h3>
              <label className={styles.categorySearch}>
                <span>{t('البحث في الأقسام', 'Find category')}</span>
                <input
                  type="search"
                  aria-label={t('البحث في الأقسام', 'Find category')}
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
                  onChange={(event) => changeCategory(event.target.value)}
                >
                  {[
                    { id: 'all', label: t('كل المنتجات', 'All products') },
                    { id: 'none', label: t('دون قسم', 'Uncategorized') },
                    ...orderedCategories,
                  ]
                    .filter(
                      (item) =>
                        item.id === 'all' ||
                        item.id === 'none' ||
                        item.id === category ||
                        item.label
                          .toLocaleLowerCase()
                          .includes(categorySearch.trim().toLocaleLowerCase()),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} ({categoryCounts.get(item.id) ?? 0})
                      </option>
                    ))}
                </select>
              </label>
              <div className={styles.categoryActions}>
                {selectedCategory && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => openCategory(selectedCategory.id)}
                    >
                      {categoryTreeEnabled ? t('تعديل القسم', 'Edit category') : t('تعديل الاسم', 'Rename')}
                    </button>
                    {categoryTreeEnabled && (
                      <button type="button" className="btn" onClick={() => openCategory('', false, selectedCategory.id)}>
                        {t('إضافة قسم فرعي', 'Add subcategory')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => openCategory(selectedCategory.id, true)}
                    >
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
                <p className={categoryDeletionBlocked ? styles.blockedDeletion : styles.safeDeletion}>
                  {scope.error
                    ? t('تعذر التحقق من المنتجات داخل القسم.', 'Could not verify products in this category.')
                    : scope.loading && categoryTreeEnabled
                      ? t('جارٍ التحقق من القسم…', 'Checking category…')
                      : categoryProductCount
                    ? t(
                        `القسم يحتوي على ${categoryProductCount} منتج. انقل كل المنتجات لقسم آخر أولًا.`,
                        `This category has ${categoryProductCount} products. Move them first.`,
                      )
                    : categoryHasChildren
                      ? t('انقل الأقسام الفرعية قبل حذف هذا القسم.', 'Move the subcategories before deleting this category.')
                      : t(
                        'القسم فارغ ويمكن حذفه بعد التأكيد.',
                        'The category is empty and can be deleted after confirmation.',
                      )}
                </p>
                {error && (
                  <p className="notice error" role="alert">
                    {error}
                  </p>
                )}
                <label className={styles.confirmCheckbox}>
                  <input
                    type="checkbox"
                    checked={categoryDeleteConfirmed}
                    onChange={(event) => setCategoryDeleteConfirmed(event.target.checked)}
                    disabled={busy || categoryDeletionBlocked}
                  />
                  {t(
                    'أؤكد الحذف النهائي لهذا القسم',
                    'I confirm permanent deletion of this category',
                  )}
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setDeleteCategory(null);
                      setCategoryDeleteConfirmed(false);
                      setError('');
                    }}
                  >
                    {t('إلغاء', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || !categoryDeleteConfirmed || categoryDeletionBlocked}
                    onClick={async () => {
                      if (!deleteCategory || lock.current) return;
                      lock.current = true;
                      setBusy(true);
                      setError('');
                      try {
                        await api('/commerce/categories/' + deleteCategory.id, {
                          method: 'DELETE',
                          body: JSON.stringify({ confirm: true }),
                        });
                        await categories.reload();
                        changeCategory('all');
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
                  >
                    {busy ? t('جارٍ الحذف…', 'Deleting…') : t('حذف نهائيًا', 'Delete permanently')}
                  </button>
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
                  ? categoryTreeEnabled ? t('تعديل القسم', 'Edit category') : t('تعديل اسم القسم', 'Rename category')
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
              {categoryTreeEnabled && !copyingCategory && (
                <label className="field">
                  {t('القسم الرئيسي', 'Parent category')}
                  <select name="parent" defaultValue={categoryParent}>
                    <option value="">{t('بدون قسم رئيسي', 'No parent category')}</option>
                    {parentOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {copyingCategory
                  ? t('إنشاء النسخة', 'Create copy')
                  : t('حفظ القسم', 'Save category')}
              </button>
            </form>
          </Dialog>
          <header className={styles.resultsHeader}>
            <div>
              <h2>{selectedCategory?.name ?? (category === 'none' ? t('دون قسم', 'Uncategorized') : t('كل المنتجات', 'All products'))}</h2>
              {!productsLoading && !productError && <small role="status">{t(`عدد المنتجات: ${resultCount}`, `Products: ${resultCount}`)}</small>}
            </div>
            <label className="field">
              {t('البحث في المنتجات', 'Search products')}
              <input
                type="search"
                value={productSearch}
                maxLength={120}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  if (!categoryTreeEnabled) setPage(1);
                }}
                placeholder={t('اسم المنتج أو الكود', 'Product name or SKU')}
              />
            </label>
          </header>
          {productsLoading ? (
            <p role="status">{t('جارٍ تحميل المنتجات…', 'Loading products…')}</p>
          ) : productError && !visibleRows.length ? null : visibleRows.length ? (
            <>
              <div
                className={styles.grid}
                data-view="list"
                ref={listStart}
                tabIndex={-1}
                aria-label={t('قائمة المنتجات', 'Product list')}
              >
                {visibleRows.map((p) => (
                  <article className={styles.card} key={p.id}>
                    <ProductImage key={p.image_url} product={p} />
                    <div className={styles.body}>
                      <div className={styles.productHeading}>
                        <div>
                          <h3>{p.name}</h3>
                          <small>
                            {categories.data.find((c) => c.id === p.category_id)?.name ??
                              t('دون قسم', 'Uncategorized')}
                            {' · SKU: '}
                            {p.sku}
                          </small>
                        </div>
                        <span
                          className="semantic-state"
                          data-tone={p.archived ? 'danger' : 'active'}
                        >
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
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void previewSaved(p)}
                          >
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
              <nav className={styles.pagination} aria-label={t('صفحات المنتجات', 'Product pages')}>
                <span className={styles.pageRange} role="status">
                  {firstRow + 1}–{Math.min(firstRow + pageSize, resultCount)} {t('من', 'of')}{' '}
                  {resultCount} {t('منتج', 'products')}
                </span>
                <div className={styles.pageButtons}>
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => changePage(currentPage - 1)}
                  >
                    {t('السابق', 'Previous')}
                  </button>
                  {pageNumbers.map((value, index) => (
                    <span key={value} className={styles.pageNumber}>
                      {index > 0 && value - pageNumbers[index - 1] > 1 && (
                        <span className={styles.pageGap} aria-hidden="true">
                          …
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={t('الصفحة ', 'Page ') + value}
                        aria-current={value === currentPage ? 'page' : undefined}
                        onClick={() => changePage(value)}
                      >
                        {value}
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    disabled={currentPage === pageCount}
                    onClick={() => changePage(currentPage + 1)}
                  >
                    {t('التالي', 'Next')}
                  </button>
                </div>
              </nav>
            </>
          ) : (
            <div className={styles.empty}>
              <h3>
                {productCount
                  ? t('لا توجد منتجات تطابق الفلاتر', 'No products match these filters')
                  : t('ابدأ بإضافة أول منتج', 'Start with your first product')}
              </h3>
              <p>
                {productCount
                  ? t(
                      'غيّر البحث أو اختر قسمًا آخر.',
                      'Try another search or category.',
                    )
                  : t(
                      'أنشئ منتجًا يدويًا أو استخدم تبويب مصادر البيانات للاستيراد.',
                      'Create a product or use Data sources to import products.',
                    )}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={productCount ? resetFilters : () => openEditor(null)}
              >
                {productCount
                  ? t('مسح الفلاتر', 'Clear filters')
                  : t('إضافة منتج', 'Add product')}
              </button>
            </div>
          )}
        </>
      )}
      {editing !== undefined && (
        <Dialog
          open
          onClose={closeEditor}
          className={styles.editorDialog}
          title={editing ? t('تعديل المنتج', 'Edit product') : t('منتج جديد', 'New product')}
        >
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
              {catalogEditorModesEnabled && (
                <div className={styles.editorModes} role="group" aria-label={t('وضع المحرر', 'Editor mode')}>
                  {(['simple', 'advanced'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`btn ${editorMode === mode ? 'btn-primary' : ''}`}
                      type="button"
                      aria-pressed={editorMode === mode}
                      disabled={busy}
                      onClick={(event) => changeEditorMode(mode, event.currentTarget.form)}
                    >
                      {mode === 'simple' ? t('الوضع السهل', 'Simple') : t('الوضع المتقدم', 'Advanced')}
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.editorGuide}>
                <strong>
                  {editing
                    ? t('تعديل بيانات المنتج', 'Edit product details')
                    : t('إضافة منتج جديد', 'Create a product')}
                </strong>
                <p>
                  {t(
                    'املأ الاسم والقسم والسعر. باقي الحقول اختيارية ويمكن إضافتها لاحقًا.',
                    'Enter a name, category and price. Other details can be added later.',
                  )}
                </p>
              </div>
              <fieldset className={styles.editorBlock}>
                <legend>{t('المعلومات الأساسية', 'Basic information')}</legend>
                <div className={styles.editorTwoColumns}>
                  <label className="field">
                    {t('اسم المنتج *', 'Product name *')}
                    <input
                      autoFocus
                      name="name"
                      required
                      maxLength={120}
                      defaultValue={editing?.name}
                      placeholder={t('مثال: رحلة عمرة 5 أيام', 'e.g. Five-day travel package')}
                    />
                  </label>
                  <label className="field">
                    {t('القسم', 'Category')}
                    <select
                      aria-label={t('قسم المنتج', 'Product category')}
                      name="category"
                      defaultValue={
                        editing ? (editing.category_id ?? '') : (selectedCategory?.id ?? '')
                      }
                    >
                      <option value="">{t('دون قسم', 'Uncategorized')}</option>
                      {orderedCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t('السعر *', 'Price *')}
                    <input
                      name="price"
                      inputMode="decimal"
                      pattern="[0-9]{1,13}([.][0-9]{1,2})?"
                      required
                      defaultValue={editing ? productDecimal(editing.price_cents) : ''}
                      placeholder="150.00"
                      dir="ltr"
                    />
                  </label>
                  <label className="field">
                    {t('العملة *', 'Currency *')}
                    <input
                      name="currency"
                      pattern="[A-Z]{3}"
                      maxLength={3}
                      required
                      defaultValue={editing?.currency ?? 'EGP'}
                      dir="ltr"
                      placeholder="EGP"
                    />
                  </label>
                </div>
                <div className={styles.editorSkuRow}>
                  <label className="field">
                    {t('كود المنتج SKU *', 'Product code (SKU) *')}
                    <input
                      name="sku"
                      required
                      maxLength={80}
                      value={skuDraft}
                      onChange={(event) => setSkuDraft(event.target.value)}
                      dir="ltr"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setSkuDraft(`SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
                      setEditorDirty(true);
                    }}
                  >
                    {t('توليد كود', 'Generate code')}
                  </button>
                </div>
                <label className="field">
                  {t('وصف المنتج (اختياري)', 'Description (optional)')}
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={1000}
                    defaultValue={editing?.description}
                    placeholder={t(
                      'اكتب وصفًا مختصرًا يفهمه العميل والبوت.',
                      'Describe the product for customers and your bot.',
                    )}
                  />
                </label>
              </fieldset>
              {(['specification', 'option'] as const).map((kind) => (
                <details
                  className={styles.editorDisclosure}
                  data-editor-advanced
                  hidden={catalogEditorModesEnabled && editorMode === 'simple'}
                  key={kind}
                  open={expandedSections[kind]}
                  onToggle={(event) => {
                    const isOpen = event.currentTarget.open;
                    setExpandedSections((current) =>
                      current[kind] === isOpen ? current : { ...current, [kind]: isOpen },
                    );
                  }}
                >
                  <summary>
                    {kind === 'specification'
                      ? t('المواصفات الإضافية', 'Additional specifications')
                      : t('خيارات المنتج وأسعارها', 'Product options and prices')}
                    <span>{details.filter((item) => item.kind === kind).length}</span>
                  </summary>
                  <div className={styles.editorDisclosureBody}>
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
                              pattern={
                                kind === 'option' ? '[0-9]{1,13}(\\.[0-9]{1,2})?' : undefined
                              }
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
                  </div>
                </details>
              ))}
              <details
                className={styles.editorDisclosure}
                open={expandedSections.media}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setExpandedSections((current) =>
                    current.media === isOpen ? current : { ...current, media: isOpen },
                  );
                }}
              >
                <summary>
                  {t('صورة المنتج والروابط (اختياري)', 'Product image and links (optional)')}
                </summary>
                <div className={styles.editorDisclosureBody}>
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
                    <input
                      name="link"
                      type="url"
                      defaultValue={editing?.link_url ?? ''}
                      dir="ltr"
                    />
                  </label>
                </div>
              </details>
              {draftImage && (
                <div className={styles.preview}>
                  <ProductImage
                    key={draftImage}
                    product={{ name: t('معاينة الصورة', 'Image preview'), image_url: draftImage }}
                  />
                </div>
              )}
              <details
                className={styles.editorDisclosure}
                data-editor-advanced
                hidden={catalogEditorModesEnabled && editorMode === 'simple'}
                open={expandedSections.meta}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setExpandedSections((current) =>
                    current.meta === isOpen ? current : { ...current, meta: isOpen },
                  );
                }}
              >
                <summary>
                  {t('تكامل كتالوج Meta (متقدم)', 'Meta catalog integration (advanced)')}
                </summary>
                <div className={styles.editorDisclosureBody}>
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
                </div>
              </details>
              <label
                className={styles.archiveField}
                hidden={catalogEditorModesEnabled && editorMode === 'simple'}
              >
                <input type="checkbox" name="archived" defaultChecked={editing?.archived} />
                <span>
                  <strong>{t('أرشفة المنتج', 'Archive product')}</strong>
                  <small>
                    {t(
                      'المنتج المؤرشف لا يمكن استخدامه في البوت؛ راجع ارتباطاته أولًا.',
                      'Archived products are unavailable to bots. Check dependencies first.',
                    )}
                  </small>
                </span>
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
            <p className={styles.deleteSku} dir="ltr">
              SKU: {deleteProduct.sku}
            </p>
            <p>
              {t(
                'الحذف النهائي يزيل المنتج من قائمة Boat Two ولا يمكن التراجع عنه. الأرشفة تحتفظ بالمنتج لكنها توقف إتاحته للبوت. في الحالتين سيتم منع العملية إذا كان المنتج مرتبطًا بتدفق أو جلسة.',
                'Permanent deletion cannot be undone. Archiving keeps the product but makes it unavailable to bots. Both actions are blocked when the product is referenced by a flow or session.',
              )}
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
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
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setDeleteProduct(null);
                  setProductDeleteConfirmed(false);
                  setError('');
                }}
              >
                {t('إلغاء', 'Cancel')}
              </button>
              {!deleteProduct.archived && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !productDeleteConfirmed}
                  onClick={() => void removeOrArchiveProduct('archive')}
                >
                  {t('أرشفة المنتج', 'Archive product')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !productDeleteConfirmed}
                onClick={() => void removeOrArchiveProduct('delete')}
              >
                {busy ? t('جارٍ التنفيذ…', 'Working…') : t('حذف نهائيًا', 'Delete permanently')}
              </button>
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
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const selected = preview;
                  closePreview();
                  openEditor(selected);
                }}
              >
                {t('تعديل المنتج', 'Edit product')}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
