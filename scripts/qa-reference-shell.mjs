import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const out = process.env.REFERENCE_QA_OUTPUT;
if (out) mkdirSync(out, { recursive: true });

async function post(path, body, token) {
  const response = await fetch('http://localhost:4000' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, path + ' ' + response.status);
  return response.json();
}

const session = await post('/auth/register', {
  email: 'shell-' + randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Bot Two QA',
  workspaceName: 'Bot Two Reference QA',
});
await post('/channels', { type: 'web', name: 'QA Website' }, session.accessToken);
await post('/workspace/onboarding/complete', {}, session.accessToken);

const fullRoutes = [
  '', 'commerce', 'crm/today', 'flows', 'inbox', 'reports', 'channels', 'campaigns',
  'sequences', 'automations', 'agents', 'knowledge', 'team', 'billing', 'settings', 'onboarding',
];
const coreRoutes = ['', 'commerce', 'crm/today', 'flows'];
const browser = await chromium.launchPersistentContext('', {
  executablePath: process.env.BOAT_CHROMIUM,
  args: ['--no-sandbox', '--disable-software-rasterizer'],
});
try {
  for (const language of ['ar', 'en']) {
    const t = (ar, en) => language === 'ar' ? ar : en;
    for (const width of [360, 390, 750, 768, 1024, 1440].filter(
      (value) => !process.env.REFERENCE_QA_WIDTH || process.env.REFERENCE_QA_WIDTH.split(',').includes(String(value)),
    )) {
      const page = await browser.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(({ session, language }) => {
        localStorage.setItem('session', JSON.stringify(session));
        localStorage.setItem('boat-language', language);
      }, { session, language });
      for (const route of [390, 1440].includes(width) ? fullRoutes : coreRoutes) {
        const suffix = route ? '/' + route : '';
        const response = await page.goto('http://localhost:3000/dashboard' + suffix);
        assert.ok(response?.ok(), suffix);
        await page.locator('.product-sidebar .brand').waitFor({ state: 'attached' });
        await page.locator('.page-loading').waitFor({ state: 'hidden' });
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        assert.equal(await page.locator('html').getAttribute('dir'), t('rtl', 'ltr'));
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          canvas: getComputedStyle(document.querySelector('.product-shell')).backgroundColor,
        }));
        assert.equal(metrics.canvas, 'rgb(245, 247, 251)', suffix);
        console.log(JSON.stringify({ language, width, route: route || 'dashboard', ...metrics }));
        if (!route) {
          const nav = page.getByRole('navigation', { name: t('التنقل على الهاتف', 'Mobile navigation') });
          assert.equal(await nav.isVisible(), width <= 750);
          if (width <= 750) {
            await nav.getByRole('button').click();
            await page.locator('.product-sidebar.is-open').waitFor();
            assert.equal(await page.locator('.bs-close').evaluate((button) => button === document.activeElement), true);
            await page.keyboard.press('Escape');
            await page.locator('.product-sidebar.is-open').waitFor({ state: 'hidden' });
            assert.equal(await nav.getByRole('button').evaluate((button) => button === document.activeElement), true);
          }
          assert.equal(await page.locator('#dashboard-welcome').evaluate((h) => getComputedStyle(h).color), 'rgb(255, 255, 255)');
          await page.getByRole('combobox', { name: t('المنصة', 'Platform') }).selectOption('whatsapp');
          await Promise.all([
            page.waitForResponse((r) => r.ok() && r.url().includes('/workspace/dashboard?channel=whatsapp')),
            page.getByRole('button', { name: t('تصفية', 'Filter'), exact: true }).click(),
          ]);
        }
        if (out) await page.screenshot({ path: out + '/final-' + language + '-' + width + '-' + (route.replace('/', '-') || 'dashboard') + '.png' });
        assert.ok(metrics.overflow <= 0, JSON.stringify({ route, language, width, ...metrics }));
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
