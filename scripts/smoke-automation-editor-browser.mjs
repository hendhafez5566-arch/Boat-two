/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
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
    email: `automation-browser-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Local automation tester',
    workspaceName: 'Automation acceptance',
  });
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
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
  await page.goto(web + '/dashboard/automations');
  const create = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'New automation rule', exact: true }) });
  await create.getByLabel('Rule name', { exact: true }).fill('Browser recovery sequence');
  await create.getByLabel('Details', { exact: true }).fill('browser-tag');
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/automations') && r.request().method() === 'POST',
    ),
    create.getByRole('button', { name: 'Save disabled rule for review', exact: true }).click(),
  ]);
  assert.equal(response.status(), 201);
  const row = (await call('/automations', undefined, a.accessToken))[0];
  assert.equal(row.enabled, false);
  const editor = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', {
        name: 'Edit saved sequences and integrations',
        exact: true,
      }),
    });
  await editor.getByRole('button', { name: 'Refresh list', exact: true }).click();
  await editor.getByRole('combobox', { name: /Open a saved rule/ }).selectOption(row.id);
  await editor.getByLabel('Name', { exact: true }).fill('Browser edited sequence');
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(
    await editor.getByLabel('Name', { exact: true }).inputValue(),
    'Browser recovery sequence',
  );
  await editor.getByRole('button', { name: 'Redo', exact: true }).click();
  await editor.getByRole('button', { name: 'Add step', exact: true }).click();
  const step = editor.locator('[data-step-path="root.1"]');
  await step.getByRole('combobox', { name: 'Action type', exact: true }).selectOption('branch');
  await step.getByLabel('Tag', { exact: true }).first().fill('browser-tag');
  await step.getByLabel('Details', { exact: true }).fill('Branch note fixture');
  const [saved] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/automations/' + row.id) && r.request().method() === 'PATCH',
    ),
    editor.getByRole('button', { name: 'Save sequence', exact: true }).click(),
  ]);
  assert.equal(saved.status(), 200);
  let current = (await call('/automations', undefined, a.accessToken))[0];
  assert.equal(current.name, 'Browser edited sequence');
  assert.equal(current.actions[1].then[0].text, 'Branch note fixture');
  await editor.getByRole('button', { name: 'Saved versions', exact: true }).click();
  await editor.getByRole('button', { name: 'Load v1', exact: true }).click();
  assert.equal(await editor.getByLabel('Enabled', { exact: true }).isChecked(), false);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/automations/' + row.id) && r.request().method() === 'PATCH',
    ),
    editor.getByRole('button', { name: 'Save sequence', exact: true }).click(),
  ]);
  current = (await call('/automations', undefined, a.accessToken))[0];
  assert.equal(current.enabled, false);
  assert.equal(current.actions.length, 1);
  await page.screenshot({ path: shots + '/automation-editor-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page
    .getByRole('heading', { name: 'تحرير المسارات المحفوظة والتكاملات', exact: true })
    .waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: shots + '/automation-editor-arabic-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Automation Chromium: create disabled rule, reopen, edit, undo/redo, nested branch persistence, version recovery as disabled revision, Arabic/mobile and no page errors passed.',
  );
} finally {
  await browser?.close();
}
