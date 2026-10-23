/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js');
const { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000',
  shots = process.env.BOAT_SCREENSHOTS || '/workspace/work/acceptance';
async function call(path, body, token) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
let browser;
try {
  await mkdir(shots, { recursive: true });
  const a = await call('/auth/register', {
    email: `draft-browser-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Local draft tester',
    workspaceName: 'Template acceptance',
  });
  const ch = await db.withTenant(
    a.tenantId,
    async (c) =>
      (
        await c.query(
          "INSERT INTO channels(tenant_id,type,name,external_id,settings) VALUES($1,'whatsapp','Local template channel',$2,'{}') RETURNING id",
          [a.tenantId, randomUUID()],
        )
      ).rows[0],
  );
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (s) => {
      if (window !== window.top) return;
      if (!localStorage.getItem('session')) localStorage.setItem('session', JSON.stringify(s));
      if (!localStorage.getItem('boat-language')) localStorage.setItem('boat-language', 'en');
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  const path = `/channels/${ch.id}/templates`;
  await page.goto(web + '/dashboard' + path);
  await page.getByLabel('Lowercase identifier', { exact: true }).fill('browser_rich_draft');
  await page.getByLabel('Language', { exact: true }).fill('en');
  await page.getByLabel('Text: variables use {{1}}', { exact: true }).fill('Hello {{1}}');
  await page.getByLabel('One example per variable, one per line', { exact: true }).fill('Ada');
  await page.getByRole('combobox', { name: /^Header type/ }).selectOption('DOCUMENT');
  await page
    .getByLabel('Meta sample media upload handle', { exact: true })
    .fill('local-mock-upload-handle');
  await page.getByLabel('Optional footer', { exact: true }).fill('Local acceptance');
  await page.getByRole('button', { name: 'Add button', exact: true }).click();
  await page.getByRole('combobox', { name: /^Button type 1/ }).selectOption('URL');
  await page.getByLabel('Button label 1', { exact: true }).fill('View order');
  await page.getByLabel('Button URL 1', { exact: true }).fill('https://example.test/order/{{1}}');
  await page
    .getByLabel('Complete sample URL 1', { exact: true })
    .fill('https://example.test/order/12');
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save draft', exact: true }).click(),
  ]);
  assert.equal(created.status(), 201);
  let saved = (await call(path, undefined, a.accessToken))[0];
  assert.equal(saved.components[0].example.header_handle[0], 'local-mock-upload-handle');
  assert.equal(saved.components[3].buttons[0].example[0], 'https://example.test/order/12');
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByLabel('Optional footer', { exact: true }).fill('Edited and persisted');
  const [edited] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(path + '/' + saved.id) && r.request().method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Save draft', exact: true }).click(),
  ]);
  assert.equal(edited.status(), 200);
  saved = (await call(path, undefined, a.accessToken))[0];
  assert.equal(saved.components[2].text, 'Edited and persisted');
  await page.getByText('Edited and persisted', { exact: true }).waitFor();
  await page.screenshot({ path: shots + '/template-drafts-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Submit for Meta approval', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal((await call(path, undefined, a.accessToken))[0].status, 'DRAFT');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page
    .getByRole('heading', { name: 'قوالب رسمية، بحالة اعتماد واضحة', exact: true })
    .waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: 'تعديل المسودة', exact: true }).click();
  assert.equal(
    await page.getByLabel('تذييل اختياري', { exact: true }).inputValue(),
    'Edited and persisted',
  );
  await page.screenshot({ path: shots + '/template-drafts-arabic-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'إلغاء التعديل', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    'Template drafts Chromium: rich document/URL examples, live preview, create/edit/reopen persistence, gated submission, Arabic RTL/mobile and zero page errors passed. No external submission.',
  );
} finally {
  await browser?.close();
  await db.onModuleDestroy();
}
