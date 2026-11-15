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
const out = 'docs/enterprise-20261115/contact-editor';
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
        fullName: 'Contact QA',
        workspaceName: 'Isolated contact acceptance',
      });
      const token = session.accessToken;
      await api('/channels', token, { type: 'web', name: 'Isolated website' });
      await api('/workspace/onboarding/complete', token, {});
      for (const field of [
        { key: 'budget', label: 'Budget', type: 'number' },
        { key: 'approved', label: 'Approved', type: 'boolean' },
      ])
        await api('/crm/fields', token, field);
      // Enough synthetic rows to exercise pagination rather than only an empty list.
      for (let i = 0; i < 12; i++)
        await api('/crm/contacts', token, { name: 'Fixture ' + i, tags: ['seed'], attributes: {} });
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
      await page.goto('http://localhost:3000/dashboard/crm');
      await page
        .getByRole('button', { name: t('إضافة عميل', 'Add customer'), exact: true })
        .click();
      const editor = page.getByRole('dialog', {
        name: t('إضافة عميل', 'Add contact'),
        exact: true,
      });
      const name = 'QA ' + language + ' ' + width;
      await editor.getByLabel(t('اسم العميل', 'Customer name'), { exact: true }).fill(name);
      await editor.getByRole('button', { name: 'Close / إغلاق', exact: true }).click();
      const discard = page.getByRole('dialog', {
        name: t('تجاهل التغييرات؟', 'Discard changes?'),
        exact: true,
      });
      await discard
        .getByRole('button', { name: t('متابعة التعديل', 'Keep editing'), exact: true })
        .click();
      assert.equal(
        await editor.getByLabel(t('اسم العميل', 'Customer name'), { exact: true }).inputValue(),
        name,
      );
      await editor.getByLabel('Budget', { exact: true }).fill('0');
      await editor.getByLabel('Approved', { exact: true }).selectOption('false');
      await editor.getByLabel(t('الوسوم', 'Labels'), { exact: true }).fill('First، Second');
      await editor.getByRole('button', { name: t('إضافة وسم', 'Add label'), exact: true }).click();
      await editor
        .getByRole('button', { name: t('إزالة الوسم', 'Remove label') + ' First', exact: true })
        .click();
      await editor.getByLabel(t('الوسوم', 'Labels'), { exact: true }).fill('Pending');
      await editor
        .getByText(t('بيانات إضافية متقدمة', 'Advanced additional attributes'), { exact: true })
        .click();
      const raw = editor.getByLabel(t('البيانات الإضافية JSON', 'Additional attributes JSON'), {
        exact: true,
      });
      await raw.fill('{invalid');
      await editor
        .getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true })
        .click();
      await editor.getByRole('alert').waitFor();
      await raw.fill('{"budget":0,"approved":false,"kept":"hidden"}');
      let fail = true;
      await page.route('**/crm/contacts', (r) =>
        r.request().method() === 'POST' && fail
          ? ((fail = false),
            r.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ message: 'Synthetic unavailable. Retry.' }),
            }))
          : r.continue(),
      );
      await editor
        .getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true })
        .click();
      await editor.getByRole('alert').filter({ hasText: 'Synthetic unavailable' }).waitFor();
      assert.equal(
        await editor.getByLabel(t('اسم العميل', 'Customer name'), { exact: true }).inputValue(),
        name,
      );
      await page.screenshot({ path: `${out}/editor-${language}-${width}.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await editor
        .getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true })
        .click();
      await editor.waitFor({ state: 'hidden' });
      const saved = (await api('/crm/contacts?q=' + encodeURIComponent(name), token)).items[0];
      assert.deepEqual(saved.tags, ['Second', 'Pending']);
      assert.equal(saved.attributes.budget, 0);
      assert.equal(saved.attributes.approved, false);
      await page.reload();
      await page.getByRole('button', { name: t('تعديل: ', 'Edit: ') + name, exact: true }).click();
      const edit = page.getByRole('dialog', {
        name: t('تعديل العميل', 'Edit contact'),
        exact: true,
      });
      assert.equal(await edit.getByLabel('Budget', { exact: true }).inputValue(), '0');
      assert.equal(await edit.getByLabel('Approved', { exact: true }).inputValue(), 'false');
      await edit
        .getByLabel(t('اسم العميل', 'Customer name'), { exact: true })
        .fill(name + ' edited');
      await edit
        .getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true })
        .click();
      await edit.waitFor({ state: 'hidden' });
      assert.equal((await api('/crm/contacts/' + saved.id, token)).name, name + ' edited');
      await page
        .getByRole('button', { name: t('تعديل: ', 'Edit: ') + name + ' edited', exact: true })
        .click();
      await edit.getByLabel(t('اسم العميل', 'Customer name'), { exact: true }).fill('Stale draft');
      const latest = await api('/crm/contacts/' + saved.id, token);
      await api(
        '/crm/contacts/' + saved.id + '/profile',
        token,
        { name: 'Newer teammate edit', expectedUpdatedAt: latest.updated_at },
        'PATCH',
      );
      await edit
        .getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true })
        .click();
      await edit.getByRole('alert').waitFor();
      assert.equal((await api('/crm/contacts/' + saved.id, token)).name, 'Newer teammate edit');
      await edit.getByRole('button', { name: t('إلغاء', 'Cancel'), exact: true }).click();
      await discard
        .getByRole('button', { name: t('تجاهل التغييرات', 'Discard changes'), exact: true })
        .click();
      assert.deepEqual(errors, []);
      results.push({
        language,
        width,
        status: 'PASS',
        checks: [
          'create',
          'labels',
          'typed-fields',
          'validation',
          'failed-save-retry',
          'reload',
          'edit',
          'concurrent-edit-conflict',
          'dirty-close',
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
