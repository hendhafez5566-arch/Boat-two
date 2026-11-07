import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const distribution = (await import(process.env.BOAT_CHROMIUM_MODULE || '@sparticuz/chromium'))
  .default;
const out = 'docs/bot-manager-20261107/evidence';
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
async function api(path, body, token, method = body ? 'POST' : 'GET', status = 200) {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(r.status === status || (status === 200 && r.ok), path + ': ' + JSON.stringify(data));
  return data;
}
const session = await api('/auth/register', {
    email: `actions-${randomUUID()}@example.test`,
    password: `Local-${randomUUID()}`,
    fullName: 'Actions QA Owner',
    workspaceName: 'Actions QA Lab',
  }),
  token = session.accessToken;
const channel = await api('/channels', { type: 'web', name: 'Local QA Webchat' }, token),
  second = await api('/channels', { type: 'web', name: 'Local Second QA Bot' }, token);
await api('/workspace/onboarding/complete', {}, token);
const base = await api(
  '/flows',
  { name: 'Actions source flow', language: 'en', channelIds: [channel.id] },
  token,
);
await api(
  '/flows/' + base.id,
  {
    graph: {
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          type: 'message',
          position: { x: 100, y: 200 },
          data: { text: 'QA' },
          edges: { next: 'end' },
        },
        { id: 'end', type: 'end', position: { x: 500, y: 200 }, data: {} },
      ],
      edges: [{ id: 'edge1', source: 'start', target: 'end', sourceHandle: 'next' }],
    },
    expectedUpdatedAt: base.updated_at,
  },
  token,
  'PATCH',
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BOAT_CHROMIUM_PATH,
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
const context = await browser.newContext({ viewport: { width: 1366, height: 936 } });
await context.addInitScript((session) => {
  localStorage.setItem('session', JSON.stringify(session));
  localStorage.setItem('boat-language', 'en');
}, session);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const manager = page.locator('main[class*="manager_"]');
const home = async () => {
  await page.goto(`http://localhost:3000/dashboard/flows?channelId=${channel.id}`);
  await page.waitForLoadState('networkidle');
};
const options = async () => {
  await manager.getByRole('button', { name: 'Options', exact: true }).click();
};
try {
  await home();
  await check('Options arrow navigation, Home End Escape and focus return', async () => {
    await options();
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      'Reset Action Buttons',
    );
    await page.keyboard.press('End');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      'Manage Folder List',
    );
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      'Custom Variables',
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Options');
  });
  await check('Create flow UI opens builder and saved record survives reload', async () => {
    await manager.getByRole('button', { name: '+ Create', exact: true }).click();
    const d = page.getByRole('dialog');
    await d.locator('input[name="name"]').fill('Created through Bot Manager');
    await d.getByRole('button', { name: 'Open Builder', exact: true }).click();
    await page.waitForURL(/\/flows\/[0-9a-f-]+/);
    await page.waitForLoadState('networkidle');
    assert.ok(await page.locator('.react-flow').isVisible());
    const id = new URL(page.url()).pathname.split('/').pop();
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal((await api('/flows/' + id, null, token)).name, 'Created through Bot Manager');
  });
  await home();
  await check('Duplicate creates a real persisted draft', async () => {
    const old = (await api('/flows', null, token)).length;
    await manager
      .getByRole('button', { name: 'Duplicate: Actions source flow', exact: true })
      .click();
    await page.getByRole('status').filter({ hasText: 'Changes saved.' }).waitFor();
    const list = await api('/flows', null, token);
    assert.equal(list.length, old + 1);
    assert.ok(list.some((f) => f.name === 'Actions source flow (copy)' && f.status === 'draft'));
  });
  await check('Export downloads actual graph', async () => {
    const download = page.waitForEvent('download');
    await manager.getByRole('button', { name: 'Export: Actions source flow', exact: true }).click();
    const file = await download;
    const path = await file.path();
    const { readFileSync } = await import('node:fs');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(data.format, 'boat-two-flow');
    assert.equal(data.graph.startNodeId, 'start');
    writeFileSync(
      '/tmp/manager-flow-transfer.json',
      JSON.stringify({ ...data, name: 'Imported into selected Bot' }),
    );
  });
  await check('Import invalid JSON reports an error without success', async () => {
    await options();
    await page.getByRole('menuitem', { name: 'Flow Import', exact: true }).click();
    writeFileSync('/tmp/manager-invalid.json', 'not json');
    await page
      .getByRole('dialog')
      .locator('input[type=file]')
      .setInputFiles('/tmp/manager-invalid.json');
    await page
      .getByRole('dialog')
      .getByRole('alert')
      .filter({ hasText: 'Invalid JSON file.' })
      .waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  });
  await check('Import keeps selected channel and opens persisted draft', async () => {
    await options();
    await page.getByRole('menuitem', { name: 'Flow Import', exact: true }).click();
    await page
      .getByRole('dialog')
      .locator('input[type=file]')
      .setInputFiles('/tmp/manager-flow-transfer.json');
    await page.waitForURL(/\/flows\/[0-9a-f-]+/);
    const id = new URL(page.url()).pathname.split('/').pop();
    await page.waitForLoadState('networkidle');
    const saved = await api('/flows/' + id, null, token);
    assert.deepEqual(saved.channel_ids, [channel.id]);
    assert.equal(new URL(page.url()).searchParams.get('channelId'), channel.id);
    assert.equal(saved.status, 'draft');
  });
  await home();
  await check('Move folder save, reload, then unfiled save', async () => {
    await manager
      .getByRole('button', { name: 'Move to Folder: Actions source flow', exact: true })
      .click();
    const d = page.getByRole('dialog');
    await d.locator('input[name=folder]').fill('Move QA');
    await d.getByRole('button', { name: 'Save', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(
      (await api('/flows', null, token)).find((f) => f.id === base.id).folder_name,
      'Move QA',
    );
    await manager
      .getByRole('button', { name: 'Move to Folder: Actions source flow', exact: true })
      .click();
    await d.locator('input[name=folder]').fill('');
    await d.getByRole('button', { name: 'Save', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    assert.equal(
      (await api('/flows', null, token)).find((f) => f.id === base.id).folder_name,
      null,
    );
  });
  await check('Reset draft actions calls server and keeps draft', async () => {
    await options();
    await page.getByRole('menuitem', { name: 'Reset Action Buttons', exact: true }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('combobox').selectOption(base.id);
    await d.getByRole('button', { name: 'Confirm reset', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    assert.equal((await api('/flows/' + base.id, null, token)).status, 'draft');
  });
  await check('Delete cancel retains record; confirm removes synthetic copy', async () => {
    const copy = (await api('/flows', null, token)).find(
      (f) => f.name === 'Actions source flow (copy)',
    );
    await manager.getByRole('button', { name: 'Delete: ' + copy.name, exact: true }).click();
    let d = page.getByRole('dialog');
    await d
      .getByText('This flow will be permanently deleted. This cannot be undone.', { exact: false })
      .waitFor();
    await d.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.ok((await api('/flows', null, token)).some((f) => f.id === copy.id));
    await manager.getByRole('button', { name: 'Delete: ' + copy.name, exact: true }).click();
    await d.getByRole('button', { name: 'Delete', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    assert.ok(!(await api('/flows', null, token)).some((f) => f.id === copy.id));
  });
  await check('Revision conflict rejects stale update', async () => {
    const current = await api('/flows/' + base.id, null, token);
    await api(
      '/flows/' + base.id,
      { name: 'Concurrency QA', expectedUpdatedAt: current.updated_at },
      token,
      'PATCH',
    );
    await api(
      '/flows/' + base.id,
      { name: 'Must not overwrite', expectedUpdatedAt: current.updated_at },
      token,
      'PATCH',
      409,
    );
    assert.equal((await api('/flows/' + base.id, null, token)).name, 'Concurrency QA');
  });
  await home();
  await check('Loading state visible during delayed data response', async () => {
    await page.route('**/flows', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await manager.getByText('Loading flows…', { exact: true }).waitFor();
    await page.screenshot({ path: out + '/after-en-loading.png' });
    await manager.getByRole('button', { name: 'Duplicate: Concurrency QA', exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    await page.unroute('**/flows');
    await page.waitForLoadState('networkidle');
  });
  await check('Network failure reports real error and refresh recovers', async () => {
    await page.route('**/flows', (route) => route.abort());
    await page.reload();
    await manager.getByRole('alert').waitFor();
    await page.screenshot({ path: out + '/after-en-error.png' });
    await page.unroute('**/flows');
    await manager.getByRole('button', { name: 'Refresh flows', exact: true }).click();
    await manager.getByRole('button', { name: 'Duplicate: Concurrency QA', exact: true }).waitFor();
  });
  await check(
    'Failed cross-bot assignment retains one draft and prevents accidental retry',
    async () => {
      const count = (await api('/flows', null, token)).length;
      await page.route('**/flows/*', (route) =>
        route.request().method() === 'PATCH' ? route.abort() : route.continue(),
      );
      await manager
        .getByRole('button', { name: 'Copy to other Bot: Concurrency QA', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox').selectOption(second.id);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await manager.getByRole('alert').filter({ hasText: 'A draft copy was created' }).waitFor();
      await page.unroute('**/flows/*');
      assert.equal((await api('/flows', null, token)).length, count + 1);
    },
  );
  await check('Plan limit error explains recovery without changing billing', async () => {
    const count = (await api('/flows', null, token)).length;
    await page.route('**/flows', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'PLAN_LIMIT' }),
          })
        : route.continue(),
    );
    await manager.getByRole('button', { name: '+ Create', exact: true }).click();
    const d = page.getByRole('dialog');
    await d.locator('input[name="name"]').fill('Quota test');
    await d.getByRole('button', { name: 'Open Builder', exact: true }).click();
    await d
      .getByRole('alert')
      .filter({ hasText: 'Your workspace has reached the bot limit' })
      .waitFor();
    await page.screenshot({ path: out + '/after-en-plan-limit.png' });
    await d.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.unroute('**/flows');
    assert.equal((await api('/flows', null, token)).length, count);
  });
  await check('Arabic plan limit error is localized', async () => {
    const c = await browser.newContext();
    await c.addInitScript((session) => {
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', 'ar');
    }, session);
    const p = await c.newPage();
    await p.route('**/flows', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'PLAN_LIMIT' }),
          })
        : route.continue(),
    );
    await p.goto(`http://localhost:3000/dashboard/flows?channelId=${channel.id}`);
    await p.waitForLoadState('networkidle');
    await p.getByRole('button', { name: '+ إنشاء', exact: true }).click();
    const d = p.getByRole('dialog');
    await d.locator('input[name="name"]').fill('تجربة حدود الخطة');
    await d.getByRole('button', { name: 'فتح المصمم', exact: true }).click();
    await d.getByRole('alert').filter({ hasText: 'وصلت مساحة العمل إلى الحد المسموح' }).waitFor();
    await p.screenshot({ path: out + '/after-ar-plan-limit.png' });
    await c.close();
  });
  for (const role of ['admin', 'agent']) {
    const invitation = await api(
      '/team/invitations',
      { email: `${role}-${randomUUID()}@example.test`, role, sendEmail: false },
      token,
    );
    const member = await api('/auth/accept-invitation', {
      token: new URL(invitation.inviteUrl).searchParams.get('token'),
      password: `Local-${randomUUID()}`,
      fullName: 'QA ' + role,
    });
    const memberContext = await browser.newContext();
    await memberContext.addInitScript((member) => {
      localStorage.setItem('session', JSON.stringify(member));
      localStorage.setItem('boat-language', 'en');
    }, member);
    const mp = await memberContext.newPage();
    await check(role + ' UI and mutation permission', async () => {
      await mp.goto(`http://localhost:3000/dashboard/flows?channelId=${channel.id}`);
      await mp.waitForLoadState('networkidle');
      if (role === 'admin') {
        assert.ok(await mp.locator('main[class*="manager_"]').isVisible());
        await api(
          '/flows',
          { name: 'Admin permitted QA', language: 'en', channelIds: [channel.id] },
          member.accessToken,
        );
      } else {
        assert.ok(await mp.locator('main[class*="manager_"]').isVisible());
        assert.equal(
          await mp.getByRole('button', { name: '+ Create', exact: true }).isEnabled(),
          false,
        );
        assert.equal(
          await mp.getByRole('button', { name: 'Options', exact: true }).isEnabled(),
          false,
        );
        await api(
          '/flows',
          { name: 'Agent forbidden', language: 'en' },
          member.accessToken,
          'POST',
          403,
        );
      }
    });
    await memberContext.close();
  }
  const touch = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  await touch.addInitScript((session) => {
    localStorage.setItem('session', JSON.stringify(session));
    localStorage.setItem('boat-language', 'en');
  }, session);
  const tp = await touch.newPage();
  await check('Touch options and modal open close', async () => {
    await tp.goto(`http://localhost:3000/dashboard/flows?channelId=${channel.id}`);
    await tp.waitForLoadState('networkidle');
    await tp.getByRole('button', { name: 'Options', exact: true }).tap();
    await tp.getByRole('menuitem', { name: 'Custom Variables', exact: true }).tap();
    await tp.getByRole('dialog').waitFor();
    await tp.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).tap();
    await tp.getByRole('dialog').waitFor({ state: 'hidden' });
    await tp.screenshot({ path: out + '/after-en-touch390.png' });
  });
  await touch.close();
} catch (e) {
  errors.push(e.stack);
} finally {
  writeFileSync(out + '/action-results.json', JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify({ checks: checks.length, failed: checks.filter((c) => !c.pass), errors }, null, 2),
);
if (errors.length || checks.some((c) => !c.pass)) process.exitCode = 1;
