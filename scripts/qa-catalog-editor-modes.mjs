import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const out = process.env.CATALOG_QA_OUTPUT;
if (out) mkdirSync(out, { recursive: true });

async function api(path, token, body, expectedStatus) {
  const response = await fetch('http://localhost:4000' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: body && JSON.stringify(body),
  });
  if (expectedStatus) assert.equal(response.status, expectedStatus, path);
  else assert.ok(response.ok, path + ' ' + response.status);
  return response.json();
}

const session = await api('/auth/register', null, {
  email: 'catalog-' + randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Catalog editor QA',
  workspaceName: 'Bot Two Catalog QA',
});
const token = session.accessToken;
await api('/channels', token, { type: 'web', name: 'QA Website' });
await api('/workspace/onboarding/complete', token, {});
const category = await api('/commerce/categories', token, { name: 'Travel QA' });
const product = await api('/commerce/products', token, {
  categoryId: category.id,
  sku: 'REF-QA-015',
  name: 'رحلة تجريبية',
  priceCents: '25500',
  currency: 'EGP',
  specifications: [{ name: 'الباقة', value: 'دون إقامة' }],
  options: [{ name: 'Transfer', priceCents: '1800' }],
  catalogId: 'reference-preview-catalog',
  retailerId: 'reference-preview-merchant',
  linkUrl: 'https://example.test/travel',
});

const invite = await api('/team/invitations', token, {
  role: 'agent',
  email: 'catalog-agent-' + randomUUID() + '@example.test',
  sendEmail: false,
});
const agent = await api('/auth/accept-invitation', null, {
  token: new URL(invite.inviteUrl).searchParams.get('token'),
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Catalog QA Agent',
});
await api('/commerce/products/page', agent.accessToken, undefined, 403);
await api('/commerce/categories', agent.accessToken, { name: 'Restricted creation' }, 403);
const foreign = await api('/auth/register', null, {
  email: 'catalog-foreign-' + randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Catalog QA Owner',
  workspaceName: 'Isolated second QA tenant',
});
assert.equal((await api('/commerce/products/page', foreign.accessToken)).total, 0);
await api('/commerce/categories', foreign.accessToken, { name: 'Invalid parent', parentId: category.id }, 404);
console.log(JSON.stringify({ agentDenied: true, foreignReadEmpty: true, foreignParentRejected: true }));

