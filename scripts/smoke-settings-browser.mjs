/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const local = createRequire(import.meta.url),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
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
    email: `settings-browser-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Local settings tester',
    workspaceName: 'Settings acceptance',
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
  let failed = false;
  await page.route('**/channels', (route) => {
    if (
      route.request().url() === base + '/channels' &&
      route.request().method() === 'GET' &&
      !failed
    ) {
      failed = true;
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto(web + '/dashboard/channels');
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.getByLabel('Channel name', { exact: true }).fill('Local web channel');
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/channels') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Add channel', exact: true }).click(),
  ]);
  assert.equal(created.status(), 201);
  const ch = await created.json(),
    card = page.locator('li.card').filter({ hasText: 'Local web channel' });
  await card.getByRole('button', { name: 'Channel settings & status', exact: true }).click();
  await card.getByLabel('Widget title', { exact: true }).fill('Local support');
  await card.getByLabel('Welcome message', { exact: true }).fill('Welcome fixture');
  await card
    .getByLabel('Allowed origins (one per line)', { exact: true })
    .fill('https://example.test');
  await card.getByRole('combobox', { name: /Local status/ }).selectOption('disabled');
  const [updated] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/channels/' + ch.id) && r.request().method() === 'PATCH',
    ),
    card.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  assert.equal(updated.status(), 200);
  let saved = (await call('/channels', undefined, a.accessToken)).find((x) => x.id === ch.id);
  assert.equal(saved.status, 'disabled');
  assert.equal(saved.settings.title, 'Local support');
  assert.deepEqual(saved.settings.allowedOrigins, ['https://example.test']);
  await page.screenshot({ path: shots + '/channels-settings-desktop.png', fullPage: true });
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal((await call('/channels', undefined, a.accessToken)).length, 1);
  await page.goto(web + '/dashboard/inbox/settings');
  await page
    .getByRole('spinbutton', { name: 'Maximum open conversations per agent', exact: true })
    .fill('7');
  await page.getByRole('checkbox').check();
  const [settings] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/inbox/settings') && r.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save assignment settings', exact: true }).click(),
  ]);
  assert.equal(settings.status(), 200);
  assert.equal((await call('/inbox/settings', undefined, a.accessToken)).max_open_per_agent, 7);
  await page.getByRole('button', { name: 'New reply', exact: true }).click();
  await page.getByLabel('Shortcut', { exact: true }).fill('hours');
  await page.getByLabel('Title', { exact: true }).fill('Opening hours');
  await page.getByLabel('Reply text', { exact: true }).fill('Hello {{name}}, we are open 9–5.');
  const [reply] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/canned-replies') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Save reply', exact: true }).click(),
  ]);
  assert.equal(reply.status(), 201);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Updated hours');
  const replyId = (await call('/canned-replies', undefined, a.accessToken))[0].id;
  const [edited] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/canned-replies/' + replyId) && r.request().method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Save reply', exact: true }).click(),
  ]);
  assert.equal(edited.status(), 200);
  assert.equal((await call('/canned-replies', undefined, a.accessToken))[0].title, 'Updated hours');
  await page.screenshot({ path: shots + '/inbox-settings-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('heading', { name: 'إعدادات صندوق الوارد', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await page.locator('dialog[open]').waitFor();
  await page.screenshot({ path: shots + '/inbox-settings-arabic-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal((await call('/canned-replies', undefined, a.accessToken)).length, 1);
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await page.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
  await page
    .getByText('لا توجد ردود جاهزة بعد. أنشئ ردًا لتسريع المتابعة.', { exact: true })
    .waitFor();
  assert.equal((await call('/canned-replies', undefined, a.accessToken)).length, 0);
  await page.goto(web + '/dashboard/channels');
  await page.getByRole('heading', { name: 'القنوات', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: shots + '/channels-settings-arabic-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await page.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
  await page
    .getByText('لا توجد قنوات بعد. أضف ويدجت لتجربة أول محادثة.', { exact: true })
    .waitFor();
  assert.equal((await call('/channels', undefined, a.accessToken)).length, 0);
  assert.deepEqual(errors, []);
  console.log(
    'Settings Chromium: channel fetch recovery, create/edit/disable with API persistence, assignment settings, saved reply create/edit/delete, delete cancellation/Escape, Arabic RTL/mobile and no page errors passed. Fixtures only.',
  );
} finally {
  await browser?.close();
}
