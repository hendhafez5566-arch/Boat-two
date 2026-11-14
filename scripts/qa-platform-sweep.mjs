/* global document, localStorage, requestAnimationFrame, getComputedStyle */
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const out = 'docs/enterprise-20261114/browser';
mkdirSync(out, { recursive: true });
function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(dir + '/' + e.name) : e.name === 'page.tsx' ? [dir] : [],
  );
}
const routes = pages('apps/web/app/dashboard')
  .map((p) => p.replace('apps/web/app', ''))
  .filter((p) => !p.includes('['))
  .sort();
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
  if (!r.ok) throw Error(path + ': ' + JSON.stringify(d));
  return d;
}
const owner = await api('/auth/register', null, {
  email: randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Enterprise QA',
  workspaceName: 'Isolated Enterprise QA',
});
await api('/channels', owner.accessToken, { type: 'web', name: 'Synthetic sweep website' });
await api('/workspace/onboarding/complete', owner.accessToken, {});
const flow = await api('/flows', owner.accessToken, { name: 'Synthetic sweep flow' });
routes.push(
  '/dashboard/flows/' + flow.id,
  '/dashboard/flows/' + flow.id + '/input-report',
  '/dashboard/flows/' + flow.id + '/workspace',
);
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const language of ['en', 'ar'])
    for (const width of [320, 390, 768, 1366, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 936 } });
      await context.addInitScript(
        ({ owner, language }) => {
          localStorage.setItem('session', JSON.stringify(owner));
          localStorage.setItem('boat-language', language);
        },
        { owner, language },
      );
      const page = await context.newPage();
      await page.route('**/*', (r) =>
        ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      if (width >= 1366) {
        await page.goto('http://localhost:3000/dashboard');
        const search = page.getByRole('combobox', {
          name: language === 'ar' ? 'بحث في القوائم' : 'Search menus',
        });
        await search.fill('manager');
        await search.press('ArrowDown');
        const selected = page
          .getByRole('listbox', { name: language === 'ar' ? 'نتائج البحث' : 'Search results' })
          .getByRole('option', { selected: true });
        if (
          !(await selected.textContent()).includes(
            language === 'ar' ? 'مدير المستخدمين' : 'User Manager',
          )
        )
          throw Error('Search arrow selection failed');
        await search.press('Enter');
        await page.waitForURL('**/dashboard/team');
      }
      for (const path of routes) {
        const failures = [],
          requests = [];
        const onError = (e) => failures.push(e.message);
        const onResponse = (r) => {
          if (r.status() >= 500)
            requests.push({ url: new URL(r.url()).pathname, status: r.status() });
        };
        page.on('pageerror', onError);
        page.on('response', onResponse);
        const record = { path, language, width, failures, requests };
        try {
          await page.goto('http://localhost:3000' + path, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          await page.locator('.page-loading').waitFor({ state: 'hidden', timeout: 10000 });
          await page
            .locator('.page-workspace,.focused-workspace,.flow-editor-workspace')
            .waitFor({ timeout: 10000 });
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          });
          Object.assign(
            record,
            await page.evaluate(() => {
              const w = document.documentElement.clientWidth;
              const visible = (e) => {
                const r = e.getBoundingClientRect();
                const s = getComputedStyle(e);
                return (
                  r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
                );
              };
              const overflow = document.documentElement.scrollWidth > w + 1;
              const offenders = overflow
                ? [...document.querySelectorAll('main *, .page-workspace > *')]
                    .filter((e) => {
                      if (!visible(e)) return false;
                      const r = e.getBoundingClientRect();
                      return r.left < -1 || r.right > w + 1;
                    })
                    .slice(0, 15)
                    .map((e) => ({
                      tag: e.tagName,
                      cls: String(e.className).slice(0, 150),
                      text: e.textContent?.slice(0, 80),
                    }))
                : [];
              const interactions = [
                ...document.querySelectorAll(
                  'main button,main a,main input,main select,main textarea,[role="tab"]',
                ),
              ]
                .filter(visible)
                .map((e) => ({
                  tag: e.tagName,
                  type: e.getAttribute('type'),
                  name:
                    e.getAttribute('aria-label') ||
                    e.getAttribute('name') ||
                    e.textContent?.trim().slice(0, 100),
                  href: e.getAttribute('href'),
                  disabled: e.disabled === true,
                }));
              return {
                overflow,
                offenders,
                heading: [...document.querySelectorAll('main h1')].map((e) => ({
                  text: e.textContent,
                  font: getComputedStyle(e).fontSize,
                })),
                interactions,
              };
            }),
          );
          if (
            record.overflow ||
            failures.length ||
            requests.length ||
            width === 1366 ||
            path === '/dashboard/developer'
          ) {
            const file = `${language}-${width}-${path.replaceAll('/', '_')}.png`;
            await page.screenshot({ path: out + '/' + file, fullPage: true });
            record.screenshot = file;
          }
        } catch (e) {
          failures.push(e.message);
        }
        page.off('pageerror', onError);
        page.off('response', onResponse);
        results.push(record);
        console.log(
          JSON.stringify({ path, language, width, overflow: record.overflow, failures, requests }),
        );
      }
      await context.close();
    }
} finally {
  await browser.close();
  writeFileSync(
    out + '/results.json',
    JSON.stringify(
      {
        scope:
          'isolated source smoke/responsive inventory; not reference parity or all interaction acceptance',
        routes,
        results,
      },
      null,
      2,
    ),
  );
}
const failed = results.filter((r) => r.overflow || r.failures.length || r.requests.length);
console.log('PLATFORM SWEEP', results.length, 'cases;', failed.length, 'failed');
if (failed.length) process.exitCode = 1;
