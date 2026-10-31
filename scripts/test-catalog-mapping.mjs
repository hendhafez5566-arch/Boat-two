import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
const source = stripTypeScriptTypes(readFileSync('apps/web/lib/catalog-mapping.ts', 'utf8'));
const { suggestCatalogMapping } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
for (const headers of [
  ['id', 'name', 'category', 'price', 'internal_margin'],
  ['SKU', 'Product Name', 'size', 'color', 'visible'],
  ['كود المنتج', 'إسم المنتج', 'السعر', 'القسم'],
]) {
 const mapping = suggestCatalogMapping(headers);
 assert.equal(mapping.id, headers[0]); assert.equal(mapping.name, headers[1]);
 assert.deepEqual(mapping.fields, [], 'private or extra columns must remain opt-in');
}
assert.equal(suggestCatalogMapping(['price', 'notes']).id, '', 'never invent a row key');
assert.equal(suggestCatalogMapping(['id', 'name', 'hidden']).visible, undefined, 'hidden has opposite semantics and must not be guessed');
console.log('PASS: business-neutral column suggestions, Arabic normalization, stable keys and private-field opt-in');
