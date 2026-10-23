/* global localStorage, document, innerWidth, window */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const apiBase = process.env.SMOKE_API_URL || 'http://localhost:4000',
  webBase = process.env.SMOKE_WEB_URL || 'http://localhost:3000';
(async () => {
  async function call(path, body, token) {
    const r = await fetch(apiBase + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    assert.ok(r.ok, JSON.stringify(data));
    return data;
  }
  const a = await call('/auth/register', {
    email: 'browser-' + randomUUID() + '@example.test',
    password: 'local-browser-fixture-12345',
    fullName: 'Browser fixture',
    workspaceName: 'Browser review',
  });
  await call('/channels', { type: 'web', name: 'Local preview channel' }, a.accessToken);
  const browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1536, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (session) => {
      // Session setup belongs to the app, never sandboxed email preview frames.
      if (window !== window.top) return;
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', 'en');
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  await page.goto(webBase + '/dashboard/flows/new');
  await page.getByRole('button', { name: /Capture leads/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.goal-card').first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Bot name', { exact: true }).fill('Premium browser fixture');
  await page
    .getByLabel('Welcome message', { exact: true })
    .fill('Welcome to our local test. Choose an option.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Add a reply button' }).click();
  await page.getByLabel('Button label', { exact: true }).fill('Help me');
  await page
    .getByLabel('Response when selected', { exact: true })
    .fill('Our team is ready to help.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Local preview channel/ }).click();
  await page.getByRole('button', { name: 'Save draft and preview' }).click();
  await page.getByRole('button', { name: 'Start preview' }).click();
  await page.getByRole('button', { name: 'Help me', exact: true }).click();
  await page.getByText('Our team is ready to help.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Validate and publish bot' }).click();
  await page.getByRole('heading', { name: 'Your bot is published' }).waitFor();
  await page.getByRole('link', { name: 'Open bot', exact: true }).click();
  await page.locator('.premium-flow-node').first().waitFor();
  await page.screenshot({
    path: (process.env.SMOKE_SCREENSHOT_DIR || '/tmp') + '/boat-builder-desktop.png',
    fullPage: true,
  });
  await page.locator('input[aria-label="Search steps"]').fill('AI assistant');
  assert.equal(await page.locator('.palette-step').count(), 1);
  const initialNodes = await page.locator('.premium-flow-node').count();
  await page.locator('.palette-step').click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.locator('.premium-flow-node').count(), initialNodes);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal(await page.locator('.premium-flow-node').count(), initialNodes + 1);
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: (process.env.SMOKE_SCREENSHOT_DIR || '/tmp') + '/boat-builder-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, [], 'Builder must not emit browser errors');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Builder must fit mobile viewport',
  );
  const builderNodeCount = await page.locator('.premium-flow-node').count();
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto(webBase + '/dashboard/team');
  await page.getByRole('button', { name: 'Preview branding' }).click();
  await page.locator('iframe[title="Invitation email preview"]').waitFor();
  await page.getByLabel('Email', { exact: true }).fill('invite-' + randomUUID() + '@example.test');
  await page.getByLabel('Queue a branded invitation email').check();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await page
    .getByText('Email queued. This does not confirm delivery; check its status below.')
    .waitFor();
  await page.goto(webBase + '/dashboard/inbox');
  await page.getByRole('textbox', { name: 'Search conversations' }).fill('no-matching-customer');
  await page.getByText('No conversations match these filters.').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Inbox must fit mobile viewport',
  );
  await page.screenshot({
    path: (process.env.SMOKE_SCREENSHOT_DIR || '/tmp') + '/boat-inbox-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, [], 'Workspace must not emit browser errors');
  console.log(
    JSON.stringify({
      errors,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      wizardPublished: true,
      invitationMailQueued: true,
      inboxMobileChecked: true,
      nodeCount: builderNodeCount,
    }),
  );
  await browser.close();
})();
