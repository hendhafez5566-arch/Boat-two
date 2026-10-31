/* eslint-disable */
// Real Chromium -> production Next UI -> real Nest controller -> isolated PostgreSQL (PGlite).
const { createRequire } = require('node:module'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const runtime = createRequire(
  (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.env.BOAT_PLAYWRIGHT_MODULES) +
    '/playwright/package.json',
);
const { chromium } = runtime('playwright');
const root = 'http://localhost:3000',
  api = 'http://127.0.0.1:4000',
  out = process.env.BOAT_ACCEPTANCE_OUT || 'docs/acceptance/2026-10-30-smart-data';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const tokens = await (await fetch(api + '/fixture/tokens')).json();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BOAT_CHROMIUM_PATH ? { executablePath: process.env.BOAT_CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) return route.abort();
    return route.continue();
  });
  await page.addInitScript((token) => {
    localStorage.setItem(
      'session',
      JSON.stringify({ accessToken: token, refreshToken: 'fixture-only' }),
    );
    if (!localStorage.getItem('boat-language')) localStorage.setItem('boat-language', 'ar');
  }, tokens.owner);
  try {
    await page.goto(root + '/dashboard/commerce');
    await page.getByRole('button', { name: 'مصادر البيانات', exact: true }).click();
    await page.getByLabel('اسم المصدر', { exact: true }).fill('برامج العمرة التجريبية');
    const csv =
      'key,name,category,visible,triple,children\nu1,عمرة اقتصادية,سياحة/عمرة,true,12500 جنيه,طفل بدون سرير 3000 جنيه\nu2,عمرة مميزة,سياحة/عمرة,true,18000 جنيه,\n';
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'tourism.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('combobox', { name: /^المعرف الثابت/ }).selectOption('key');
    await page.getByRole('combobox', { name: /^الاسم/ }).selectOption('name');
    await page.getByRole('combobox', { name: /^القسم \(استخدم/ }).selectOption('category');
    await page.getByRole('combobox', { name: /^ظاهر أو مخفي/ }).selectOption('visible');
    await page.getByRole('checkbox', { name: 'triple', exact: true }).check();
    await page
      .getByRole('textbox', { name: 'اسم العرض لـ triple', exact: true })
      .fill('سعر الفرد ثلاثي');
    await page
      .getByRole('combobox', { name: 'نوع الحقل triple', exact: true })
      .selectOption('price');
    await page.getByRole('checkbox', { name: 'children', exact: true }).check();
    await page
      .getByRole('textbox', { name: 'اسم العرض لـ children', exact: true })
      .fill('أطفال حسب السياسة الخاصة');
    await page.getByText('إعدادات متقدمة للمساعد', { exact: true }).click();
    await page.getByRole('checkbox', { name: /اعتماد الكتالوج لردود المساعد/ }).check();
    await page.screenshot({ path: out + '/01-mapping-ar-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'حفظ الربط والإعدادات', exact: true }).click();
    const sync = page.getByRole('button', { name: 'مزامنة الآن ومعاينة التحديث', exact: true });
    await sync.waitFor();
    await sync.click();
    await page.getByRole('button', { name: 'تطبيق التحديث المعروض', exact: true }).waitFor();
    await page.screenshot({ path: out + '/02-preview-ar-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'تطبيق التحديث المعروض', exact: true }).click();
    await page
      .getByRole('button', { name: 'تطبيق التحديث المعروض', exact: true })
      .waitFor({ state: 'hidden' });
    await page.getByText('سعر الفرد ثلاثي: 12500 جنيه', { exact: true }).waitFor();
    // New content and hidden item, same source and same node configuration.
    await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
    await page.locator('input[type=file]').setInputFiles({
      name: 'tourism-new.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        csv
          .replace('12500', '13500')
          .replace('u2,عمرة مميزة,سياحة/عمرة,true', 'u2,عمرة مميزة,سياحة/عمرة,false') +
          'u3,عمرة جديدة,سياحة/عمرة,true,17000 جنيه,\n',
      ),
    });
    await sync.click();
    await page.getByRole('checkbox', { name: 'راجعت العناصر المخفية في هذا التحديث', exact: true }).check();
    await page.getByRole('button', { name: 'تطبيق التحديث المعروض', exact: true }).click();
    await page
      .getByRole('button', { name: 'تطبيق التحديث المعروض', exact: true })
      .waitFor({ state: 'hidden' });
    await page.getByText('سعر الفرد ثلاثي: 13500 جنيه', { exact: true }).waitFor();
    assert.equal(await page.locator('article').filter({ hasText: 'عمرة مميزة' }).count(), 0);
    await page.screenshot({ path: out + '/03-customer-catalog-ar-desktop.png', fullPage: true });
    const get = async (path, token = tokens.owner) =>
      fetch(api + path, { headers: { Authorization: 'Bearer ' + token } });
    const sources = await (await get('/commerce/sources')).json();
    assert.equal(sources.length, 1);
    assert.equal((await get('/commerce/sources', tokens.agent)).status, 403);
    assert.equal((await get('/commerce/sources')).status, 200);
    assert.deepEqual(await (await get('/commerce/sources', tokens.other)).json(), []);
    assert.equal((await fetch(api + '/commerce/sources')).status, 401);
    const items = await (await get('/commerce/sources/' + sources[0].id + '/items')).json();
    assert.equal(items.total, 2);
    // Switching source must not carry a prior business's search or pagination into the new form.
    await page.getByRole('textbox', { name: 'بحث', exact: true }).fill('عمرة جديدة');
    await page.getByRole('button', { name: 'عرض', exact: true }).click();
    await page.locator('article').filter({ hasText: 'عمرة اقتصادية' }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'إضافة مصدر', exact: true }).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'اسم المصدر', exact: true }).inputValue(),
      '',
    );
    await page.getByRole('combobox', { name: 'المصدر', exact: true }).selectOption(sources[0].id);
    assert.equal(await page.getByRole('textbox', { name: 'بحث', exact: true }).inputValue(), '');
    await page.getByRole('button', { name: 'معاينة ما يراه العميل والسجل', exact: true }).click();
    await page.getByText('سعر الفرد ثلاثي: 13500 جنيه', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: out + '/04-catalog-ar-mobile.png', fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.evaluate(() => localStorage.setItem('boat-language', 'en'));
    await page.reload();
    await page.getByRole('button', { name: 'Data sources', exact: true }).click();
    await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption(sources[0].id);
    await page
      .getByRole('button', { name: 'Preview customer catalog and history', exact: true })
      .click();
    await page.getByText('سعر الفرد ثلاثي: 13500 جنيه', { exact: true }).waitFor();
    await page.screenshot({ path: out + '/05-catalog-en-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: out + '/06-catalog-en-desktop.png', fullPage: true });
    // Exercise real flow save/publish/restore and the existing simulator against the same DB source.
    const call = async (path, body, method = 'POST') => {
      const r = await fetch(api + path, {
        method,
        headers: { Authorization: 'Bearer ' + tokens.owner, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      assert.equal(r.ok, true, JSON.stringify(v));
      return v;
    };
    const flow = await call('/flows', { name: 'Dynamic catalog acceptance', language: 'en' });
    const graph = {
      startNodeId: 'catalog',
      nodes: [
        {
          id: 'catalog',
          type: 'catalog',
          position: { x: 0, y: 0 },
          data: {
            sourceId: sources[0].id,
            category: 'سياحة/عمرة',
            text: 'Choose a program',
            fields: ['سعر الفرد ثلاثي'],
            selectable: true,
          },
          edges: { next: 'staff' },
        },
        {
          id: 'staff',
          type: 'handoff',
          position: { x: 550, y: 0 },
          data: { message: 'Staff will help you' },
          edges: {},
        },
      ],
    };
    await call('/flows/' + flow.id, { graph }, 'PATCH');
    const published = await call('/flows/' + flow.id + '/publish', {});
    assert.equal(published.published, true);
    let test = await call('/flows/' + flow.id + '/test', { text: 'hello' });
    assert.equal(test.status, 'waiting');
    const buttons = test.transcript.find((t) => t.role === 'bot').content.list.sections[0].rows;
    assert.equal(buttons.length, 2);
    assert.ok(!buttons.some((b) => b.title === 'عمرة مميزة'));
    test = await call('/flows/' + flow.id + '/test', {
      text: buttons[0].title,
      replyId: buttons[0].id,
      state: test.state,
      contactAttributes: test.contactAttributes,
    });
    assert.ok(test.contactAttributes.catalogSelection);
    assert.ok(test.transcript.some((t) => String(t.content.text || t.content).includes('13500')));
    assert.ok(test.transcript.some((t) => String(t.content).includes('Handed off')));
    const versions = await (await get('/flows/' + flow.id + '/versions')).json();
    await call('/flows/' + flow.id + '/versions/' + versions[0].id + '/restore', {});
    const restored = await (await get('/flows/' + flow.id)).json();
    assert.equal(restored.draft_graph.nodes[0].data.sourceId, sources[0].id);
    await page.goto(root + '/dashboard/flows/' + flow.id);
    await page.locator('.react-flow__node').first().waitFor();
    await page.locator('.react-flow__node[data-id="catalog"]').click();
    await page.getByRole('button', { name: 'Edit step', exact: true }).click();
    await page.getByRole('combobox', { name: /^Catalog content/ }).waitFor();
    await page.screenshot({ path: out + '/07-dynamic-builder-en-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('button', { name: 'Start preview', exact: true }).click();
    await page.getByText('Choose a program', { exact: true }).last().waitFor();
    await page.getByRole('button', { name: 'عرض / Browse', exact: true }).click();
    await page.getByRole('button', { name: /عمرة اقتصادية/ }).click();
    await page
      .getByText(/سعر الفرد ثلاثي: 13500 جنيه/)
      .last()
      .waitFor();
    await page.screenshot({ path: out + '/08-dynamic-simulator-en-desktop.png', fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      out + '/browser-results.json',
      JSON.stringify(
        {
          passed: true,
          screenshots: 8,
          checks: [
            'Arabic desktop upload/map/preview/apply',
            'update price/add/hide without changing source',
            'owner/agent/anonymous/two-tenant API roles',
            'Arabic mobile no overflow',
            'English mobile LTR no overflow',
            'English desktop',
            'real flow save/publish/version restore',
            'real simulator selection and handoff',
            'zero page errors',
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log('PASS smart-data UI/API acceptance; 8 real Chromium screenshots');
  } catch (e) {
    await page.screenshot({ path: out + '/failure.png', fullPage: true });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
