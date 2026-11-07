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

const wa = await api(
  '/channels',
  {
    type: 'whatsapp',
    name: 'Isolated WhatsApp QA',
    credentials: {
      accessToken: 'local-disabled-qa-token',
      phoneNumberId: 'local-qa-only',
      wabaId: '111111111',
    },
  },
  token,
);
await api(
  '/channels/' + wa.id + '/templates',
  {
    name: 'template_seed_qa',
    language: 'en',
    category: 'UTILITY',
    body: 'Hello {{1}}',
    examples: ['Sample QA'],
    buttons: [],
  },
  token,
);
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
    const page = await context.newPage(),
      before = await context.newPage();
    page.on('pageerror', (e) => errors.push({ locale, error: e.message }));
    const txt = (ar, en) => (locale === 'ar' ? ar : en);
    for (const width of [1920, 1366, 768, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 936 });
      await before.setViewportSize({ width, height: 936 });
      for (const [section, id, cls] of [
        ['action_buttons', a.id, 'quickActions_'],
        ['message_templates', wa.id, 'templateManager_'],
      ]) {
        await before.goto(
          `http://localhost:3001/dashboard/flows?channelId=${id}&section=${section}`,
        );
        await before.waitForLoadState('networkidle');
        await before.screenshot({
          path: `${out}/before-${locale}-${width}-${section}.png`,
          fullPage: true,
        });
        await page.goto(`http://localhost:3000/dashboard/flows?channelId=${id}&section=${section}`);
        await page.waitForLoadState('networkidle');
        const panel = page.locator('section[class*="' + cls + '"]');
        await panel.waitFor();
        await check(`${locale} ${width} ${section} responsive`, async () => {
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          if (section === 'action_buttons')
            assert.equal(
              await panel.locator('button[class*="actionCard_"],a[class*="actionCard_"]').count(),
              7,
            );
          else assert.ok((await panel.locator('tbody tr').count()) >= 1);
        });
        await page.screenshot({
          path: `${out}/after-${locale}-${width}-${section}.png`,
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1366, height: 936 });
    await page.goto(
      `http://localhost:3000/dashboard/flows?channelId=${a.id}&section=action_buttons`,
    );
    await page.waitForLoadState('networkidle');
    await check(locale + ' action card opens a real draft and returns to manager', async () => {
      const first = page.locator('button[class*="actionCard_"]').first();
      await first.click();
      await page.waitForURL(/\/flows\/[0-9a-f-]+/);
      await page.waitForLoadState('networkidle');
      const id = new URL(page.url()).pathname.split('/').pop();
      const saved = await api('/flows/' + id, null, token);
      assert.equal(saved.is_component, true);
      assert.deepEqual(saved.channel_ids, [a.id]);
      assert.ok(await page.locator('.react-flow').isVisible());
      await page
        .getByRole('link', { name: txt('رجوع لمدير البوت', 'Back to Bot Manager'), exact: true })
        .click();
      await page.waitForURL(/\/dashboard\/flows\?/);
      assert.equal(new URL(page.url()).searchParams.get('channelId'), a.id);
    });
    await page.goto(
      `http://localhost:3000/dashboard/flows?channelId=${a.id}&section=action_buttons`,
    );
    await page.waitForLoadState('networkidle');
    await check(locale + ' advanced settings preserve all seven configuration forms', async () => {
      await page
        .getByRole('button', { name: txt('إعداد الإجراءات', 'Configure Actions'), exact: true })
        .click();
      const d = page.getByRole('dialog');
      await d
        .getByRole('button', { name: txt('حفظ الإجراءات', 'Save Actions'), exact: true })
        .waitFor();
      assert.equal(await d.getByRole('combobox').count(), 7);
      assert.equal(await d.getByRole('checkbox').count(), 7);
      await d
        .getByRole('button', { name: txt('حفظ الإجراءات', 'Save Actions'), exact: true })
        .click();
      await d.getByText(txt('تم حفظ الإجراءات.', 'Actions saved.'), { exact: true }).waitFor();
      await d.getByRole('button', { name: txt('إغلاق', 'Close'), exact: true }).click();
    });
    await page.goto(
      `http://localhost:3000/dashboard/flows?channelId=${wa.id}&section=message_templates`,
    );
    await page.waitForLoadState('networkidle');
    await check(locale + ' template preview and stored variables', async () => {
      await page
        .getByRole('button', { name: txt('عرض', 'View') + ': template_seed_qa', exact: true })
        .click();
      await page.getByRole('dialog').getByText('Hello {{1}}', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: txt('المتغيرات', 'Variables'), exact: true }).click();
      await page.getByRole('cell', { name: 'Sample QA', exact: true }).waitFor();
      await page.screenshot({ path: `${out}/after-${locale}-template-variables.png` });
      await page.getByRole('tab', { name: txt('القوالب', 'Templates'), exact: true }).click();
    });
    await check(locale + ' template create and edit persist without Meta calls', async () => {
      await page.getByRole('button', { name: txt('+ إنشاء', '+ Create'), exact: true }).click();
      const d = page.getByRole('dialog');
      await d
        .getByLabel(txt('معرّف إنجليزي صغير', 'Lowercase identifier'), { exact: true })
        .fill('template_created_' + locale);
      await page.screenshot({ path: `${out}/after-${locale}-template-create-dialog.png` });

      await d
        .getByLabel(/Text: variables use|النص: المتغيرات بالشكل/)
        .fill('Persisted template ' + locale);
      await d.getByRole('button', { name: txt('حفظ المسودة', 'Save draft'), exact: true }).click();
      await d.waitFor({ state: 'hidden' });
      let templates = await api('/channels/' + wa.id + '/templates', null, token);
      const item = templates.find((x) => x.name === 'template_created_' + locale);
      assert.ok(item);
      assert.equal(item.status, 'DRAFT');
      await page
        .getByRole('button', {
          name: txt('تعديل المسودة', 'Edit draft') + ': ' + item.name,
          exact: true,
        })
        .click();
      await d
        .getByLabel(/Text: variables use|النص: المتغيرات بالشكل/)
        .fill('Edited template ' + locale);
      await d.getByRole('button', { name: txt('حفظ المسودة', 'Save draft'), exact: true }).click();
      await d.waitFor({ state: 'hidden' });
      await page.reload();
      await page.waitForLoadState('networkidle');
      templates = await api('/channels/' + wa.id + '/templates', null, token);
      assert.equal(templates.find((x) => x.id === item.id).body, 'Edited template ' + locale);
    });
    await context.close();
  }
} catch (e) {
  errors.push({ fatal: e.stack });
} finally {
  writeFileSync(
    out + '/section-results.json',
    JSON.stringify(
      {
        checks,
        errors,
        scope: 'Only isolated local channels; no external provider sync, submit or delivery',
      },
      null,
      2,
    ),
  );
  await browser.close();
  baseline.kill('SIGTERM');
}
console.log(
  JSON.stringify({ checks: checks.length, failed: checks.filter((x) => !x.pass), errors }, null, 2),
);
if (errors.length || checks.some((x) => !x.pass)) process.exitCode = 1;
