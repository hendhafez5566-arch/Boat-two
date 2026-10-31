// Suggestions only: never regenerate existing item keys or overwrite a saved mapping.
export type CatalogMapping = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  visible?: string;
  order?: string;
  categoryOrder?: string;
  image?: string;
  link?: string;
  fields: { column: string; label: string; kind: 'text' | 'price' }[];
};
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\s_-]+/g, '');
const aliases: Record<string, string[]> = {
  id: [
    'id',
    'key',
    'sku',
    'code',
    'product id',
    'item id',
    'المعرف',
    'كود',
    'كود المنتج',
    'رقم المنتج',
  ],
  name: [
    'name',
    'title',
    'product',
    'item',
    'product name',
    'الاسم',
    'اسم المنتج',
    'الصنف',
    'اسم الصنف',
    'اسم البرنامج',
  ],
  description: ['description', 'details', 'الوصف', 'التفاصيل'],
  category: ['category', 'section', 'القسم', 'التصنيف', 'الفئة'],
  visible: ['visible', 'visibility', 'ظاهر', 'الظهور'],
  order: ['order', 'sort', 'الترتيب'],
  categoryOrder: ['category order', 'ترتيب القسم'],
  image: ['image', 'image url', 'الصورة', 'رابط الصورة'],
  link: ['url', 'link', 'الرابط', 'رابط التفاصيل'],
};
export function suggestCatalogMapping(headers: string[]): CatalogMapping {
  const result: CatalogMapping = { id: '', name: '', fields: [] };
  const used = new Set<string>();
  for (const [key, names] of Object.entries(aliases)) {
    const column = headers.find((h) => !used.has(h) && names.map(normalize).includes(normalize(h)));
    if (column) {
      Object.assign(result, { [key]: column });
      used.add(column);
    }
  }
  // Extra columns remain opt-in: private spreadsheet fields must not become customer content.
  return result;
}
