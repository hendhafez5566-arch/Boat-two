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
const out = 'docs/enterprise-20261115/work-editor';
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
          fullName: 'Work QA',
          workspaceName: 'Isolated work acceptance',
        }),
        token = session.accessToken;
      await api('/channels', token, { type: 'web', name: 'Isolated website' });
      await api('/workspace/onboarding/complete', token, {});
      const first = await api('/crm/contacts', token, { name: 'First customer' });
      const second = await api('/crm/contacts', token, { name: 'Second customer' });
      await api('/crm/pipelines', token, {
        name: 'Synthetic pipeline',
        stages: ['New', 'Qualified', 'Won'],
      });
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
      for (const kind of ['tasks', 'deals']) {
        await page.goto(
          'http://localhost:3000/dashboard/crm/' + (kind === 'tasks' ? 'tasks' : 'pipeline'),
        );
        const add = page.getByRole('button', {
          name:
            kind === 'tasks'
              ? t('إضافة متابعة', 'Add follow-up')
              : t('إضافة فرصة', 'Add opportunity'),
          exact: true,
        });
        await add.click();
        const editor = page.getByRole('dialog', {
          name:
            kind === 'tasks'
              ? t('متابعة جديدة', 'New follow-up')
              : t('فرصة جديدة', 'New opportunity'),
          exact: true,
        });
        const select = editor.getByRole('combobox', { name: t('العميل', 'Customer'), exact: true });
        await select.selectOption(first.id);
        const searchResponse = page.waitForResponse(
          (r) => r.url().includes('/crm/contacts?') && r.url().includes('Second') && r.ok(),
        );
        await editor
          .getByLabel(t('ابحث عن العميل', 'Find customer'), { exact: true })
          .fill('Second customer');
        await searchResponse;
        await editor
          .getByRole('status')
          .filter({ hasText: t('جارٍ البحث عن العملاء…', 'Searching customers…') })
          .waitFor({ state: 'hidden' });
        await select
          .locator('option', { hasText: 'Second customer' })
          .waitFor({ state: 'attached' });
        assert.equal(
          await select.inputValue(),
          first.id,
          'Search must never silently switch customers',
        );
        await editor.getByLabel(t('العنوان', 'Title'), { exact: true }).fill('Synthetic ' + kind);
        if (kind === 'deals')
          await editor.getByLabel(t('القيمة', 'Value'), { exact: true }).fill('150.29');
        await editor.getByRole('button', { name: 'Close / إغلاق', exact: true }).click();
        const discard = page.getByRole('dialog', {
          name: t('تجاهل التغييرات؟', 'Discard changes?'),
          exact: true,
        });
        await discard
          .getByRole('button', { name: t('متابعة التعديل', 'Keep editing'), exact: true })
          .click();
        const save = editor.getByRole('button', {
          name:
            kind === 'tasks'
              ? t('حفظ المتابعة', 'Save follow-up')
              : t('حفظ الفرصة', 'Save opportunity'),
          exact: true,
        });
        let fail = true;
        await page.route('**/crm/' + kind, (r) =>
          r.request().method() === 'POST' && fail
            ? ((fail = false),
              r.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Synthetic retry' }),
              }))
            : r.continue(),
        );
        await save.click();
        await editor.getByRole('alert').waitFor();
        assert.equal(await select.inputValue(), first.id);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({ path: `${out}/${kind}-${language}-${width}.png`, fullPage: true });
        await save.click();
        await editor.waitFor({ state: 'hidden' });
        const saved = (await api('/crm/' + kind + '?q=Synthetic', token)).items[0];
        assert.equal(saved.contact_id, first.id);
        assert.notEqual(saved.contact_id, second.id);
        if (kind === 'deals') assert.equal(String(saved.value_cents), '15029');
        await page.reload();
        await page.getByRole('button', { name: 'Synthetic ' + kind, exact: true }).click();
        const edit = page.getByRole('dialog', { name: t('تعديل', 'Edit'), exact: true });
        await edit.getByLabel(t('العنوان', 'Title'), { exact: true }).fill('Reopened ' + kind);
        await edit
          .getByRole('button', {
            name:
              kind === 'tasks'
                ? t('حفظ المتابعة', 'Save follow-up')
                : t('حفظ الفرصة', 'Save opportunity'),
            exact: true,
          })
          .click();
        await edit.waitFor({ state: 'hidden' });
        assert.equal(
          (await api('/crm/' + kind + '?q=Reopened', token)).items[0].contact_id,
          first.id,
        );
      }
      assert.deepEqual(errors, []);
      results.push({
        language,
        width,
        status: 'PASS',
        journeys: ['task', 'opportunity'],
        checks: [
          'selection-after-search',
          'dirty-close',
          'failed-save-retry',
          'save',
          'reload',
          'edit',
          'exact-cents',
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
