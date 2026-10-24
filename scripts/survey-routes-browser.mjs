/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const local = createRequire(import.meta.url),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000',
  out = process.env.BOAT_ROUTE_REPORT || '/workspace/work/route-survey.json';
const response = await fetch(base + '/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `route-survey-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'Route survey fixture',
    workspaceName: 'Route survey',
  }),
});
assert.equal(response.status, 201);
const a = await response.json();
const routes = [
  '',
  '/flows',
  '/flows/new',
  '/inbox',
  '/inbox/settings',
  '/crm',
  '/crm/work',
  '/campaigns',
  '/automations',
  '/agents',
  '/knowledge',
  '/reports',
  '/billing',
  '/branding',
  '/team',
  '/settings',
  '/channels',
  '/departments',
  '/delivery',
  '/sessions',
  '/audit',
  '/onboarding',
];
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (s) => {
      if (window !== window.top) return;
      if (!localStorage.getItem('session')) localStorage.setItem('session', JSON.stringify(s));
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  await page.goto(web + '/dashboard');
  for (const language of ['en', 'ar']) {
    await page.evaluate((l) => localStorage.setItem('boat-language', l), language);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        const start = errors.length;
        const r = await page.goto(web + '/dashboard' + route);
        await page.locator('.page-workspace,.focused-workspace').first().waitFor();
        await page.waitForTimeout(150);
        const data = await page.evaluate(() => ({
          direction: document.documentElement.dir,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          heading: document.querySelector('.page-workspace h1,.focused-workspace h1')?.textContent,
          unlabelled: [...document.querySelectorAll('input:not([type=hidden]),textarea,select')]
            .filter(
              (e) =>
                !e.getAttribute('aria-label') &&
                !e.getAttribute('aria-labelledby') &&
                !e.labels?.length,
            )
            .map((e) => ({
              tag: e.tagName,
              name: e.getAttribute('name'),
              placeholder: e.getAttribute('placeholder'),
            })),
          arabicLines: document.body.innerText
            .split('\n')
            .filter((s) => /[\u0600-\u06ff]/.test(s) && !/^العربية( \/ English)?$/.test(s))
            .slice(0, 20),
        }));
        results.push({
          route: '/dashboard' + route,
          language,
          width,
          status: r.status(),
          ...data,
          pageErrors: errors.slice(start),
        });
        await writeFile(out, JSON.stringify(results, null, 2));
      }
    }
  }
  await mkdir('/workspace/work/acceptance', { recursive: true });
  console.log(
    JSON.stringify({
      views: results.length,
      overflow: results
        .filter((x) => x.overflow)
        .map((x) => ({ route: x.route, language: x.language, width: x.width })),
      pageErrors: errors,
      unlabelledRoutes: [
        ...new Set(results.filter((x) => x.unlabelled.length).map((x) => x.route)),
      ],
      scope:
        'Route/direction/layout survey only; actual behavior is covered separately by functional suites',
    }),
  );
} finally {
  await browser.close();
}
