'use client';
import { useLocale } from '../product/locale';
import { productPrice } from '../../lib/product-money';
import type { CatalogProduct } from './ProductCatalog';

export type CheckoutItem = Pick<CatalogProduct, 'id' | 'name' | 'currency' | 'checkout' | 'options'>;

export function checkoutQuestions(product: CheckoutItem, packageId: string) {
  return product.checkout?.questions?.filter((q) => !q.packageId || q.packageId === packageId) ?? [];
}
export function checkoutSelection(product: CheckoutItem, packageId: string, data: FormData) {
  return {
    productId: product.id,
    packageId: packageId || undefined,
    quantity: Number(data.get('quantity')),
    options: data.getAll('option'),
    answers: checkoutQuestions(product, packageId).flatMap((q) => {
      const value = data.get(q.id);
      return value ? [{ id: q.id, value: String(value) }] : [];
    }),
  };
}

export default function CheckoutSelection({ product, packageId, onPackage }: {
  product: CheckoutItem; packageId: string; onPackage: (id: string) => void;
}) {
  const { t } = useLocale();
  const selectedPackage = product.checkout?.packages?.find((pack) => pack.id === packageId);
  return <>
    {!!product.checkout?.packages?.length && <label>{t('الباقة', 'Package')}
      <select required value={packageId} onChange={(e) => onPackage(e.target.value)}>
        <option value="">{t('اختر الباقة', 'Choose package')}</option>
        {product.checkout.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {selectedPackage && product.checkout?.kind !== 'quote' && (
        <small>{t('سعر الباقة الأساسي', 'Base package price')}{' '}
          <bdi>{productPrice(selectedPackage.priceCents, product.currency)}</bdi>
        </small>
      )}
    </label>}
    <label>{t('الكمية', 'Quantity')}
      <input name="quantity" type="number" min={product.checkout?.min ?? 1} max={product.checkout?.max ?? 1000}
        defaultValue={product.checkout?.min ?? 1} required/>
    </label>
    {product.options?.map((option, index) => <label key={index}>
      <input type="checkbox" name="option" value={option.name}/> {option.name} · {productPrice(option.priceCents, product.currency)}
    </label>)}
    {checkoutQuestions(product, packageId).map((question) => <label key={question.id}>{question.label} {question.required && '*'}
      {question.type === 'list' ? <select name={question.id}>
        <option value="">—</option>
        {question.choices.map((choice) => <option key={choice}>{choice}</option>)}
      </select>
        : question.type === 'textarea' ? <textarea name={question.id} maxLength={1500}/>
        : <input name={question.id} type={question.type} step={question.type === 'number' ? 'any' : undefined} maxLength={1500}/>}
    </label>)}
    {!!product.checkout?.documents?.length && <ul>
      {product.checkout.documents.map((name, index) => <li key={index}>{name}</li>)}
    </ul>}
  </>;
}
