/* global localStorage, document, innerWidth */
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const out = 'docs/enterprise-20261115/segments';
mkdirSync(out, { recursive: true });
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.ok(r.ok, path + JSON.stringify(d));
  return d;
}
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const results = [];
let page;
try {
  for (const language of ['en', 'ar'])
    for (const width of [320, 390, 768, 1366, 1920]) {
      const t = (ar, en) => (language === 'ar' ? ar : en);
      const session = await api('/auth/register', null, {
          email: randomUUID() + '@example.test',
          password: 'Synthetic-' + randomUUID(),
          fullName: 'Segment QA',
          workspaceName: 'Isolated segment acceptance',
        }),
        token = session.accessToken;
      await api('/channels', token, { type: 'web', name: 'Isolated website' });
      await api('/workspace/onboarding/complete', token, {});
      await api('/crm/contacts', token, { name: 'Included customer', tags: ['VIP'] });
      await api('/crm/contacts', token, { name: 'Excluded customer', tags: [] });
      const context = await browser.newContext({ viewport: { width, height: 936 } });
      await context.addInitScript(
        ({ session, language }) => {
          localStorage.setItem('session', JSON.stringify(session));
          localStorage.setItem('boat-language', language);
        },
        { session, language },
      );
      page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', (r) =>
        ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      await page.goto('http://localhost:3000/dashboard/crm/segments');
      await page
        .getByText(
          t(
            'لم تحفظ عروضًا بعد. احفظ شروطك لتعود إليها لاحقًا.',
            'No saved views yet. Save your conditions to return to them later.',
          ),
          { exact: true },
        )
        .waitFor();
      await page.getByLabel(t('قيمة الشرط', 'Condition value'), { exact: true }).fill('VIP');
      await page
        .getByRole('button', { name: t('عرض النتائج', 'Show results'), exact: true })
        .click();
      const resultsPanel = page.getByRole('region', {
        name: t('نتائج الشريحة', 'Segment results'),
        exact: true,
      });
      await resultsPanel.getByRole('link', { name: 'Included customer', exact: true }).waitFor();
      assert.equal(
        await resultsPanel.getByRole('link', { name: 'Excluded customer', exact: true }).count(),
        0,
      );
      await page
        .getByLabel(t('اسم العرض', 'View name'), { exact: true })
        .fill('Priority customers');
      await page.getByRole('button', { name: t('حفظ العرض', 'Save view'), exact: true }).click();
      const saved = page.getByRole('region', {
        name: t('العروض المحفوظة', 'Saved views'),
        exact: true,
      });
      await saved.getByRole('heading', { name: 'Priority customers', exact: true }).waitFor();
      await page.reload();
      await saved
        .getByRole('button', {
          name: t('عرض العملاء', 'View customers') + ': Priority customers',
          exact: true,
        })
        .click();
      await resultsPanel
        .getByRole('heading', {
          name: t('النتائج', 'Results') + ': Priority customers',
          exact: true,
        })
        .waitFor();
      await resultsPanel.getByRole('link', { name: 'Included customer', exact: true }).waitFor();
      assert.equal(
        await resultsPanel.getByRole('link', { name: 'Excluded customer', exact: true }).count(),
        0,
      );
      await page.getByLabel(t('قيمة الشرط', 'Condition value'), { exact: true }).fill('Missing');
      await resultsPanel.waitFor({ state: 'hidden' });
      let fail = true;
      await page.route('**/crm/workspace/search', (r) =>
        fail
          ? ((fail = false),
            r.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ message: 'Synthetic retry' }),
            }))
          : r.continue(),
      );
      await page
        .getByRole('button', { name: t('عرض النتائج', 'Show results'), exact: true })
        .click();
      await page.getByRole('alert').filter({ hasText: 'Synthetic retry' }).waitFor();
      await page
        .getByRole('button', { name: t('عرض النتائج', 'Show results'), exact: true })
        .click();
      await resultsPanel
        .getByText(
          t('لا يوجد عملاء مطابقون لهذه الشروط.', 'No customers match these conditions.'),
          { exact: true },
        )
        .waitFor();
      await saved
        .getByRole('button', {
          name: t('عرض العملاء', 'View customers') + ': Priority customers',
          exact: true,
        })
        .click();
      await resultsPanel.getByRole('link', { name: 'Included customer', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${out}/segments-${language}-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      results.push({
        language,
        width,
        status: 'PASS',
        checks: [
          'empty',
          'preview',
          'save',
          'reload',
          'saved-view-result-title',
          'result-invalidation',
          'search-error-retry',
          'no-match',
          'overflow',
        ],
      });
      await context.close();
    }
} catch (e) {
  if (page) {
    await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
    writeFileSync(out + '/failure-dom.html', await page.content().catch(() => ''));
  }
  throw e;
} finally {
  await browser.close();
  writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
}
