/* global localStorage, document, innerWidth, getComputedStyle */
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const out = 'docs/enterprise-20261114/products';
mkdirSync(out, { recursive: true });
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch('http://localhost:4000' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); assert.ok(r.ok, path + JSON.stringify(data)); return data;
}
const browser = await chromium.launch({ executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = [];
try {
  for (const language of ['ar', 'en']) for (const width of [390, 1366]) {
    const t = (ar, en) => language === 'ar' ? ar : en;
    const session = await api('/auth/register', null, { email: randomUUID() + '@example.test', password: 'Synthetic-' + randomUUID(), fullName: 'Pagination QA', workspaceName: 'Isolated catalog pagination' });
    const token = session.accessToken;
    await api('/workspace/onboarding/complete', token, {});
    const category = await api('/commerce/categories', token, {name: '23 products'});
    const empty = await api('/commerce/categories', token, {name: 'Empty category'});
    for (let i = 1; i <= 23; i++) await api('/commerce/products', token, { name: 'QA product ' + String(i).padStart(2, '0'), sku: 'page-' + i, description: '', priceCents: '12000', currency: 'EGP', categoryId: category.id });
    const context = await browser.newContext({ viewport: {width, height: 936} });
    await context.addInitScript(({session,language}) => { localStorage.setItem('session',JSON.stringify(session)); localStorage.setItem('boat-language',language); }, {session,language});
    const page = await context.newPage();
    await page.route('**/*', r => ['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    await page.goto('http://localhost:3000/dashboard/commerce');
    const list = page.getByLabel(t('قائمة المنتجات','Product list'), {exact:true});
    await list.getByRole('heading',{name:'QA product 01',exact:true}).waitFor();
    assert.equal(await list.locator('article').count(),10);
    const pages = page.getByRole('navigation',{name:t('صفحات المنتجات','Product pages')});
    assert.ok(await pages.getByRole('button',{name:t('السابق','Previous'),exact:true}).isDisabled());
    await pages.getByRole('button',{name:t('الصفحة 2','Page 2'),exact:true}).click();
    await list.getByRole('heading',{name:'QA product 11',exact:true}).waitFor();
    assert.equal(await list.locator('article').count(),10);
    await pages.getByRole('button',{name:t('التالي','Next'),exact:true}).click();
    await list.getByRole('heading',{name:'QA product 21',exact:true}).waitFor();
    assert.equal(await list.locator('article').count(),3);
    assert.ok(await pages.getByRole('button',{name:t('التالي','Next'),exact:true}).isDisabled());
    const chooser = page.getByLabel(t('اختر قسم المنتجات','Choose product category'),{exact:true});
    await chooser.selectOption(empty.id);
    await page.getByRole('heading',{name:t('لا توجد منتجات تطابق الفلاتر','No products match these filters'),exact:true}).waitFor();
    await chooser.selectOption(category.id);
    await list.getByRole('heading',{name:'QA product 01',exact:true}).waitFor();
    assert.equal(await pages.getByRole('button',{name:t('الصفحة 1','Page 1'),exact:true}).getAttribute('aria-current'),'page');
    await list.locator('article').first().getByRole('button',{name:t('تعديل','Edit'),exact:true}).click();
    await page.getByRole('button',{name:t('حفظ المنتج','Save product'),exact:true}).click();
    const toast = page.getByText(t('تم حفظ المنتج.','Product saved.'),{exact:true});
    await toast.waitFor();
    const toastStyle = await toast.evaluate(el => {const s=getComputedStyle(el.parentElement); return {background:s.backgroundColor,color:s.color,position:s.position};});
    assert.equal(toastStyle.position,'fixed');
    assert.equal(toastStyle.background,'rgb(237, 249, 242)');
    assert.equal(toastStyle.color,'rgb(22, 98, 69)');
    await page.screenshot({path:`${out}/polished-${language}-${width}.png`});
    await toast.waitFor({state:'hidden',timeout:4500});
    await pages.getByRole('button',{name:t('الصفحة 3','Page 3'),exact:true}).click();
    for (let i = 21; i <= 23; i++) {
      const card = list.locator('article').filter({has:page.getByRole('heading',{name:'QA product '+i,exact:true})});
      await card.getByRole('button',{name:t('حذف','Delete'),exact:true}).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button',{name:t('حذف نهائيًا','Delete permanently'),exact:true}).click();
      await dialog.waitFor({state:'hidden'});
    }
    await list.getByRole('heading',{name:'QA product 11',exact:true}).waitFor();
    assert.equal(await list.locator('article').count(),10);
    assert.equal(await pages.getByRole('button',{name:t('الصفحة 2','Page 2'),exact:true}).getAttribute('aria-current'),'page');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${out}/pagination-${language}-${width}.png`});
    results.push({language,width,counts:[10,10,3],categoryReset:true,lastPageDeletion:true,greenToastDismissed:true,noHorizontalOverflow:true});
    await context.close();
  }
  writeFileSync(`${out}/pagination-results.json`,JSON.stringify({status:'PASS',results},null,2));
} finally { await browser.close(); }
