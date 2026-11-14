'use client';
import { useState } from 'react';
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
  const [query, setQuery] = useState('');
  const visible = products.filter(
    (p) =>
      !p.archived && `${p.name} ${p.sku}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className={styles.picker}>
      <label className="field">
        {t('البحث عن منتج', 'Find a product')}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('الاسم أو SKU', 'Name or SKU')}
        />
      </label>
      {loading && <p role="status">{t('جارٍ تحميل المنتجات…', 'Loading products…')}</p>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.selected}>
        <strong>
          {t('المنتجات المختارة', 'Selected products')} ({selected.length})
        </strong>
        {selected.map((id) => {
          const p = products.find((p) => p.id === id);
          return (
            <div key={id}>
              <span>
                {p?.name ?? t('منتج غير متاح', 'Unavailable product')}
                {p?.archived ? t(' (مؤرشف)', ' (archived)') : ''}
              </span>
              <button
                className="btn"
                type="button"
                aria-label={`${t('إزالة', 'Remove')} ${p?.name ?? ''}`}
                onClick={() => onChange(selected.filter((x) => x !== id))}
              >
                {t('إزالة', 'Remove')}
              </button>
            </div>
          );
        })}
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
              <small>{p.sku}</small>
            </span>
          </label>
        ))}
      </div>
      {!loading && !error && !visible.length && (
        <p>
          {t(
            'لا توجد منتجات مطابقة. أضف المنتجات من قسم التجارة أولًا.',
            'No matching products. Add products in Commerce first.',
          )}
        </p>
      )}
      <small>
        {t(
          'هذا اختيار لبيانات المنتجات، وليس محاكاة لشكل رسالة القناة. استخدم اختبار البوت لمعاينة الإخراج.',
          'This selects product data, rather than simulating a channel message. Use the bot simulator to preview output.',
        )}
      </small>
    </div>
  );
}
