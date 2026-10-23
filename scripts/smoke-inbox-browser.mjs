/* global localStorage */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js');
const { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
(async () => {
  const db = new DatabaseService();
  let browser;
  try {
    async function call(path, body, token) {
      const r = await fetch((process.env.SMOKE_API_URL || 'http://localhost:4000') + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const x = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(x));
      return x;
    }
    const a = await call('/auth/register', {
      email: 'inbox-browser-' + randomUUID() + '@example.test',
      password: 'local-browser-test-12345',
      fullName: 'Inbox tester',
      workspaceName: 'Inbox visual test',
    });
    const channel = await call('/channels', { type: 'web', name: 'Website' }, a.accessToken);
    const contact = await call(
      '/crm/contacts',
      { name: 'Mariam customer', email: 'mariam@example.test' },
      a.accessToken,
    );
    const conv = await db.withTenant(
      a.tenantId,
      async (c) =>
        (
          await c.query(
            "INSERT INTO conversations(tenant_id,channel_id,contact_id,handled_by) VALUES($1,$2,$3,'human') RETURNING id",
            [a.tenantId, channel.id, contact.id],
          )
        ).rows[0],
    );
    browser = await chromium.launch({
      executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (a) => {
        localStorage.setItem('session', JSON.stringify(a));
        localStorage.setItem('boat-language', 'en');
      },
      { accessToken: a.accessToken, refreshToken: a.refreshToken },
    );
    await page.goto((process.env.SMOKE_WEB_URL || 'http://localhost:3000') + '/dashboard/inbox');
    await page.getByRole('button', { name: /Mariam customer/ }).press('Enter');
    await page.getByRole('button', { name: 'Customer profile', exact: true }).click();
    await page.locator('dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    if (await page.locator('dialog[open]').count()) throw new Error('Dialog did not dismiss');
    await page.getByRole('button', { name: 'Internal note', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Reply composer' })
      .fill('Private browser acceptance note');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByText('Private browser acceptance note', { exact: true }).waitFor();
    const messages = await call('/conversations/' + conv.id + '/messages', null, a.accessToken);
    if (
      !messages.items.some(
        (m) => m.is_internal && m.content.text === 'Private browser acceptance note',
      )
    )
      throw new Error('Private note was not persisted');
    await page.screenshot({
      path: (process.env.SMOKE_SCREENSHOT_DIR || '/tmp') + '/boat-inbox-conversation-mobile.png',
      fullPage: true,
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(
      'PASS populated inbox browser: keyboard selection, native customer dialog and Escape, internal note persisted through real API, mobile screenshot, zero page errors.',
    );
  } finally {
    if (browser) await browser.close();
    await db.onModuleDestroy();
  }
})();