const browser = await chromium.launchPersistentContext('', {
  executablePath: process.env.BOAT_CHROMIUM,
  args: ['--no-sandbox', '--disable-software-rasterizer'],
});
try {
  let expectedCategoryId = category.id;
  for (const [language, width] of [['ar', 390], ['en', 1440]]) {
    const t = (ar, en) => language === 'ar' ? ar : en;
    const page = await browser.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ session, language }) => {
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', language);
    }, { session, language });
    await page.goto('http://localhost:3000/dashboard/commerce');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.append(style);
      localStorage.removeItem('boat.catalog.editor-mode');
    });
    await page.reload();
    const editor = page.getByRole('dialog', { name: t('تعديل المنتج', 'Edit product') });
    const open = async () => {
      await page.getByRole('article')
        .filter({ hasText: 'REF-QA-015' })
        .getByRole('button', { name: t('تعديل', 'Edit'), exact: true })
        .click();
      await editor.waitFor();
    };
    const shot = async (name) => {
      if (out) await page.screenshot({ path: out + '/catalog-' + language + '-' + width + '-' + name + '.png' });
    };
    const mode = (ar, en) => editor.getByRole('button', { name: t(ar, en), exact: true });
    const simple = mode('الوضع السهل', 'Simple');
    const advanced = mode('الوضع المتقدم', 'Advanced');
    const name = editor.locator('[name=name]');
    const spec = editor.getByLabel(t('القيمة', 'Value'), { exact: true });
    const save = mode('حفظ المنتج', 'Save product');

    await open();
    if (process.env.CATALOG_QA_EXPECT_LEGACY === 'true') {
      assert.equal(await simple.count(), 0);
      assert.equal(await spec.isVisible(), true);
      await save.click();
      await editor.waitFor({ state: 'hidden' });
      const saved = (await api('/commerce/products', token)).find((row) => row.id === product.id);
      assert.deepEqual(saved.specifications, product.specifications);
      console.log(JSON.stringify({ language, width, legacyEditor: true, sameProductSaved: true }));
      await page.close();
      continue;
    }
    assert.equal(await simple.getAttribute('aria-pressed'), 'true');
    assert.equal(await spec.isVisible(), false);
    await shot('simple');
    await advanced.click();
    await spec.fill('');
    await simple.click();
    assert.equal(await advanced.getAttribute('aria-pressed'), 'true');
    await spec.fill('قيمة محفوظة ' + language);
    await shot('advanced');
    await simple.click();
    assert.equal(await spec.isVisible(), false);
    await name.fill('رحلة تجريبية ' + language);
    await save.click();
    await editor.waitFor({ state: 'hidden' });

    const rows = await api('/commerce/products', token);
    const saved = rows.find((row) => row.id === product.id);
    assert.ok(saved);
    assert.deepEqual(
      [saved.sku, saved.name, String(saved.price_cents), saved.currency, saved.category_id, saved.catalog_id,
        saved.retailer_id, saved.link_url, saved.specifications, saved.options],
      ['REF-QA-015', 'رحلة تجريبية ' + language, '25500', 'EGP', expectedCategoryId, 'reference-preview-catalog',
        'reference-preview-merchant', 'https://example.test/travel',
        [{ name: 'الباقة', value: 'قيمة محفوظة ' + language }], [{ name: 'Transfer', priceCents: '1800' }]],
    );
    await open();
    await advanced.click();
    await page.reload();
    await open();
    assert.equal(await advanced.getAttribute('aria-pressed'), 'true');
    assert.equal(await spec.inputValue(), 'قيمة محفوظة ' + language);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const saveBounds = await save.boundingBox();
    assert.ok(saveBounds && saveBounds.y >= 0 && saveBounds.y + saveBounds.height <= 900);
    await mode('إلغاء', 'Cancel').click();
    await editor.waitFor({ state: 'hidden' });
    const categories = page.getByLabel(t('اختر قسم المنتجات', 'Choose product category'), { exact: true });
    await categories.selectOption(category.id);
    await page.getByRole('button', { name: t('إضافة قسم فرعي', 'Add subcategory'), exact: true }).click();
    const create = page.getByRole('dialog', { name: t('إضافة قسم', 'Add category') });
    const parent = create.locator('select[name=parent]');
    assert.equal(await parent.inputValue(), category.id);
    await create.locator('input[name=categoryName]').fill('Subcategory ' + language);
    await create.getByRole('button', { name: t('حفظ القسم', 'Save category'), exact: true }).click();
    await create.waitFor({ state: 'hidden' });
    const childId = await categories.inputValue();
    assert.notEqual(childId, category.id);
    expectedCategoryId = childId;
    await categories.selectOption(category.id);
    await open();
    await editor.locator('select[name=category]').selectOption(childId);
    await save.click();
    await editor.waitFor({ state: 'hidden' });
    await page.getByRole('article').filter({ hasText: 'REF-QA-015' }).waitFor();
    await page.getByRole('button', { name: t('نسخ القسم', 'Duplicate'), exact: true }).click();
    const duplicate = page.getByRole('dialog', { name: t('نسخ القسم ومنتجاته', 'Duplicate category and products') });
    await duplicate.locator('input[name=categoryName]').fill('Duplicate branch ' + language);
    await duplicate.getByRole('button', { name: t('إنشاء النسخة', 'Create copy'), exact: true }).click();
    await duplicate.waitFor({ state: 'hidden' });
    const copyId = await categories.inputValue();
    const branch = await api('/commerce/categories', token);
    const copyChild = branch.find((row) => row.parent_id === copyId && row.name === 'Subcategory ' + language);
    assert.ok(copyChild);
    const allProducts = await api('/commerce/products', token);
    assert.equal(allProducts.find((row) => row.id === product.id).category_id, childId);
    const copy = allProducts.find((row) => row.category_id === copyChild.id);
    assert.equal(copy.name, 'رحلة تجريبية ' + language);
    assert.notEqual(copy.id, product.id);
    assert.deepEqual(copy.specifications, saved.specifications);
    assert.equal(copy.catalog_id, null);
    await shot('category-copy');
    await categories.selectOption(category.id);
    await page.getByRole('button', { name: t('حذف القسم', 'Delete category'), exact: true }).click();
    const deleteDialog = page.getByRole('dialog', { name: t('حذف القسم', 'Delete category') });
    assert.equal(await deleteDialog.getByRole('button', { name: t('حذف نهائيًا', 'Delete permanently'), exact: true }).isDisabled(), true);
    console.log(JSON.stringify({ language, width, idPreserved: true, hiddenFieldsSaved: true, invalidSwitchBlocked: true, preferenceReloaded: true, saveVisible: true, nestedCategoryCloned: true }));
    await page.close();
  }
  if (process.env.CATALOG_QA_LARGE === 'true') {
    const loadCategory = await api('/commerce/categories', token, { name: 'Catalog load QA' });
    for (let n = 1; n <= 510; n++) {
      const suffix = String(n).padStart(4, '0');
      await api('/commerce/products', token, {
        categoryId: loadCategory.id,
        sku: 'LOAD-' + suffix,
        name: 'Catalog load fixture ' + suffix,
        priceCents: '1500',
        currency: 'EGP',
      });
    }
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(({ session }) => {
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', 'en');
    }, { session });
    await page.goto('http://localhost:3000/dashboard/commerce');
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const categories = page.getByLabel('Choose product category', { exact: true });
    await categories.selectOption(loadCategory.id);
    await page.getByText('Products: 510', { exact: true }).waitFor();
    const navigation = page.getByRole('navigation', { name: 'Product pages' });
    await navigation.getByRole('button', { name: 'Page 51', exact: true }).click();
    await page.getByRole('heading', { name: 'Catalog load fixture 0510', exact: true }).waitFor();
    const search = page.getByRole('searchbox', { name: 'Search products' });
    const start = performance.now();
    await search.fill('LOAD-0510');
    await page.getByText('Products: 1', { exact: true }).waitFor();
    const searchMs = Math.round(performance.now() - start);
    assert.equal(await page.getByRole('article').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (out) await page.screenshot({ path: out + '/catalog-en-390-after-cap.png' });
    console.log(JSON.stringify({ language: 'en', width: 390, products: 510, lastPage: 51, searchMs }));
    await page.close();
  }
} finally {
  await browser.close();
}
