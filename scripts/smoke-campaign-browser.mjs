/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const { chromium } = require(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const db = new DatabaseService();
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000';
const shots = process.env.BOAT_SCREENSHOTS || '/workspace/work/acceptance';
async function call(path, body, token) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  assert.ok(res.ok, JSON.stringify(data));
  return data;
}
let browser;
try {
  const a = await call('/auth/register', {
    email: `campaign-browser-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Campaign fixture',
    workspaceName: 'Campaign acceptance',
  });
  const channel = await call('/channels', { type: 'web', name: 'Local website' }, a.accessToken);
  await db.withTenant(a.tenantId, async (c) => {
    const contact = (
      await c.query(
        "INSERT INTO contacts(tenant_id,name) VALUES($1,'Local consent fixture') RETURNING id",
        [a.tenantId],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO contact_channels(tenant_id,contact_id,channel_id,external_id) VALUES($1,$2,$3,'local-fixture')",
      [a.tenantId, contact, channel.id],
    );
    await c.query(
      "INSERT INTO contact_consents(tenant_id,contact_id,channel_id,status,evidence) VALUES($1,$2,$3,'opted_in','Local test fixture only')",
      [a.tenantId, contact, channel.id],
    );
  });
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (session) => {
      if (window !== window.top) return;
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', 'en');
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  await page.goto(web + '/dashboard/campaigns');
  assert.equal(
    await page.getByRole('button', { name: 'Close navigation', exact: true }).isVisible(),
    false,
  );
  const composer = page.getByRole('region', { name: 'Create campaign', exact: true });
  await composer.getByLabel('Campaign name', { exact: true }).fill('Browser draft');
  await composer.getByLabel('Channel', { exact: true }).selectOption(channel.id);
  await composer.getByRole('button', { name: 'Review audience', exact: true }).click();
  await composer.getByText(/Matching filters: 1.*Eligible by identity and consent: 1/).waitFor();
  await composer.getByRole('button', { name: 'Next', exact: true }).click();
  await composer.getByRole('button', { name: 'Welcome', exact: true }).click();
  await composer
    .getByRole('textbox', { name: 'Message content', exact: true })
    .fill('Local message preview');
  await composer.getByRole('button', { name: 'Preview message', exact: true }).click();
  assert.equal(
    await composer.getByRole('article', { name: 'Message preview' }).innerText(),
    'Local message preview',
  );
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + '/campaign-review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: shots + '/campaign-review-mobile.png', fullPage: true });
  await composer.getByRole('button', { name: 'Edit message', exact: true }).click();
  assert.equal(
    await composer.getByRole('textbox', { name: 'Message content', exact: true }).inputValue(),
    'Local message preview',
  );
  await composer.getByRole('button', { name: 'Preview message', exact: true }).click();
  await composer.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page
    .getByText('Campaign draft saved. Review and schedule it below.', { exact: true })
    .waitFor();
  const campaigns = await call('/campaigns', undefined, a.accessToken);
  assert.equal(campaigns[0].status, 'draft');
  assert.equal(campaigns[0].content.text, 'Local message preview');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('region', { name: 'إنشاء حملة', exact: true }).waitFor();
  await page
    .getByText('حُفظت مسودة الحملة. يمكنك مراجعتها وجدولتها من القائمة.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  await page.screenshot({ path: shots + '/campaign-arabic-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Campaign Chromium acceptance: audience, three steps, gallery, editable preview, persisted draft, English/Arabic and 390px layout passed; no delivery.',
  );
} finally {
  await browser?.close();
  await db.onModuleDestroy();
}
