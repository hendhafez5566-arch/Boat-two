/* global localStorage, document, innerWidth */
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const { Workbook } = createRequire(resolve('apps/api/package.json'))('exceljs');
const out = 'docs/enterprise-20261114/products';
mkdirSync(out, { recursive: true });
async function api(path, token, body, method = body ? 'POST' : 'GET', expected) {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (expected) assert.equal(r.status, expected, path);
  else assert.ok(r.ok, path + JSON.stringify(d));
  return d;
}
const session = await api('/auth/register', null, {
  email: randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Product QA',
  workspaceName: 'Isolated catalog',
});
const token = session.accessToken;
const channel = await api('/channels', token, { type: 'web', name: 'Isolated website' });
await api('/workspace/onboarding/complete', token, {});
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const results = [];
let activePage;
try {
  for (const language of ['en', 'ar'])
    for (const width of [390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 936 } });
      await context.addInitScript(
        ({ session, language }) => {
          localStorage.setItem('session', JSON.stringify(session));
          localStorage.setItem('boat-language', language);
        },
        { session, language },
      );
      const page = await context.newPage();
      activePage = page;
      await page.route('**/*', (r) =>
        ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      const t = (ar, en) => (language === 'ar' ? ar : en);
      await page.goto('http://localhost:3000/dashboard/commerce');
      await page.getByRole('button', { name: t('إدارة المنتجات', 'Manage products'), exact: true }).click();
      await page
        .getByRole('button', { name: t('إضافة قسم', 'Add category'), exact: true })
        .click();
      const category = 'Trips-' + language + '-' + width;
      await page.getByLabel(t('اسم القسم', 'Category name'), { exact: true }).fill(category);
      await page
        .getByRole('button', { name: t('حفظ القسم', 'Save category'), exact: true })
        .click();
      await page.getByText(t('تم حفظ القسم.', 'Category saved.'), { exact: true }).waitFor();
      await page.getByRole('button', { name: t('+ إضافة منتج', '+ Add product'), exact: true }).click();
      const name = 'Tour ' + language + ' ' + width;
      await page.getByLabel(t('اسم المنتج *', 'Product name *'), { exact: true }).fill(name);
      await page
        .getByLabel(t('كود المنتج SKU *', 'Product code (SKU) *'), { exact: true })
        .fill('sku-' + language + '-' + width);
      await page
        .getByLabel(t('السعر *', 'Price *'), { exact: true })
        .fill('150.29');
      await page.screenshot({ path: `${out}/editor-${language}-${width}.png`, fullPage: true });
      const cats = await api('/commerce/categories', token);
      const cat = cats.find((c) => c.name === category);
      await page
        .getByLabel(t('قسم المنتج', 'Product category'), { exact: true })
        .selectOption(cat.id);
      await page
        .getByRole('button', { name: t('حفظ المنتج', 'Save product'), exact: true })
        .click();
      await page.getByText(t('تم حفظ المنتج.', 'Product saved.'), { exact: true }).waitFor();
      const p = (await api('/commerce/products', token)).find((p) => p.name === name);
      assert.equal(String(p.price_cents), '15029');
      assert.equal(p.category_id, cat.id);
      const chooser = page.getByLabel(t('اختر قسم المنتجات', 'Choose product category'), { exact: true });
      await chooser.selectOption(cat.id);
      assert.equal(await chooser.inputValue(), cat.id);

      await page.getByLabel(t('البحث في المنتجات', 'Search products'), { exact: true }).fill(name);
      const card = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name, exact: true }) });
      await card.getByText('150.29 EGP', { exact: true }).waitFor();
      await card.getByRole('button', { name: t('تعديل', 'Edit'), exact: true }).click();
      assert.equal(
        await page
          .getByLabel(t('السعر *', 'Price *'), { exact: true })
          .inputValue(),
        '150.29',
      );
      await page
        .getByLabel(t('اسم المنتج *', 'Product name *'), { exact: true })
        .fill(name + ' edited');
      await page
        .getByRole('button', { name: t('حفظ المنتج', 'Save product'), exact: true })
        .click();
      await page.getByText(t('تم حفظ المنتج.', 'Product saved.'), { exact: true }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: t('إدارة المنتجات', 'Manage products'), exact: true }).click();
      await page.getByLabel(t('البحث في المنتجات', 'Search products'), { exact: true }).fill(name);
      await page.getByRole('heading', { name: name + ' edited', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${out}/${language}-${width}.png`, fullPage: true });
      await page
        .getByRole('button', { name: t('الاستيراد والمزامنة', 'Import & sync'), exact: true })
        .click();
      const importName = `catalog-${language}-${width}`;
      const xlsx = width === 1366;
      const book = new Workbook();
      book.addWorksheet('Products').addRows([
        ['ID', 'Name', 'Description', 'Price'],
        ['import-1', 'Imported tour', 'Import journey', '200'],
      ]);
      await page
        .getByLabel(t('رفع ملف .xlsx أو .csv — حتى 5 MB', 'Upload .xlsx or .csv — up to 5 MB'))
        .setInputFiles({
          name: importName + (xlsx ? '.xlsx' : '.csv'),
          mimeType: xlsx
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv',
          buffer: xlsx
            ? Buffer.from(await book.xlsx.writeBuffer())
            : Buffer.from('ID,Name,Description,Price\nimport-1,Imported tour,CSV journey,200\n'),
        });
      await page
        .getByRole('button', {
          name: t('التالي: مطابقة الأعمدة', 'Next: map columns'),
          exact: true,
        })
        .click();
      await page
        .getByLabel(t('المعرف الثابت', 'Stable item key'), { exact: true })
        .selectOption('ID');
      await page.getByLabel(t('الاسم', 'Name'), { exact: true }).selectOption('Name');
      await page
        .getByRole('button', {
          name: t('التالي: معاينة البيانات', 'Next: preview data'),
          exact: true,
        })
        .click();
      await page.getByRole('heading', { name: /Update preview|معاينة التحديث/ }).waitFor();
      assert.equal(await page.locator('[data-import-count="added"] dd').textContent(), '1');
      assert.equal(await page.locator('[data-import-count="updated"] dd').textContent(), '0');
      await page.screenshot({
        path: `${out}/import-preview-${language}-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole('button', { name: t('تعديل المطابقة', 'Edit mapping'), exact: true })
        .click();
      assert.equal(
        await page.getByLabel(t('المعرف الثابت', 'Stable item key'), { exact: true }).inputValue(),
        'ID',
      );
      await page
        .getByRole('button', {
          name: t('التالي: معاينة البيانات', 'Next: preview data'),
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: t('التالي: تأكيد الاستيراد', 'Next: confirm import'),
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: t('تطبيق التحديث المعروض', 'Apply previewed update'),
          exact: true,
        })
        .click();
      await page
        .getByRole('heading', { name: t('اكتمل الاستيراد', 'Import complete'), exact: true })
        .waitFor();
      assert.equal(await page.locator('[data-import-count="added"] dd').textContent(), '1');
      assert.equal(await page.locator('[data-import-count="unchanged"] dd').textContent(), '0');
      const sources = await api('/commerce/sources', token);
      const imported = sources.find((s) => s.name === importName);
      assert.ok(imported);
      const runs = await api('/commerce/sources/' + imported.id + '/runs', token);
      assert.equal(runs[0].summary.added, 1);
      assert.equal(runs[0].summary.updated, 0);
      const importedItems = await api('/commerce/sources/' + imported.id + '/items', token);
      assert.ok(importedItems.items.some((item) => item.name === 'Imported tour'));
      await page.reload();
      await page
        .getByRole('button', { name: t('الاستيراد والمزامنة', 'Import & sync'), exact: true })
        .click();
      await page.getByLabel(t('المصدر', 'Source'), { exact: true }).selectOption(imported.id);
      await page.getByRole('button', { name: t('عرض', 'Browse'), exact: true }).click();
      await page.getByText('Imported tour', { exact: true }).waitFor();
      const categoryValues = await page
        .getByLabel(t('القسم', 'Category'), { exact: true })
        .locator('option')
        .evaluateAll((options) => options.map((option) => option.value));
      assert.equal(
        new Set(categoryValues).size,
        categoryValues.length,
        'Uncategorized must not create a duplicate all-categories option',
      );
      await page.getByText(t('دون قسم', 'Uncategorized'), { exact: true }).waitFor();

      const f = await api('/flows', token, {
        name: 'Product flow ' + language + width,
        channelIds: [channel.id],
      });
      const graph = {
        startNodeId: 'catalog',
        nodes: [
          {
            id: 'catalog',
            type: 'catalog',
            position: { x: 300, y: 100 },
            data: { productIds: [p.id], text: 'Tours' },
            edges: { next: 'end' },
          },
          { id: 'end', type: 'end', position: { x: 700, y: 100 }, data: {} },
        ],
        edges: [{ id: 'e', source: 'catalog', sourceHandle: 'next', target: 'end' }],
      };
      await api('/flows/' + f.id, token, { graph, expectedUpdatedAt: f.updated_at }, 'PATCH');
      await api('/commerce/products/' + p.id, token, { confirm: true }, 'DELETE', 409);
      await api('/commerce/products/' + p.id + '/archive', token, { confirm: true }, 'POST', 409);
      const reopened = await api('/flows/' + f.id, token);
      assert.deepEqual(reopened.draft_graph.nodes[0].data.productIds, [p.id]);
      const second = await api('/commerce/products', token, {
        name: 'Second ' + name,
        sku: 'second-' + language + '-' + width,
        description: '',
        priceCents: '1299',
        currency: 'EGP',
        categoryId: cat.id,
      });
      await page.goto('http://localhost:3000/dashboard/flows/' + f.id);
      await page.locator('.react-flow__node[data-id="catalog"]').dblclick();
      await page.getByRole('dialog').waitFor();
      await page
        .getByLabel(t('البحث عن منتج', 'Find a product'), { exact: true })
        .fill('Second ' + name);
      await page.getByRole('checkbox', { name: new RegExp('Second ' + name) }).check();
      await page
        .getByRole('button', { name: t('المختارة', 'Selected') + ' (2)', exact: true })
        .click();
      await page
        .getByRole('button', { name: t('تقديم', 'Move up') + ' Second ' + name, exact: true })
        .click();
      await page.screenshot({ path: `${out}/picker-${language}-${width}.png`, fullPage: true });
      await page
        .getByRole('dialog')
        .filter({
          has: page.getByRole('button', {
            name: t('تصفح المنتجات', 'Browse products'),
            exact: true,
          }),
        })
        .getByRole('button', { name: t('حفظ التغييرات', 'Save Changes'), exact: true })
        .click();
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith('/flows/' + f.id) && r.request().method() === 'PATCH' && r.ok(),
        ),
        page.getByRole('button', { name: t('حفظ', 'Save'), exact: true }).click(),
      ]);
      const chosen = await api('/flows/' + f.id, token);
      assert.deepEqual(chosen.draft_graph.nodes[0].data.productIds, [second.id, p.id]);
      await page.reload();
      await page.locator('.react-flow__node[data-id="catalog"]').dblclick();
      await page.getByRole('dialog').waitFor();
      await page
        .getByRole('button', { name: t('المختارة', 'Selected') + ' (2)', exact: true })
        .click();
      await page
        .getByRole('button', { name: t('إزالة', 'Remove') + ' Second ' + name, exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: t('تصفح المنتجات', 'Browse products'), exact: true })
        .click();
      const sim = await api('/flows/' + f.id + '/test', token, {});
      assert.ok(JSON.stringify(sim).includes(name + ' edited'));
      assert.ok(JSON.stringify(sim).includes('150.29'));
      await page
        .getByLabel(t('محتوى الكتالوج', 'Catalog content'), { exact: true })
        .selectOption('dynamic');
      await page
        .getByLabel(t('مصدر البيانات', 'Data source'), { exact: true })
        .selectOption(imported.id);
      await page
        .getByRole('dialog')
        .filter({ has: page.getByLabel(t('محتوى الكتالوج', 'Catalog content'), { exact: true }) })
        .getByRole('button', { name: t('حفظ التغييرات', 'Save Changes'), exact: true })
        .click();
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith('/flows/' + f.id) && r.request().method() === 'PATCH' && r.ok(),
        ),
        page.getByRole('button', { name: t('حفظ', 'Save'), exact: true }).click(),
      ]);
      const savedDynamic = await api('/flows/' + f.id, token);
      assert.equal(savedDynamic.draft_graph.nodes[0].data.sourceId, imported.id);
      await page.reload();
      await page.locator('.react-flow__node[data-id="catalog"]').dblclick();
      await page.getByLabel(t('مصدر البيانات', 'Data source'), { exact: true }).waitFor();
      await page
        .getByLabel(t('مصدر البيانات', 'Data source'), { exact: true })
        .getByRole('option', { name: importName, exact: true })
        .waitFor({ state: 'attached' });
      assert.equal(
        await page.getByLabel(t('مصدر البيانات', 'Data source'), { exact: true }).inputValue(),
        imported.id,
      );
      const dynamicSim = await api('/flows/' + f.id + '/test', token, {});
      assert.ok(JSON.stringify(dynamicSim).includes('Imported tour'));
      results.push({
        language,
        width,
        fileType: xlsx ? 'xlsx' : 'csv',
        status: 'PASS',
        product: p.id,
        flow: f.id,
      });
      await context.close();
    }
  const other = await api('/auth/register', null, {
    email: randomUUID() + '@example.test',
    password: 'Synthetic-' + randomUUID(),
    fullName: 'Other QA',
    workspaceName: 'Other isolated catalog',
  });
  assert.deepEqual(await api('/commerce/products', other.accessToken), []);
  assert.deepEqual(await api('/commerce/categories', other.accessToken), []);
} catch (e) {
  if (activePage) {
    await activePage.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
    writeFileSync(out + '/failure-dom.txt', await activePage.content().catch(() => ''));
  }
  throw e;
} finally {
  await browser.close();
  writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
}
