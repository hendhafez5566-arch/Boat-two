import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
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
      await page.route('**/*', (r) =>
        ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      const t = (ar, en) => (language === 'ar' ? ar : en);
      await page.goto('http://localhost:3000/dashboard/commerce');
      await page.getByRole('button', { name: t('المنتجات', 'Products'), exact: true }).click();
      await page
        .getByText(t('إدارة الأقسام المحلية', 'Manage local categories'), { exact: true })
        .click();
      const category = 'Trips-' + language + '-' + width;
      await page.getByLabel(t('اسم القسم', 'Category name'), { exact: true }).fill(category);
      await page
        .getByRole('button', { name: t('حفظ القسم', 'Save category'), exact: true })
        .click();
      await page.getByText(t('تم حفظ القسم.', 'Category saved.'), { exact: true }).waitFor();
      await page.getByRole('button', { name: t('إضافة منتج', 'Add product'), exact: true }).click();
      const name = 'Tour ' + language + ' ' + width;
      await page.getByLabel(t('اسم المنتج', 'Product name'), { exact: true }).fill(name);
      await page
        .getByLabel(t('رمز المنتج SKU', 'Product code (SKU)'), { exact: true })
        .fill('sku-' + language + '-' + width);
      await page
        .getByLabel(t('سعر المنتج (مثال 150.00)', 'Product price (e.g. 150.00)'), { exact: true })
        .fill('150.29');
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
      assert.equal(p.price_cents, '15029');
      assert.equal(p.category_id, cat.id);
      await page.getByLabel(t('البحث', 'Search'), { exact: true }).fill(name);
      const card = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name, exact: true }) });
      await card.getByText('150.29 EGP', { exact: true }).waitFor();
      await card.getByRole('button', { name: t('تعديل', 'Edit'), exact: true }).click();
      assert.equal(
        await page
          .getByLabel(t('سعر المنتج (مثال 150.00)', 'Product price (e.g. 150.00)'), { exact: true })
          .inputValue(),
        '150.29',
      );
      await page
        .getByLabel(t('اسم المنتج', 'Product name'), { exact: true })
        .fill(name + ' edited');
      await page
        .getByRole('button', { name: t('حفظ المنتج', 'Save product'), exact: true })
        .click();
      await page.getByText(t('تم حفظ المنتج.', 'Product saved.'), { exact: true }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: t('المنتجات', 'Products'), exact: true }).click();
      await page.getByLabel(t('البحث', 'Search'), { exact: true }).fill(name);
      await page.getByRole('heading', { name: name + ' edited', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${out}/${language}-${width}.png`, fullPage: true });
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
      const reopened = await api('/flows/' + f.id, token);
      assert.deepEqual(reopened.draft_graph.nodes[0].data.productIds, [p.id]);
      const sim = await api('/flows/' + f.id + '/test', token, {});
      assert.ok(JSON.stringify(sim).includes(name + ' edited'));
      assert.ok(JSON.stringify(sim).includes('150.29'));
      results.push({ language, width, status: 'PASS', product: p.id, flow: f.id });
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
} finally {
  await browser.close();
  writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
}
