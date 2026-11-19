'use client';
import { useState } from 'react';
import { Dialog } from '../product/ProductUI';
import { NavIcon } from '../product/NavIcon';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import { CatalogProduct, ProductImage } from '../workspace/ProductCatalog';
import { productPrice } from '../../lib/product-money';
import styles from '../workspace/product-catalog.module.css';
export default function ProductPicker({
  products,
  selected,
  multiple,
  onChange,
  error,
  loading,
}: {
  products: CatalogProduct[];
  selected: string[];
  multiple: boolean;
  onChange: (ids: string[]) => void;
  error: string;
  loading: boolean;
}) {
  const { t } = useLocale();
  const categories = useData<{ id: string; name: string }[]>('/commerce/categories', []);
  const [view, setView] = useState<'browse' | 'selected'>('browse');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<CatalogProduct | null>(null);
  const search = query.trim().toLocaleLowerCase();
  const isBrowsing = !!search || category !== 'all';
  const visible = isBrowsing
    ? products.filter(
        (p) =>
          !p.archived &&
          (category === 'all' ||
            (category === 'none' ? !p.category_id : p.category_id === category)) &&
          `${p.name} ${p.sku}`.toLocaleLowerCase().includes(search),
      )
    : [];
  return (
    <div className={styles.picker}>
      <p className={styles.pickerGuide}>{t('اختر القسم ← أضف المنتجات ← راجع ترتيب المختارة', 'Choose a category → add products → review the selected order')}</p>
      <div
        className={styles.pickerTabs}
        role="group"
        aria-label={t('عرض المنتجات', 'Product view')}
      >
        <button
          type="button"
          className="btn"
          aria-pressed={view === 'browse'}
          onClick={() => setView('browse')}
        >
          {t('تصفح المنتجات', 'Browse products')}
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={view === 'selected'}
          onClick={() => setView('selected')}
        >
          {t('المختارة', 'Selected')} ({selected.length})
        </button>
      </div>
      {view === 'browse' && (
        <>
          <label className="field">
            {t('القسم', 'Category')}
            <select
              aria-label={t('القسم', 'Category')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">{t('كل الأقسام', 'All categories')}</option>
              <option value="none">{t('دون قسم', 'Uncategorized')}</option>
              {categories.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('البحث عن منتج', 'Find a product')}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('الاسم أو SKU', 'Name or SKU')}
            />
          </label>
        </>
      )}
      {loading && <p role="status">{t('جارٍ تحميل المنتجات…', 'Loading products…')}</p>}
      {error && <p role="alert">{error}</p>}
      {categories.error && <p role="alert">{categories.error}</p>}
      {view === 'selected' && (
        <div className={styles.selected}>
          <strong>
            {t('المنتجات المختارة', 'Selected products')} ({selected.length})
          </strong>
          {!selected.length && (
            <p>
              {t(
                'اختر منتجات من تبويب التصفح، ثم رتب ظهورها هنا.',
                'Choose products in Browse, then arrange them here.',
              )}
            </p>
          )}
          {selected.map((id, index) => {
            const p = products.find((p) => p.id === id);
            return (
              <div key={id}>
                <span className={styles.selectedInfo}>
                  <strong><bdi>{index + 1}.</bdi>{' '}<bdi>{p?.name ?? t('منتج غير متاح', 'Unavailable product')}</bdi></strong>
                  {p?.archived && <small>{t('مؤرشف', 'Archived')}</small>}
                  {p && <small><bdi>{productPrice(p.price_cents, p.currency)}</bdi></small>}
                </span>
                {p && <button type="button" className={`btn ${styles.smallAction}`} onClick={() => setPreview(p)} aria-label={`${t('معاينة', 'Preview')} ${p.name}`}><NavIcon name="eye" /></button>}
                {multiple && (
                  <>
                    <button
                      className={`btn ${styles.smallAction}`}
                      type="button"
                      disabled={index === 0}
                      onClick={() => {
                        const ids = [...selected];
                        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                        onChange(ids);
                      }}
                      aria-label={`${t('تقديم', 'Move up')} ${p?.name ?? ''}`}
                    >
                      ↑
                    </button>
                    <button
                      className={`btn ${styles.smallAction}`}
                      type="button"
                      disabled={index === selected.length - 1}
                      onClick={() => {
                        const ids = [...selected];
                        [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                        onChange(ids);
                      }}
                      aria-label={`${t('تأخير', 'Move down')} ${p?.name ?? ''}`}
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  className={`btn ${styles.smallAction}`}
                  type="button"
                  aria-label={`${t('إزالة', 'Remove')} ${p?.name ?? ''}`}
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                >
                  <NavIcon name="trash" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {view === 'browse' && (
        <>
          <div className={styles.pickerHeading}>
            <span>
              {isBrowsing
                ? `${visible.length} ${t('منتج', 'products')}`
                : t('اكتب اسم المنتج أو اختر قسمًا', 'Enter a product name or choose a category')}
            </span>
            <small>
              {selected.length} {t('مختار', 'selected')}
            </small>
          </div>
          <div className={styles.options}>
            {visible.map((p) => (
              <label className={styles.option} key={p.id}>
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name="bot-product"
                  checked={selected.includes(p.id)}
                  onChange={() =>
                    onChange(
                      multiple
                        ? selected.includes(p.id)
                          ? selected.filter((id) => id !== p.id)
                          : [...selected, p.id]
                        : [p.id],
                    )
                  }
                />
                <ProductImage key={p.image_url} product={p} />
                <span>
                  <strong>{p.name}</strong>
                  <br />
                  <small dir="ltr">{productPrice(p.price_cents, p.currency)}</small>
                  <br />
                  <small>
                    {categories.data.find((c) => c.id === p.category_id)?.name ??
                      t('دون قسم', 'Uncategorized')}{' '}
                    · {p.sku}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {isBrowsing && !loading && !error && !visible.length && (
            <p>
              {t(
                'لا توجد منتجات تطابق البحث في القسم المحدد.',
                'No products match your search in this category.',
              )}
            </p>
          )}
        </>
      )}
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={t('معاينة المنتج', 'Product preview')}>
        {preview && <div className={styles.preview}>
          <ProductImage key={preview.image_url} product={preview} /><h3>{preview.name}</h3>
          <strong dir="ltr">{productPrice(preview.price_cents, preview.currency)}</strong><p>{preview.description}</p>
          {!!preview.specifications?.length && <dl>{preview.specifications.map((item, i) => <div key={i}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>}
        </div>}
      </Dialog>
      <small>
        {t(
          'راجع المنتجات وترتيبها، ثم احفظ التغييرات واحفظ البوت.',
          'Review the products and their order, then save these changes and save the bot.',
        )}
      </small>
    </div>
  );
}
