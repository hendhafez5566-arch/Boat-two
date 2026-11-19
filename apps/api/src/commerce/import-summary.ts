import { CatalogItem } from './data-contracts';
export type ImportSummary = {
  added: number; updated: number; unchanged: number; rejected: number;
  duplicates: number; missingRequired: number; missing: number; archived: number;
};
type StoredItem = {
  external_key: string; name: string; description: string; category_path: string;
  archived: boolean; sort_order: string | number; category_sort: string | number;
  image_url: string | null; link_url: string | null;
  dynamic_fields: {label: string; value: string; kind: string}[];
};
const signature = (item: CatalogItem) => JSON.stringify([
  item.name, item.description, item.category, item.visible, item.sort, item.categorySort ?? 0,
  item.image, item.link, item.fields.map(f => [f.label, f.value, f.kind]),
]);
export function sameImportedItem(item: CatalogItem, stored: StoredItem) {
  return signature(item) === signature({
    key: stored.external_key, name: stored.name, description: stored.description,
    category: stored.category_path, visible: !stored.archived,
    sort: Number(stored.sort_order), categorySort: Number(stored.category_sort),
    image: stored.image_url, link: stored.link_url, fields: stored.dynamic_fields,
  });
}
export function importSummary(items: CatalogItem[], existing: StoredItem[], errors: {message: string}[] = []): ImportSummary {
  const previous = new Map(existing.map(p => [p.external_key, p]));
  const keys = new Set(items.map(p => p.key));
  const summary: ImportSummary = {added:0, updated:0, unchanged:0, rejected:errors.length,
    duplicates:errors.filter(e => e.message.startsWith('Duplicate item ID:')).length,
    missingRequired:errors.filter(e => e.message === 'A stable ID and name are required').length,
    missing:existing.filter(p => !p.archived && !keys.has(p.external_key)).length, archived:0};
  for (const item of items) {
    const old = previous.get(item.key);
    if (!old) summary.added++;
    else if (sameImportedItem(item, old)) summary.unchanged++;
    else summary.updated++;
  }
  return summary;
}
