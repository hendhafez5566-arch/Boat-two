// Isolated application acceptance: local Nest/PGlite, synthetic data, no external delivery.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const distribution = (await import(process.env.BOAT_CHROMIUM_MODULE || '@sparticuz/chromium'))
  .default;
const out = 'docs/bot-manager-20261107/evidence';
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [],
  visual = [];
const baseline = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', '3001'],
  { cwd: process.env.BOAT_MANAGER_BASELINE_WEB || '../Boat-two-before/apps/web', stdio: 'ignore' },
);
for (let n = 0; n < 100; n++) {
  try {
    if ((await fetch('http://localhost:3001/login')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
async function api(path, body, token, method = body ? 'POST' : 'GET') {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(r.ok, path + ': ' + JSON.stringify(data));
  return data;
}
const session = await api('/auth/register', {
  email: `manager-${randomUUID()}@example.test`,
  password: `Local-${randomUUID()}`,
  fullName: 'Bot Manager QA Owner',
  workspaceName: 'Manager QA Lab',
});
const token = session.accessToken;
const a = await api('/channels', { type: 'web', name: 'Website QA' }, token),
  b = await api('/channels', { type: 'web', name: 'Second QA Bot' }, token);
await api('/workspace/onboarding/complete', {}, token);
let flow = await api(
  '/flows',
  { name: 'Manager acceptance flow', language: 'en', channelIds: [a.id] },
  token,
);
flow = await api(
  '/flows/' + flow.id,
  {
    graph: {
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          type: 'message',
          position: { x: 100, y: 200 },
          data: { text: 'Hello from isolated Bot Manager QA' },
          edges: { next: 'end' },
        },
        { id: 'end', type: 'end', position: { x: 500, y: 200 }, data: {} },
      ],
      edges: [{ id: 'edge1', source: 'start', target: 'end', sourceHandle: 'next' }],
    },
    expectedUpdatedAt: flow.updated_at,
  },
  token,
  'PATCH',
);
writeFileSync('/tmp/boat-manager-qa-fixture.json', JSON.stringify({ session, a, b, flow }));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BOAT_CHROMIUM_PATH || (await distribution.executablePath()),
  args: distribution.args.filter((a) => a !== '--single-process'),
});
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
  } catch (e) {
    checks.push({ name, pass: false, error: e.message });
    throw e;
  }
}
const sections = [
  'bot_reply',
  'entry_points',
  'action_buttons',
  'webhook_workflows',
  'ai_agent_configuration',
  'ai_agents',
  'chat_widget',
  'product_catalog',
  'settings',
];
try {
  for (const locale of ['en', 'ar']) {
    const context = await browser.newContext();
    await context.addInitScript(
      ({ session, locale }) => {
        localStorage.setItem('session', JSON.stringify(session));
        localStorage.setItem('boat-language', locale);
      },
      { session, locale },
    );
    const page = await context.newPage();
    const beforePage = await context.newPage();
    page.on('pageerror', (e) => errors.push({ locale, error: e.message }));
    const main = page.locator('main[class*="manager_"]');
    for (const width of [1920, 1366, 768, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 936 });
      await beforePage.setViewportSize({ width, height: 936 });
      await beforePage.goto(`http://localhost:3001/dashboard/flows?channelId=${a.id}`);
      await beforePage.waitForLoadState('networkidle');
      await beforePage.screenshot({
        path: `${out}/before-${locale}-${width}-list.png`,
        fullPage: true,
      });
      await page.goto(`http://localhost:3000/dashboard/flows?channelId=${a.id}`);
      await page.waitForLoadState('networkidle');
      await main.waitFor();
      await check(`${locale} ${width} manager layout`, async () => {
        assert.equal(
          await page.locator('html').getAttribute('dir'),
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        assert.equal(await main.locator('tbody tr').count(), 1);
      });
      await page.screenshot({ path: `${out}/after-${locale}-${width}-list.png`, fullPage: true });
      await main
        .getByRole('button', { name: locale === 'ar' ? 'خيارات' : 'Options', exact: true })
        .click();
      await page.getByRole('menu').waitFor();
      await check(`${locale} ${width} options`, async () => {
        assert.equal(await page.getByRole('menuitem').count(), 6);
        const rect = await page.getByRole('menu').boundingBox();
        assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1);
      });
      await page.screenshot({
        path: `${out}/after-${locale}-${width}-options.png`,
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('menu').count(), 0);
      await main
        .getByRole('button', { name: locale === 'ar' ? '+ إنشاء' : '+ Create', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await check(`${locale} ${width} create dialog`, async () => {
        const r = await dialog.boundingBox();
        assert.ok(r.x >= 0 && r.x + r.width <= width + 1);
      });
      await page.screenshot({ path: `${out}/after-${locale}-${width}-create.png` });
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1366, height: 936 });
    await beforePage.setViewportSize({ width: 1366, height: 936 });
    await page.goto(`http://localhost:3000/dashboard/flows?channelId=${a.id}`);
    await page.waitForLoadState('networkidle');
    const text = (ar, en) => (locale === 'ar' ? ar : en);
    const options = async () => {
      await main.getByRole('button', { name: text('خيارات', 'Options'), exact: true }).click();
    };
    await check(`${locale} variables open close`, async () => {
      await options();
      await page
        .getByRole('menuitem', { name: text('المتغيرات المخصصة', 'Custom Variables'), exact: true })
        .click();
      await page.getByRole('dialog').waitFor();
      await page.getByText(text('لا توجد حقول مخصصة بعد.', 'No custom fields yet.')).waitFor();
      await page.screenshot({ path: `${out}/after-${locale}-variables.png` });
      await page.keyboard.press('Escape');
    });
    await check(`${locale} errors real API`, async () => {
      await options();
      await page
        .getByRole('menuitem', { name: text('سجلات أخطاء البوت', 'Bot Error Logs'), exact: true })
        .click();
      await page.getByRole('dialog').getByRole('combobox').selectOption(flow.id);
      await page
        .getByText(text('لا توجد أخطاء مسجلة لهذا التدفق.', 'No recorded errors for this flow.'))
        .waitFor();
      await page.keyboard.press('Escape');
    });
    await check(`${locale} folder create persisted`, async () => {
      await options();
      await page
        .getByRole('menuitem', {
          name: text('إنشاء مجلد للتدفقات', 'Create Campaign Folder'),
          exact: true,
        })
        .click();
      const d = page.getByRole('dialog');
      await d.locator('input[name="name"]').fill('QA Folder ' + locale);
      await d.getByRole('checkbox').check();
      await d
        .getByRole('button', { name: text('إنشاء المجلد', 'Create Folder'), exact: true })
        .click();
      await d.waitFor({ state: 'hidden' });
      assert.equal(
        (await api('/flows', null, token)).find((f) => f.id === flow.id).folder_name,
        'QA Folder ' + locale,
      );
      await page.reload();
      await page.waitForLoadState('networkidle');
      await main
        .getByRole('combobox', { name: text('المجلد', 'Folder'), exact: true })
        .selectOption('QA Folder ' + locale);
      assert.equal(await main.locator('tbody tr').count(), 1);
    });
    await check(`${locale} folder rename persisted`, async () => {
      await options();
      await page
        .getByRole('menuitem', {
          name: text('إدارة قائمة المجلدات', 'Manage Folder List'),
          exact: true,
        })
        .click();
      const d = page.getByRole('dialog');
      await d.locator('input[name="name"]').fill('Renamed ' + locale);
      await d.getByRole('button', { name: text('حفظ', 'Save'), exact: true }).click();
      await page
        .getByText(text('تم حفظ التغييرات.', 'Changes saved.'), { exact: true })
        .first()
        .waitFor();
      assert.equal(
        (await api('/flows', null, token)).find((f) => f.id === flow.id).folder_name,
        'Renamed ' + locale,
      );
      await page.keyboard.press('Escape');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await check(`${locale} copy to other bot persists`, async () => {
      await main
        .getByRole('button', {
          name: new RegExp('^' + text('نسخ إلى بوت آخر', 'Copy to other Bot') + ':'),
        })
        .first()
        .click();
      const d = page.getByRole('dialog');
      await d.getByRole('combobox').selectOption(b.id);
      await d.getByRole('button', { name: text('حفظ', 'Save'), exact: true }).click();
      await d.waitFor({ state: 'hidden' });
      const list = await api('/flows', null, token);
      assert.ok(
        list.some(
          (f) => f.channel_ids.includes(b.id) && f.name.endsWith('(copy)') && f.status === 'draft',
        ),
      );
    });
    await check(`${locale} search empty state`, async () => {
      await main
        .getByRole('searchbox', { name: text('البحث في التدفقات', 'Search flows') })
        .fill('no-such-flow-qa');
      await page
        .getByText(
          text(
            'لا توجد تدفقات مطابقة. أنشئ تدفقًا أو غيّر التصفية.',
            'No matching flows. Create a flow or change the filters.',
          ),
        )
        .waitFor();
      await page.screenshot({ path: `${out}/after-${locale}-empty.png` });
    });
    await page.goto(`http://localhost:3000/dashboard/flows?channelId=${a.id}`);
    await page.waitForLoadState('networkidle');
    for (const section of sections) {
      await page.goto(`http://localhost:3000/dashboard/flows?channelId=${a.id}&section=${section}`);
      await page.waitForLoadState('networkidle');
      await check(`${locale} section ${section}`, async () => {
        assert.ok(await main.isVisible());
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      });
    }
    await check(`${locale} builder return context`, async () => {
      await page.goto(`http://localhost:3000/dashboard/flows/${flow.id}?channelId=${a.id}`);
      await page.waitForLoadState('networkidle');
      assert.ok(await page.locator('.react-flow').isVisible());
      await page.goto(`http://localhost:3000/dashboard/flows?channelId=${a.id}`);
      await page.waitForLoadState('networkidle');
      assert.equal(await main.locator('tbody tr').count(), 1);
    });
    for (const route of [
      '',
      'inbox',
      'crm',
      'crm/sales',
      'channels',
      'automations',
      'team',
      'settings',
      'billing',
    ]) {
      await page.goto('http://localhost:3000/dashboard' + (route ? '/' + route : ''));
      await page.waitForLoadState('networkidle');
      await beforePage.goto('http://localhost:3001/dashboard' + (route ? '/' + route : ''));
      await beforePage.waitForLoadState('networkidle');
      const oldPixels = await beforePage.screenshot({
          path: `${out}/regression-before-${locale}-${route || 'dashboard'}.png`,
        }),
        newPixels = await page.screenshot({
          path: `${out}/regression-after-${locale}-${route || 'dashboard'}.png`,
        });
      visual.push({ locale, route, identical: oldPixels.equals(newPixels) });
      await check(`${locale} regression ${route || 'dashboard'}`, async () => {
        assert.ok(!page.url().includes('/login'));
        assert.ok(await page.locator('body').innerText());
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      });
    }
    await context.close();
  }
} catch (e) {
  errors.push({ fatal: e.stack });
} finally {
  writeFileSync(
    out + '/results.json',
    JSON.stringify(
      {
        engine: 'Next production, full Nest API, PGlite/RLS, isolated synthetic tenant',
        checks,
        visual,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  baseline.kill('SIGTERM');
}
console.log(
  JSON.stringify({ checks: checks.length, failed: checks.filter((c) => !c.pass), errors }, null, 2),
);
if (errors.length || checks.some((c) => !c.pass)) process.exitCode = 1;
