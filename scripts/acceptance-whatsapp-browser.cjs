/* eslint-disable */
// Local-only Chromium -> production Next UI -> Nest Flow controller -> isolated PGlite.
// No Meta account, production database, external delivery, or paid AI.
const { createRequire } = require('node:module'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const runtime = createRequire(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/package.json',
);
const { chromium } = runtime('playwright');
(async () => {
  const out = process.env.BOAT_ACCEPTANCE_OUT || 'docs/acceptance/2026-10-31-whatsapp/local';
  fs.mkdirSync(out, { recursive: true });
  const tokens = await (await fetch('http://127.0.0.1:4000/fixture/tokens')).json();
  const call = async (path, body, method = 'POST') => {
    const res = await fetch('http://127.0.0.1:4000' + path, {
      method,
      headers: { Authorization: 'Bearer ' + tokens.owner, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    assert.ok(res.ok, JSON.stringify(data));
    return data;
  };
  const node = (id, type, data, edges, y) => ({ id, type, data, edges, position: { x: 100, y } });
  const graph = {
    startNodeId: 'welcome',
    nodes: [
      node('welcome', 'message', { text: 'أهلًا بك في اختبار واتساب' }, { next: 'name' }, 0),
      node(
        'name',
        'question',
        { text: 'ما اسمك؟', answerType: 'text', saveAs: 'customer_name', retries: 2 },
        { ok: 'save_name', fail: 'staff' },
        200,
      ),
      node(
        'save_name',
        'set_attribute',
        { key: 'customer_name', value: '{{customer_name}}' },
        { next: 'email' },
        400,
      ),
      node(
        'email',
        'question',
        { text: 'ما بريدك الإلكتروني؟', answerType: 'email', saveAs: 'customer_email', retries: 2 },
        { ok: 'save_email', fail: 'staff' },
        600,
      ),
      node(
        'save_email',
        'set_attribute',
        { key: 'customer_email', value: '{{customer_email}}' },
        { next: 'staff' },
        800,
      ),
      node(
        'after',
        'message',
        { text: 'شكرًا {{customer_name}}، نكمل الاختبار' },
        { next: 'buttons' },
        1000,
      ),
      node(
        'buttons',
        'message',
        {
          text: 'اختر الخدمة',
          buttons: [
            { id: 'services', title: 'الخدمات' },
            { id: 'agent', title: 'موظف' },
          ],
        },
        { 'option:services': 'list', 'option:agent': 'staff', fallback: 'staff' },
        1200,
      ),
      node(
        'list',
        'message',
        {
          text: 'اختر القسم',
          list: {
            buttonText: 'الأقسام',
            sections: [
              {
                title: 'اختبار',
                rows: [
                  { id: 'tourism', title: 'السياحة' },
                  { id: 'restaurant', title: 'المطعم' },
                ],
              },
            ],
          },
        },
        { 'option:tourism': 'choice', 'option:restaurant': 'choice', fallback: 'staff' },
        1400,
      ),
      node(
        'choice',
        'message',
        { text: 'تم تسجيل اختيارك، الخطوة التالية التحويل لموظف' },
        { next: 'staff' },
        1600,
      ),
      node('staff', 'handoff', { message: 'سيتابع معك موظف الاختبار الآن' }, {}, 1800),
    ],
  };
  const flow = await call('/flows', {
    name: 'WhatsApp multi-step isolated acceptance',
    language: 'ar',
  });
  await call('/flows/' + flow.id, { graph }, 'PATCH');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BOAT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript((token) => {
    localStorage.setItem(
      'session',
      JSON.stringify({ accessToken: token, refreshToken: 'fixture-only' }),
    );
    localStorage.setItem('boat-language', 'ar');
  }, tokens.owner);
  try {
    await page.goto('http://localhost:3000/dashboard/flows/' + flow.id);
    await page.locator('.react-flow__node[data-id="save_email"]').click();
    await page.getByRole('button', { name: 'تعديل الخطوة', exact: true }).click();
    await page.getByRole('button', { name: 'الخطوات التالية', exact: true }).click();
    const next = page.getByRole('combobox', { name: 'الخطوة التالية — التالي', exact: true });
    assert.equal(await next.inputValue(), 'staff');
    await next.selectOption('after');
    await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
    await page.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /محفوظ/ }).waitFor();
    const saved = await call('/flows/' + flow.id, null, 'GET');
    assert.equal(saved.draft_graph.nodes.find((n) => n.id === 'save_email').edges.next, 'after');
    await page.screenshot({ path: out + '/01-next-step-repair-ar.jpg' });
    await page.getByRole('button', { name: 'تجربة البوت', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'تجربة البوت', exact: true });
    await dialog.getByRole('button', { name: 'ابدأ التجربة', exact: true }).click();
    await dialog.getByText('ما اسمك؟', { exact: true }).waitFor();
    await dialog.getByRole('textbox', { name: 'رد العميل', exact: true }).fill('عميل اختبار');
    await dialog.getByRole('button', { name: 'إرسال', exact: true }).click();
    await dialog.getByText('ما بريدك الإلكتروني؟', { exact: true }).waitFor();
    await dialog
      .getByRole('textbox', { name: 'رد العميل', exact: true })
      .fill('qa@example.invalid');
    await dialog.getByRole('button', { name: 'إرسال', exact: true }).click();
    await dialog.getByRole('button', { name: 'الخدمات', exact: true }).click();
    await dialog.getByRole('button', { name: 'الأقسام', exact: true }).click();
    await dialog.getByRole('button', { name: /السياحة/ }).click();
    await dialog.getByText('سيتابع معك موظف الاختبار الآن', { exact: true }).waitFor();
    assert.ok((await dialog.innerText()).includes('شكرًا عميل اختبار'));
    await page.screenshot({ path: out + '/02-multistep-simulator-ar.jpg' });
    const result = await call('/flows/' + flow.id + '/test', { text: 'hello' });
    assert.equal(result.status, 'waiting');
    let resumed = await call('/flows/' + flow.id + '/test', {
      text: 'QA',
      state: result.state,
      contactAttributes: result.contactAttributes,
    });
    resumed = await call('/flows/' + flow.id + '/test', {
      text: 'qa@example.invalid',
      state: resumed.state,
      contactAttributes: resumed.contactAttributes,
    });
    assert.equal(resumed.contactAttributes.customer_name, 'QA');
    assert.equal(resumed.contactAttributes.customer_email, 'qa@example.invalid');
    const published = await call('/flows/' + flow.id + '/publish', {});
    assert.equal(published.published, true);
    const versions = await call('/flows/' + flow.id + '/versions', null, 'GET');
    assert.equal(versions.length, 1);
    await page.reload();
    await page.locator('.react-flow__node[data-id="after"]').waitFor();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      out + '/results.json',
      JSON.stringify(
        {
          passed: true,
          checks: 8,
          screenshots: 2,
          pageErrors: errors,
          externalDeliveryTested: false,
          checksPassed: [
            'Repair early handoff through Arabic UI',
            'Save same graph and reload',
            'Welcome/name/email',
            'Buttons/list branching',
            'More than three replies',
            'Final human handoff',
            'Captured attributes in simulator',
            'Publish/version retrieval',
          ],
        },
        null,
        2,
      ),
    );
    console.log('PASS 8 local full-stack WhatsApp flow checks; external delivery NOT tested');
  } catch (e) {
    await page.screenshot({ path: out + '/failure.jpg' });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
