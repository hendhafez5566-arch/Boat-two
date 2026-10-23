/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = local('./dist/database/database.service.js'),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
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
    email: `debug-browser-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Debug browser',
    workspaceName: 'Debug acceptance',
  });
  const rule = await call(
      '/automations',
      {
        name: 'Debug browser rule',
        enabled: true,
        trigger: 'crm.contacts.insert',
        conditions: {},
        actions: [
          {
            type: 'branch',
            conditions: {},
            then: [{ type: 'http', url: 'https://example.test/not-called', body: '{}' }],
            otherwise: [],
          },
        ],
      },
      a.accessToken,
    ),
    ct = await call('/crm/contacts', { name: 'Debug browser contact' }, a.accessToken);
  let failure;
  for (let n = 0; n < 150; n++) {
    failure = (await call('/automations/failures', undefined, a.accessToken)).find(
      (f) => f.rule_id === rule.id,
    );
    if (failure?.event_status === 'failed') break;
    // Accelerate only this fixture's retry clock; the real worker performs every failed attempt.
    await db.withTenant(a.tenantId, (c) =>
      c.query(
        "UPDATE domain_events SET available_at=now() WHERE payload->>'contactId'=$1 AND status='pending'",
        [ct.id],
      ),
    );
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(failure.event_status, 'failed');
  assert.equal(failure.action_path, 'root.0.then.0');
  assert.equal(failure.rule_revision, 1);
  assert.ok(failure.attempts >= 5);
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
  await page.getByText('Execution context', { exact: true }).click();
  await page.getByText('root.0.then.0', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open rule for review', exact: true }).click();
  const step = page.locator('[data-step-path="root.0.then.0"]');
  await step.getByRole('combobox', { name: 'Action type', exact: true }).selectOption('note');
  await step.getByLabel('Details', { exact: true }).fill('Recovered from browser debugger');
  const [saved] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/automations/' + rule.id) && r.request().method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Save sequence', exact: true }).click(),
  ]);
  assert.equal(saved.status(), 200);
  const [retry] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith('/automations/failures/' + failure.id + '/retry') &&
        r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Retry safely', exact: true }).click(),
  ]);
  assert.equal(retry.status(), 201);
  for (let n = 0; n < 100; n++) {
    failure = (await call('/automations/failures', undefined, a.accessToken)).find(
      (f) => f.id === failure.id,
    );
    if (failure.resolved_at && failure.event_status === 'completed') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(failure.resolved_at);
  assert.equal(failure.event_status, 'completed');
  const timeline = await call('/crm/contacts/' + ct.id + '/timeline', undefined, a.accessToken);
  assert.equal(
    timeline.notes.filter((n) => n.body === 'Recovered from browser debugger').length,
    1,
  );
  await page.getByRole('button', { name: 'Refresh failures', exact: true }).click();
  await page.getByText('Recovered', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry safely', exact: true }).count(), 0);
  await page.screenshot({ path: shots + '/automation-debug-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('heading', { name: 'الأخطاء والاستعادة', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: shots + '/automation-debug-arabic-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Automation debugger Chromium: actual worker exhaustion, nested path/revision, rule review/edit, safe retry, one persisted recovery note, resolved failure and Arabic/mobile passed. No external delivery.',
  );
} finally {
  await browser?.close();
  await db.onModuleDestroy();
}
