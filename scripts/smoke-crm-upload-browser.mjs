/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
    email: `upload-browser-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Upload browser fixture',
    workspaceName: 'Upload acceptance',
  });
  await call('/crm/fields', { key: 'memo', label: 'Fixture memo', type: 'text' }, a.accessToken);
  const memo = 'x'.repeat(1900),
    rows = Array.from({ length: 500 }, (_, i) => ({
      name: 'Bulk fixture ' + i,
      email: `bulk-${i}@example.test`,
      attributes: { memo },
    })),
    buffer = Buffer.from(JSON.stringify(rows));
  assert.ok(buffer.length > 900000);
  assert.ok(buffer.length < 10000000);
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(20000);
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
  const offsets = [];
  await page.route('**/crm/jobs/*/upload', async (route) => {
    const input = route.request().postDataJSON();
    offsets.push(input.after);
    if (input.after === 100 && !failed) {
      failed = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto(web + '/dashboard/crm');
  const panel = page.locator('#crm-jobs'),
    file = { name: 'large-contacts.json', mimeType: 'application/json', buffer };
  await panel.locator('input[type=file]').setInputFiles(file);
  await panel.getByRole('alert').waitFor();
  const pending = (await call('/crm/jobs', undefined, a.accessToken)).find(
    (j) => j.status === 'uploading',
  );
  assert.ok(pending);
  assert.equal(pending.uploaded, 200);
  assert.equal((await call('/crm/contacts', undefined, a.accessToken)).total, 0);
  const [completed] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/complete-upload') && r.request().method() === 'POST',
    ),
    panel.locator('input[type=file]').setInputFiles(file),
  ]);
  assert.equal(completed.status(), 201);
  assert.deepEqual(offsets, [0, 100, 200, 300, 400]);
  let job;
  for (let n = 0; n < 300; n++) {
    job = (await call('/crm/jobs', undefined, a.accessToken)).find((j) => j.id === pending.id);
    if (job.status === 'completed') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(job.status, 'completed');
  assert.equal(job.succeeded, 500);
  assert.equal(job.processed, 500);
  assert.deepEqual(job.errors, []);
  const contacts = await call('/crm/contacts?limit=1', undefined, a.accessToken);
  assert.equal(contacts.total, 500);
  assert.equal(contacts.items[0].attributes.memo, memo);
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
  assert.equal((await call('/crm/jobs', undefined, a.accessToken)).length, 1);
  await page.screenshot({ path: shots + '/crm-upload-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('heading', { name: 'مهام استيراد وتصدير العملاء', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  await page.screenshot({ path: shots + '/crm-upload-arabic-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'CRM upload Chromium: >900KB JSON, response lost after committed chunk, same-file resume at offset 200, one job/500 exact contacts with full attributes, no early import, completed progress and Arabic/mobile passed.',
  );
} finally {
  await browser?.close();
}
