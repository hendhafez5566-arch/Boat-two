/* global localStorage, window */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = local('./dist/database/database.service.js'),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000';
async function call(path, body, token, status) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (status) assert.equal(res.status, status, JSON.stringify(data));
  else assert.ok(res.ok, JSON.stringify(data));
  return data;
}
let browser;
try {
  const fixture = (name) =>
    call('/auth/register', {
      email: `workspace-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Workspace fixture',
      workspaceName: name,
    });
  const a = await fixture('Owner workspace'),
    b = await fixture('Agent workspace'),
    userId = JSON.parse(Buffer.from(a.accessToken.split('.')[1], 'base64url')).sub;
  await db.withTenant(b.tenantId, (c) =>
    c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'agent')", [
      b.tenantId,
      userId,
    ]),
  );
  await call(
    '/crm/contacts',
    { name: 'Owner-only customer', lifecycle: 'qualified' },
    a.accessToken,
  );
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
  await page.goto(web + '/dashboard/crm');
  await page.getByRole('cell', { name: 'Qualified', exact: true }).waitFor();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('cell', { name: 'مؤهل', exact: true }).waitFor();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Switch workspace', exact: true })
    .selectOption(b.tenantId);
  await page.waitForURL(web + '/dashboard');
  await page.getByRole('combobox', { name: 'Switch workspace', exact: true }).waitFor();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
  assert.equal((await call('/workspace', undefined, session.accessToken)).role, 'agent');
  await call('/agents', undefined, session.accessToken, 403);
  const foreign = await call('/crm/contacts', undefined, session.accessToken);
  assert.equal(foreign.items.length, 0);
  assert.equal(
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'AI agents', exact: true })
      .count(),
    0,
  );
  await page.goto(web + '/dashboard/agents');
  await page
    .getByRole('heading', { name: 'This page requires management access', exact: true })
    .waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save provider', exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Open Inbox', exact: true }).click();
  await page.waitForURL(web + '/dashboard/inbox');
  await page
    .getByRole('combobox', { name: 'Switch workspace', exact: true })
    .selectOption(a.tenantId);
  await page.waitForURL(web + '/dashboard');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
  assert.equal((await call('/workspace', undefined, restored.accessToken)).role, 'owner');
  assert.deepEqual(errors, []);
  console.log(
    'Workspace Chromium: actual owner-to-agent workspace switch, isolated contacts, hidden management navigation, API 403, direct-page permission state, return switch and live Arabic status labels passed.',
  );
} finally {
  await browser?.close();
  await db.onModuleDestroy();
}
