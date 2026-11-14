/* global localStorage, document, window */
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const root = 'docs/channel-connections-20261114/browser';
mkdirSync(root, { recursive: true });
async function api(path, token, body) {
  const r = await fetch('http://localhost:4000' + path, {
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
const owner = await api('/auth/register', null, {
  email: randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Connection QA',
  workspaceName: 'Isolated Connection QA',
});
await api('/channels', owner.accessToken, {
  type: 'whatsapp',
  name: 'Synthetic business',
  credentials: {
    phoneNumberId: '900000123',
    wabaId: '900000500',
    accessToken: 'synthetic-not-a-provider-token',
  },
});
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const language of ['en', 'ar'])
    for (const width of [320, 390, 768, 1366, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 936 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(
        ({ owner, language }) => {
          localStorage.setItem('session', JSON.stringify(owner));
          localStorage.setItem('boat-language', language);
        },
        { owner, language },
      );
      let posts = 0,
        catalogConfigured = false,
        lastStart;
      await page.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (!['localhost', '127.0.0.1'].includes(u.hostname)) return route.abort();
        if (u.pathname === '/integrations/capabilities')
          return route.fulfill({ json: { google: { configured: true, externalEnabled: true } } });
        if (u.pathname === '/integrations/google/start') {
          assert.deepEqual(route.request().postDataJSON(), {
            purposes: ['calendar', 'contacts_read'],
          });
          return route.fulfill({
            status: 503,
            json: { message: 'Synthetic Google authorization unavailable' },
          });
        }
        if (u.pathname === '/channels/meta/config')
          return route.fulfill({
            json: {
              configured: true,
              connectEnabled: true,
              externalEnabled: false,
              appId: 'synthetic-app',
              embeddedConfigId: 'synthetic-standard',
              catalogConfigured,
              webhookUrl: 'https://api.example.test/webhooks/whatsapp',
              redirectUri: 'https://api.example.test/channels/meta/callback',
            },
          });
        if (u.pathname === '/channels/meta/start') {
          posts++;
          lastStart = route.request().postDataJSON();
          return route.fulfill({
            status: 503,
            json: { message: 'Synthetic authorization unavailable' },
          });
        }
        return route.continue();
      });
      const text = (ar, en) => (language === 'ar' ? ar : en);
      async function capture(name) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${root}/${language}-${width}-${name}.png`, fullPage: true });
        const size = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        assert.ok(
          size.scroll <= size.client + 1,
          `${language} ${width} ${name} overflow ${JSON.stringify(size)}`,
        );
      }
      await page.goto('http://localhost:3000/dashboard/channels');
      await capture('accounts');
      await page
        .getByRole('button', { name: text('ربط WhatsApp', 'Connect WhatsApp'), exact: true })
        .click();
      await page.waitForURL('**/connect/whatsapp');
      await page
        .getByRole('heading', { name: text('تكامل WhatsApp', 'WhatsApp Integration'), exact: true })
        .waitFor();
      await page.getByText('Synthetic business', { exact: true }).waitFor();
      await capture('whatsapp');
      await page
        .getByRole('button', {
          name: text('الربط باستخدام التسجيل المضمّن', 'Connect with Embed Onboarding') + ' →',
          exact: true,
        })
        .click();
      assert.equal(
        await page
          .getByRole('button', {
            name: text('الربط مع الكتالوج', 'Connect With Catalog'),
            exact: true,
          })
          .isDisabled(),
        true,
      );
      await capture('whatsapp-choices');
      await page
        .getByRole('button', {
          name: text('الربط بدون الكتالوج', 'Connect Without Catalog'),
          exact: true,
        })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Synthetic authorization unavailable' })
        .waitFor();
      assert.equal(posts, 1);
      assert.deepEqual(lastStart, { kind: 'whatsapp', withCatalog: false });
      await page
        .getByRole('button', {
          name: text('الربط باستخدام API', 'Connect with API') + ' →',
          exact: true,
        })
        .click();
      const fields = await page.locator('#whatsapp-api-form input').count();
      assert.equal(fields, 2);
      assert.equal(
        await page.locator('#whatsapp-api-form input').last().getAttribute('type'),
        'password',
      );
      await capture('whatsapp-api');
      await page
        .getByRole('button', {
          name: text('الربط باستخدام API', 'Connect with API') + ' →',
          exact: true,
        })
        .click();
      assert.equal(await page.locator('#whatsapp-api-form').count(), 0);
      catalogConfigured = true;
      await page.reload();
      await page
        .getByRole('button', {
          name: text('الربط باستخدام التسجيل المضمّن', 'Connect with Embed Onboarding') + ' →',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: text('الربط مع الكتالوج', 'Connect With Catalog'),
          exact: true,
        })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Synthetic authorization unavailable' })
        .waitFor();
      assert.deepEqual(lastStart, { kind: 'whatsapp', withCatalog: true });
      await capture('whatsapp-catalog');
      for (const kind of ['facebook', 'instagram']) {
        await page.goto('http://localhost:3000/dashboard/channels/connect/' + kind);
        await page
          .getByRole('button', {
            name: text('تسجيل الدخول باستخدام Facebook', 'Login with Facebook'),
            exact: true,
          })
          .click();
        await page
          .getByRole('alert')
          .filter({ hasText: 'Synthetic authorization unavailable' })
          .waitFor();
        await capture(kind);
      }
      await page.goto('http://localhost:3000/dashboard/channels/connect/telegram');
      await page
        .getByRole('heading', {
          name: text('ربط بوت Telegram', 'Telegram Bot Connection'),
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator('input[name="botToken"]').count(), 1);
      assert.equal(await page.locator('input[name="name"]').count(), 0);
      await capture('telegram');
      await page.goto('http://localhost:3000/dashboard/channels/connect/google');
      await page
        .getByRole('button', {
          name: text('تسجيل الدخول باستخدام Google', 'Sign in with Google'),
          exact: true,
        })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Synthetic Google authorization unavailable' })
        .waitFor();
      await capture('google');
      await page.goto('http://localhost:3000/dashboard/channels/connect/web');
      await page
        .getByRole('button', {
          name: text('إنشاء ويدجت محادثة مباشرة', 'Create Live Chat Widget'),
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByLabel(text('عنوان نافذة المحادثة', 'Chatbox Display Title'), { exact: true })
        .fill(`Synthetic ${language}-${width}`);
      await dialog
        .getByLabel(text('رابط الموقع', 'Website URL'), { exact: true })
        .fill('http://localhost:3000');
      await dialog
        .getByLabel(text('الموضع', 'Position'), { exact: true })
        .selectOption('top-right');
      await dialog
        .getByLabel(text('حالة البداية', 'Startup State'), { exact: true })
        .selectOption('open');
      await capture('webchat-setup');
      await dialog.getByRole('button', { name: text('ربط', 'Connect'), exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page
        .getByRole('cell', { name: `Synthetic ${language}-${width}`, exact: true })
        .waitFor();
      await capture('webchat');
      const widgets = await api('/channels', owner.accessToken);
      const widget = widgets.find((w) => w.name === `Synthetic ${language}-${width}`);
      assert.equal(widget.settings.verticalPosition, 'top');
      assert.equal(widget.settings.startup, 'open');
      const config = await api('/widget/' + widget.external_id + '/config');
      assert.equal(config.themeBackground, '#fbfbfc');
      await page.evaluate((key) => {
        const script = document.createElement('script');
        script.src = 'http://localhost:4000/widget.js';
        script.dataset.key = key;
        document.body.appendChild(script);
      }, widget.external_id);
      const panel = page.locator('.panel.open');
      await panel.waitFor();
      const layout = await panel.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      });
      assert.ok(layout.left >= 0 && layout.right <= width + 1 && layout.top >= 0);
      await capture('webchat-runtime');
      assert.deepEqual(errors, []);
      results.push({ language, width, status: 'PASS', screens: 12 });
      await context.close();
    }
} finally {
  await browser.close();
}
writeFileSync(
  root + '/results.json',
  JSON.stringify(
    {
      mode: 'isolated local app; real API auth/data; Meta start/config fixtures; all non-loopback browser requests denied; no live provider claim',
      results,
    },
    null,
    2,
  ),
);
console.log(
  'PASS: ' +
    results.length +
    ' AR/EN viewport cases; twelve screenshots each, no document overflow, channel navigation, embedded choices/config gate, real authorization error rendering, API form open/close and token field order.',
);
