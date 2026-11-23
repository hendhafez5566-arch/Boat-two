'use client';
import { useLocale } from '../product/locale';

export const checkoutEnabled = process.env.NEXT_PUBLIC_COMMERCE_CHECKOUT === 'true';
export type CheckoutConfig = {
  kind: 'product' | 'service' | 'appointment' | 'quote';
  packages: { id: string; name: string; priceCents: string }[];
  questions: {
    id: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'list';
    required: boolean; choices: string[]; packageId?: string;
  }[];
  documents: string[];
  stock: number | null;
  min: number;
  max: number;
  discountBps: number;
  taxBps: number;
};
export const defaultCheckout: CheckoutConfig = {
  kind: 'product', packages: [], questions: [], documents: [], stock: null,
  min: 1, max: 1000, discountBps: 0, taxBps: 0,
};

export function CheckoutEditor({ value, onChange }: {
  value: CheckoutConfig;
  onChange: (value: CheckoutConfig) => void;
}) {
  const { t } = useLocale();
  const update = (patch: Partial<CheckoutConfig>) => onChange({ ...value, ...patch });
  return <fieldset className="stack">
    <legend>{t('إعدادات الطلب', 'Checkout settings')}</legend>
    <label>{t('النوع', 'Type')} <select value={value.kind}
      onChange={(e) => update({ kind: e.target.value as CheckoutConfig['kind'] })}>
      <option value="product">{t('منتج', 'Product')}</option><option value="service">{t('خدمة', 'Service')}</option>
      <option value="appointment">{t('موعد', 'Appointment')}</option><option value="quote">{t('عرض سعر', 'Quote request')}</option>
    </select></label>
    {value.kind === 'appointment' && <p>{t('إدارة الحجز من تبويب المواعيد.', 'Manage bookings from Appointments.')}</p>}
    {value.kind === 'product' && <label>{t('المخزون (فارغ = غير محدود)', 'Stock (blank = unlimited)')}
      <input type="number" min="0" max="1000000" value={value.stock ?? ''}
        onChange={(e) => update({ stock: e.target.value === '' ? null : Number(e.target.value) })}/></label>}
    <div className="stack">
      {(['min', 'max', 'discountBps', 'taxBps'] as const).map((field) => {
        if (value.kind === 'quote' && (field === 'discountBps' || field === 'taxBps')) return null;
        const labels = { min: t('أقل كمية', 'Minimum quantity'), max: t('أعلى كمية', 'Maximum quantity'),
          discountBps: t('الخصم (نقاط أساس)', 'Discount (basis points)'), taxBps: t('الضريبة (نقاط أساس)', 'Tax (basis points)') };
        return <label key={field}>{labels[field]} <input type="number" value={value[field]}
          onChange={(e) => update({ [field]: Number(e.target.value) })}/></label>;
      })}
    </div>
    <details open={value.packages.length > 0}>
      <summary>{t('الباقات', 'Packages')}</summary>
      {value.packages.map((pack) => <div key={pack.id} className="card stack">
        <label>{t('اسم الباقة', 'Package name')} <input value={pack.name} maxLength={120}
          onChange={(e) => update({ packages: value.packages.map((p) => p.id === pack.id ? {...p, name: e.target.value} : p) })}/></label>
        <label>{t('السعر بأصغر وحدة', 'Price in minor currency units')} <input inputMode="numeric" value={pack.priceCents}
          onChange={(e) => update({ packages: value.packages.map((p) => p.id === pack.id ? {...p, priceCents: e.target.value} : p) })}/></label>
        <button type="button" className="btn" disabled={value.packages.length >= 30} onClick={() => update({
          packages: [...value.packages, {...pack, id: crypto.randomUUID()}],
        })}>{t('نسخ الباقة', 'Duplicate package')}</button>
        <button type="button" className="btn" disabled={value.questions.some((q) => q.packageId === pack.id)}
          onClick={() => update({ packages: value.packages.filter((p) => p.id !== pack.id) })}>{t('حذف الباقة', 'Remove package')}</button>
      </div>)}
      <button type="button" className="btn" disabled={value.packages.length >= 30} onClick={() => update({
        packages: [...value.packages, { id: crypto.randomUUID(), name: '', priceCents: '0' }],
      })}>{t('إضافة باقة', 'Add package')}</button>
    </details>
    <details open={value.questions.length > 0}>
      <summary>{t('أسئلة الطلب', 'Order questions')}</summary>
      {value.questions.map((q) => {
        const set = (patch: Partial<typeof q>) => update({ questions: value.questions.map((item) => item.id === q.id ? {...q, ...patch} : item) });
        return <div key={q.id} className="card stack">
          <label>{t('السؤال', 'Question')} <input maxLength={120} value={q.label} onChange={(e) => set({ label: e.target.value })}/></label>
          <label>{t('شكل الإجابة', 'Answer format')} <select value={q.type} onChange={(e) => set({ type: e.target.value as typeof q.type })}>
            <option value="text">{t('نص', 'Text')}</option><option value="textarea">{t('نص طويل', 'Long text')}</option>
            <option value="number">{t('رقم', 'Number')}</option><option value="date">{t('تاريخ', 'Date')}</option><option value="list">{t('قائمة', 'List')}</option>
          </select></label>
          {q.type === 'list' && <label>{t('الاختيارات (سطر لكل اختيار)', 'Choices (one per line)')}
            <textarea value={q.choices.join('\n')} onChange={(e) => set({ choices: e.target.value.split('\n') })}/></label>}
          <label>{t('يظهر عند اختيار', 'Show for')} <select value={q.packageId ?? ''} onChange={(e) => set({ packageId: e.target.value || undefined })}>
            <option value="">{t('كل الباقات', 'All packages')}</option>
            {value.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label><input type="checkbox" checked={q.required} onChange={(e) => set({ required: e.target.checked })}/> {t('مطلوب', 'Required')}</label>
          <button type="button" className="btn" onClick={() => update({ questions: value.questions.filter((item) => item.id !== q.id) })}>
            {t('حذف السؤال', 'Remove question')}
          </button>
        </div>;
      })}
      <button type="button" className="btn" disabled={value.questions.length >= 40} onClick={() => update({
        questions: [...value.questions, { id: crypto.randomUUID(), label: '', type: 'text', choices: [], required: false }],
      })}>{t('إضافة سؤال', 'Add question')}</button>
    </details>
    <label>{t('أسماء المستندات المطلوبة (سطر لكل اسم)', 'Required document names (one per line)')}
      <textarea value={value.documents.join('\n')} onChange={(e) => update({ documents: e.target.value.split('\n') })}/>
    </label>
  </fieldset>;
}
