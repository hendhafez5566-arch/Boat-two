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
    console.error('FAIL', name, e.stack || e.message);
    await page
      .screenshot({
        path: out + '/failure-' + name.replace(/[^a-z0-9]+/gi, '-').slice(0, 70) + '.png',
      })
      .catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
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
let url = `http://localhost:3000/dashboard/flows/${flow.id}?channelId=${channel.id}`;
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
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-1366-canvas.png',
    });
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
        await page.screenshot({
          timeout: 30000,
          animations: 'disabled',
          path: `${out}/after-${locale}-${width}-palette.png`,
        });
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
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-1366-properties.png',
    });
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
    const previewResponse = page.waitForResponse(
      (r) => r.url().endsWith('/flows/' + flow.id + '/test') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Start preview', exact: true }).click();
    assert.ok((await previewResponse).ok());
    await page.getByText('Hello from isolated Flow Builder', { exact: true }).last().waitFor();
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-preview.png',
    });
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
  await check('Create through manager opens persisted editor with channel context', async () => {
    await page.goto(`http://localhost:3000/dashboard/flows?channelId=${channel.id}`);
    await page.getByRole('button', { name: '+ Create', exact: true }).click();
    const d = page.getByRole('dialog');
    await d.locator('input[name="name"]').fill('UI-created isolated flow');
    await d.getByRole('button', { name: 'Open Builder', exact: true }).click();
    await page.waitForURL(/dashboard\/flows\/[^?]+\?channelId=/);
    await page.waitForLoadState('networkidle');
    assert.ok(
      (await api('/flows', null, token)).some((f) => f.name === 'UI-created isolated flow'),
    );
    assert.equal(new URL(page.url()).searchParams.get('channelId'), channel.id);
    const created = (await api('/flows', null, token)).find(
      (row) => row.name === 'UI-created isolated flow',
    );
    flow = await api('/flows/' + created.id, null, token);
    url = page.url();
    await page.goto(url);
    await page.waitForLoadState('networkidle');
  });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  let addedId;
  await check('Add Text, configure, connect and move through real editor', async () => {
    await page.getByRole('button', { name: 'Add Text', exact: true }).click();
    const d = page.getByRole('dialog');
    await d.getByRole('textbox', { name: 'Reply Message', exact: true }).fill('UI added text node');
    await d.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    await menu();
    await page.getByRole('button', { name: 'Fit all steps', exact: true }).click();
    await closeMenu();
    addedId = await page
      .locator('.react-flow__node-flowNode')
      .filter({ hasText: 'UI added text node' })
      .getAttribute('data-id');
    await page.waitForTimeout(450);
    const connect = async (from, to) => {
      const a = await page
        .locator(`.react-flow__node[data-id="${from}"] .react-flow__handle.source`)
        .first()
        .boundingBox();
      const b = await page
        .locator(`.react-flow__node[data-id="${to}"] .react-flow__handle.target`)
        .first()
        .boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(100);
    };
    await connect('start', addedId);
    await connect(addedId, 'end');
    const card = page.locator(`.react-flow__node[data-id="${addedId}"]`);
    await page.waitForTimeout(100);
    const r = await card.locator('.flow-node-heading').boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 64, r.y + r.height / 2 + 32, { steps: 12 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('networkidle');
    const f = await api('/flows/' + flow.id, null, token);
    assert.equal(f.draft_graph.nodes.find((n) => n.id === 'start').edges.next, addedId);
    assert.equal(f.draft_graph.nodes.find((n) => n.id === addedId).edges.next, 'end');
    const saved = JSON.stringify(f.draft_graph);
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(JSON.stringify((await api('/flows/' + flow.id, null, token)).draft_graph), saved);
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-connected.png',
    });
  });
  await check(
    'Reference socket changes actual start and never persists decorative nodes',
    async () => {
      const drag = async (target) => {
        await menu();
        await page.getByRole('button', { name: 'Fit all steps', exact: true }).click();
        await closeMenu();
        await page.waitForTimeout(450);
        const a = await page
          .locator('.react-flow__node-reference .react-flow__handle.source')
          .boundingBox();
        const b = await page
          .locator(`.react-flow__node[data-id="${target}"] .react-flow__handle.target`)
          .first()
          .boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
        await page.mouse.up();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForLoadState('networkidle');
      };
      await drag(addedId);
      let f = await api('/flows/' + flow.id, null, token);
      assert.equal(f.draft_graph.startNodeId, addedId);
      assert.ok(!JSON.stringify(f.draft_graph).includes('__boat_flow_reference'));
      await drag('start');
      f = await api('/flows/' + flow.id, null, token);
      assert.equal(f.draft_graph.startNodeId, 'start');
    },
  );
  await check(
    'Disconnect selected connection and undo restore without deleting nodes',
    async () => {
      const count = await page.locator('.react-flow__node-flowNode').count();
      const edge = page.getByRole('button', { name: `Edge from start to ${addedId}`, exact: true });
      await edge.focus();
      await edge.press('Enter');
      await page.keyboard.press('Delete');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForLoadState('networkidle');
      let f = await api('/flows/' + flow.id, null, token);
      assert.equal(f.draft_graph.nodes.length, count);
      assert.equal(f.draft_graph.nodes.find((n) => n.id === 'start').edges.next, undefined);
      await page.keyboard.press('Control+z');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForLoadState('networkidle');
      f = await api('/flows/' + flow.id, null, token);
      assert.equal(f.draft_graph.nodes.find((n) => n.id === 'start').edges.next, addedId);
    },
  );
  await check('Node duplicate/delete, undo and redo preserve original graph', async () => {
    const count = await page.locator('.react-flow__node-flowNode').count();
    await page.locator(`.react-flow__node[data-id="${addedId}"]`).click();
    await page.keyboard.press('Control+d');
    await page.waitForFunction(
      (n) => document.querySelectorAll('.react-flow__node-flowNode').length === n,
      count + 1,
    );
    await page.keyboard.press('Control+z');
    await page.waitForFunction(
      (n) => document.querySelectorAll('.react-flow__node-flowNode').length === n,
      count,
    );
    await page.keyboard.press('Control+y');
    await page.waitForFunction(
      (n) => document.querySelectorAll('.react-flow__node-flowNode').length === n,
      count + 1,
    );
    await page
      .locator('.react-flow__node-flowNode')
      .filter({ hasText: 'UI added text node' })
      .last()
      .click();
    await page.keyboard.press('Delete');
    await page.waitForFunction(
      (n) => document.querySelectorAll('.react-flow__node-flowNode').length === n,
      count,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('networkidle');
  });
  await check('UI-created connected draft previews through actual server', async () => {
    await menu();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/flows/' + flow.id + '/test') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Start preview', exact: true }).click();
    const r = await response;
    assert.ok(r.ok());
    assert.ok(JSON.stringify(await r.json()).includes('UI added text node'));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close / إغلاق', exact: true })
      .click();
  });
  await check('Keyboard Enter opens configuration and Escape closes it', async () => {
    await page.locator('.react-flow__node[data-id=start]').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });
  await check('Publish through UI, edit, republish and verify actual version', async () => {
    await menu();
    await page.getByRole('button', { name: 'Publish bot', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm publish', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForLoadState('networkidle');
    let f = await api('/flows/' + flow.id, null, token);
    for (let n = 0; n < 40 && f.status !== 'published'; n++) {
      await new Promise((r) => setTimeout(r, 100));
      f = await api('/flows/' + flow.id, null, token);
    }
    assert.equal(f.status, 'published');
    const first = f.published_version;
    await page.locator('.react-flow__node[data-id=start]').dblclick();
    await page
      .getByRole('textbox', { name: 'Reply Message', exact: true })
      .fill('Republished isolated message');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await menu();
    await page.getByRole('button', { name: 'Publish update', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm publish', exact: true })
      .click();
    await page.waitForLoadState('networkidle');
    f = await api('/flows/' + flow.id, null, token);
    for (let n = 0; n < 30 && !(f.published_version > first); n++) {
      await new Promise((r) => setTimeout(r, 100));
      f = await api('/flows/' + flow.id, null, token);
    }
    assert.ok(f.published_version > first);
    assert.ok(
      JSON.stringify(await api('/flows/' + flow.id + '/test', {}, token)).includes(
        'Republished isolated message',
      ),
    );
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-published.png',
    });
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
  await check('Right-click grouped menu search adds a real block', async () => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const point = await page.evaluate(() => {
      for (const y of [850, 750, 120, 400])
        for (const x of [100, 500, 1100, 800]) {
          const e = document.elementFromPoint(x, y);
          if (e?.classList.contains('react-flow__pane')) return { x, y };
        }
      return null;
    });
    assert.ok(point, 'Find an actual blank canvas point');
    await page.mouse.click(point.x, point.y, { button: 'right' });
    const menu = page.getByRole('menu').first();
    await menu.waitFor();
    await menu.getByRole('textbox', { name: 'Search steps', exact: true }).fill('Image');
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-context-menu.png',
    });
    await menu.getByRole('menuitem', { name: 'Image', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    page.once('dialog', (d) => d.accept());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });
  await check(
    'Every supported block opens its configuration, then discard retains saved graph',
    async () => {
      const saved = JSON.stringify((await api('/flows/' + flow.id, null, token)).draft_graph);
      await page.getByRole('button', { name: 'Expand flow blocks', exact: true }).click();
      await page.getByRole('button', { name: 'Additional Boat Two blocks', exact: false }).click();
      const names = await page
        .locator('aside[aria-label="Flow blocks"] button[draggable=true]')
        .evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')));
      await page.getByRole('button', { name: 'Collapse flow blocks', exact: true }).click();
      for (const name of names) {
        await page.getByRole('button', { name: 'Expand flow blocks', exact: true }).click();
        await page.getByRole('button', { name, exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      }
      page.once('dialog', (d) => d.accept());
      await page.reload();
      await page.waitForLoadState('networkidle');
      assert.equal(
        JSON.stringify((await api('/flows/' + flow.id, null, token)).draft_graph),
        saved,
      );
      results.push({
        name: 'Supported block configuration count',
        status: 'PASS',
        count: names.length,
      });
    },
  );
  for (const role of ['admin', 'agent'])
    await check(role + ' mutation authorization on existing graph', async () => {
      const inv = await api(
        '/team/invitations',
        { email: `${role}-${randomUUID()}@example.test`, role, sendEmail: false },
        token,
      );
      const member = await api('/auth/accept-invitation', {
        token: new URL(inv.inviteUrl).searchParams.get('token'),
        password: `Local-${randomUUID()}`,
        fullName: 'QA ' + role,
      });
      const f = await api('/flows/' + flow.id, null, member.accessToken);
      await api(
        '/flows/' + flow.id,
        { name: f.name, expectedUpdatedAt: f.updated_at },
        member.accessToken,
        'PATCH',
        role === 'admin' ? 200 : 403,
      );
      await api(
        '/flows/' + flow.id + '/publish',
        {},
        member.accessToken,
        'POST',
        role === 'admin' ? 200 : 403,
      );
    });
  await check('Published Webchat collects CRM identity and hands off with context', async () => {
    let f = await api('/flows/' + flow.id, null, token);
    const runtimeGraph = {
      startNodeId: 'ask',
      nodes: [
        {
          id: 'ask',
          type: 'question',
          position: { x: 100, y: 200 },
          data: {
            text: 'What is your test name?',
            answerType: 'text',
            saveAs: 'name',
            saveToSystem: 'name',
          },
          edges: { ok: 'reply' },
        },
        {
          id: 'reply',
          type: 'message',
          position: { x: 500, y: 200 },
          data: { text: 'Context received {{name}}' },
          edges: { next: 'staff' },
        },
        {
          id: 'staff',
          type: 'handoff',
          position: { x: 900, y: 200 },
          data: { message: 'A teammate will follow up' },
          edges: {},
        },
      ],
    };
    f = await api(
      '/flows/' + flow.id,
      { graph: runtimeGraph, expectedUpdatedAt: f.updated_at },
      token,
      'PATCH',
    );
    await api('/flows/' + flow.id + '/publish', { expectedUpdatedAt: f.updated_at }, token);
    const visitor = await api('/widget/' + channel.external_id + '/session', {});
    const send = async (text) => {
      const r = await fetch(
        'http://localhost:4000/widget/' +
          channel.external_id +
          '/messages?visitorId=' +
          visitor.visitorId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
          body: JSON.stringify({ text, clientMsgId: randomUUID() }),
        },
      );
      assert.ok(r.ok, await r.text());
    };
    await send('Local QA hello');
    for (let i = 0; i < 80; i++) {
      const r = await fetch(
        'http://localhost:4000/widget/' +
          channel.external_id +
          '/messages?visitorId=' +
          visitor.visitorId,
        { headers: { 'x-visitor-token': visitor.token } },
      );
      if (JSON.stringify(await r.json()).includes('What is your test name?')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await send('Synthetic Flow Visitor');
    let convo;
    for (let i = 0; i < 80; i++) {
      const rows = await api('/conversations', null, token);
      convo = (rows.items ?? rows)[0];
      if (convo?.handled_by === 'human') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const detail = await api('/conversations/' + convo.id, null, token);
    assert.equal(detail.handled_by, 'human');
    const profile = await api('/crm/contacts/' + convo.contact_id + '/profile', null, token);
    assert.equal(profile.contact.name, 'Synthetic Flow Visitor');
    const messages = await api('/conversations/' + convo.id + '/messages', null, token);
    assert.ok(JSON.stringify(messages).includes('Synthetic Flow Visitor'));
  });
  await check('Real load failure shows retry and recovers without enabling fake save', async () => {
    await page.route('**/flows/' + flow.id, (route) =>
      route.request().method() === 'GET' ? route.abort() : route.continue(),
    );
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'Could not load the flow' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), false);
    await page.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-en-load-error.png',
    });
    await page.unroute('**/flows/' + flow.id);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
    assert.ok(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled());
  });
  await check('Arabic touch palette and configuration footer remain usable', async () => {
    const touch = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    await touch.addInitScript((s) => {
      localStorage.setItem('session', JSON.stringify(s));
      localStorage.setItem('boat-language', 'ar');
    }, session);
    const tp = await touch.newPage();
    await tp.goto(url);
    await tp.waitForLoadState('networkidle');
    await tp.getByRole('button', { name: 'إضافة رسالة', exact: true }).tap();
    const dialog = tp.getByRole('dialog');
    await dialog.waitFor();
    const box = await dialog
      .getByRole('button', { name: 'حفظ التغييرات', exact: true })
      .boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844);
    await tp.screenshot({
      timeout: 30000,
      animations: 'disabled',
      path: out + '/after-ar-touch-properties.png',
    });
    await dialog.getByRole('button', { name: 'إغلاق', exact: true }).tap();
    await dialog.waitFor({ state: 'hidden' });
    await touch.close();
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
