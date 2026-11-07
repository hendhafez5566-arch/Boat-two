// Isolated full Nest/PGlite/RLS application; external providers disabled by qa-full-api.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const distribution = (await import(process.env.BOAT_CHROMIUM_MODULE)).default;
const out = 'docs/flow-builder-20261107/evidence';
mkdirSync(out, { recursive: true });
const results = [],
  errors = [];
async function api(path, body, token, method = body ? 'POST' : 'GET', expected = 200) {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.ok, expected < 400, path + ': ' + JSON.stringify(data));
  if (expected >= 400) assert.equal(r.status, expected);
  return data;
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
    console.error('FAIL', name, e.message);
  }
}
const session = await api('/auth/register', {
    email: `flow-${randomUUID()}@example.test`,
    password: `Local-${randomUUID()}`,
    fullName: 'Flow QA Owner',
    workspaceName: 'Flow Builder isolated QA',
  }),
  token = session.accessToken;
const channel = await api('/channels', { type: 'web', name: 'Isolated Website' }, token);
await api('/workspace/onboarding/complete', {}, token);
let flow = await api(
  '/flows',
  { name: 'Flow Builder QA', language: 'en', channelIds: [channel.id] },
  token,
);
const graph = {
  startNodeId: 'start',
  nodes: [
    {
      id: 'start',
      type: 'message',
      position: { x: 500, y: 300 },
      data: { text: 'Hello from isolated Flow Builder' },
      edges: { next: 'end' },
    },
    { id: 'end', type: 'end', position: { x: 900, y: 300 }, data: {} },
  ],
  edges: [{ id: 'link', source: 'start', sourceHandle: 'next', target: 'end' }],
};
flow = await api(
  '/flows/' + flow.id,
  { graph, expectedUpdatedAt: flow.updated_at },
  token,
  'PATCH',
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BOAT_CHROMIUM_PATH,
  args: distribution.args.filter((x) => x !== '--single-process'),
});
const context = await browser.newContext({ viewport: { width: 1366, height: 936 } });
await context.addInitScript((s) => {
  localStorage.setItem('session', JSON.stringify(s));
  if (!localStorage.getItem('boat-language')) localStorage.setItem('boat-language', 'en');
}, session);
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => errors.push(e.message));
const url = `http://localhost:3000/dashboard/flows/${flow.id}?channelId=${channel.id}`;
const more = () => page.getByRole('button', { name: 'More tools', exact: true });
async function menu() {
  if ((await more().getAttribute('aria-expanded')) !== 'true') await more().click();
}
async function closeMenu() {
  if ((await more().getAttribute('aria-expanded')) === 'true') await more().click();
}
try {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await check('Reference included in initial viewport; measured card and toolbar', async () => {
    const ref = page.locator('.react-flow__node-reference');
    await ref.waitFor();
    const r = await ref.boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= 1366);
    assert.equal(Math.round(r.width), 264);
    assert.equal(await page.locator('.react-flow__background').count(), 0);
    assert.equal(await page.locator('.canvas-zoombar').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Publish bot', exact: true }).count(), 0);
    await page.screenshot({ path: out + '/after-en-1366-canvas.png' });
  });
  for (const locale of ['en', 'ar']) {
    await page.evaluate((l) => localStorage.setItem('boat-language', l), locale);
    await page.reload();
    await page.waitForLoadState('networkidle');
    for (const width of [320, 390, 768, 1366, 1920]) {
      await page.setViewportSize({ width, height: 936 });
      await check(`Canvas and palette ${locale} ${width}`, async () => {
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        const tool = await page.locator('header[aria-label]').first().boundingBox();
        assert.ok(tool.x >= 0 && tool.x + tool.width <= width + 1);
        await page
          .getByRole('button', {
            name: locale === 'ar' ? 'توسيع أدوات العقد' : 'Expand flow blocks',
            exact: true,
          })
          .click();
        const palette = page.locator('aside[aria-label]');
        await palette.getByRole('searchbox').fill(locale === 'ar' ? 'صورة' : 'Image');
        assert.equal(await palette.locator('button[draggable=true]').count(), 1);
        await page.screenshot({ path: `${out}/after-${locale}-${width}-palette.png` });
        await page
          .getByRole('button', {
            name: locale === 'ar' ? 'تصغير أدوات العقد' : 'Collapse flow blocks',
            exact: true,
          })
          .click();
      });
    }
  }
  await page.evaluate(() => localStorage.setItem('boat-language', 'en'));
  await page.setViewportSize({ width: 1366, height: 936 });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await check('Name edit and explicit draft save persist; autosave defaults off', async () => {
    await menu();
    assert.equal(await page.getByRole('checkbox', { name: 'Autosave draft' }).isChecked(), false);
    await page
      .getByRole('textbox', { name: 'Flow name', exact: true })
      .fill('Renamed Flow Builder QA');
    await closeMenu();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('networkidle');
    assert.equal((await api('/flows/' + flow.id, null, token)).name, 'Renamed Flow Builder QA');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await menu();
    assert.equal(
      await page.getByRole('textbox', { name: 'Flow name', exact: true }).inputValue(),
      'Renamed Flow Builder QA',
    );
    await closeMenu();
  });
  await check('Double-click node opens real configuration and cancel closes', async () => {
    await page.locator('.react-flow__node[data-id=start]').dblclick();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: out + '/after-en-1366-properties.png' });
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });
  await check('Additional blocks remain available on demand', async () => {
    await page.getByRole('button', { name: 'Expand flow blocks', exact: true }).click();
    await page.getByRole('button', { name: 'Additional Boat Two blocks', exact: false }).click();
    await page.getByRole('button', { name: 'Add Human handoff', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Collapse flow blocks', exact: true }).click();
  });
  await check('Preview calls real simulator', async () => {
    await menu();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('button', { name: 'Start preview', exact: true }).click();
    await page.getByText('Hello from isolated Flow Builder', { exact: true }).last().waitFor();
    await page.screenshot({ path: out + '/after-en-preview.png' });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close / إغلاق', exact: true })
      .click();
  });
  await check('Graph coordinates and connections survive reopen', async () => {
    const f = await api('/flows/' + flow.id, null, token);
    assert.deepEqual(
      f.draft_graph.nodes.map((n) => n.position),
      graph.nodes.map((n) => n.position),
    );
    assert.equal(f.draft_graph.startNodeId, 'start');
    assert.equal(f.draft_graph.nodes.length, 2);
    assert.ok(!JSON.stringify(f.draft_graph).includes('__boat_flow_reference'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.react-flow__node-flowNode').count(), 2);
  });
  await check('Publish persists real version; edit and republish create another', async () => {
    let f = await api('/flows/' + flow.id, null, token);
    await api('/flows/' + flow.id + '/publish', { expectedUpdatedAt: f.updated_at }, token);
    f = await api('/flows/' + flow.id, null, token);
    assert.equal(f.status, 'published');
    const first = f.published_version;
    const g = structuredClone(f.draft_graph);
    g.nodes[0].data.text = 'Republished isolated message';
    f = await api(
      '/flows/' + flow.id,
      { graph: g, expectedUpdatedAt: f.updated_at },
      token,
      'PATCH',
    );
    await api('/flows/' + flow.id + '/publish', { expectedUpdatedAt: f.updated_at }, token);
    f = await api('/flows/' + flow.id, null, token);
    assert.notEqual(f.published_version, first);
    const test = await api('/flows/' + flow.id + '/test', {}, token);
    assert.ok(JSON.stringify(test).includes('Republished isolated message'));
  });
  await check('Tenant isolation rejects another workspace reading graph', async () => {
    const other = await api('/auth/register', {
      email: `other-${randomUUID()}@example.test`,
      password: `Local-${randomUUID()}`,
      fullName: 'Other QA',
      workspaceName: 'Other isolated tenant',
    });
    await api('/flows/' + flow.id, null, other.accessToken, 'GET', 404);
  });
} finally {
  writeFileSync(
    out + '/results.json',
    JSON.stringify(
      {
        results,
        errors,
        passed: results.filter((r) => r.status === 'PASS').length,
        failed: results.filter((r) => r.status === 'FAIL').length,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
assert.equal(results.filter((r) => r.status === 'FAIL').length, 0);
assert.equal(errors.length, 0);
