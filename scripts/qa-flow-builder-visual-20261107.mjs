// Isolated full Nest/PGlite/RLS application; external providers disabled by qa-full-api.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const distribution = (await import(process.env.BOAT_CHROMIUM_MODULE)).default;
const out = 'docs/flow-builder-20261107/visual';
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
const baseline = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', '3001'],
  { cwd: '../Boat-two-flow-before/apps/web', stdio: 'ignore' },
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BOAT_CHROMIUM_PATH,
  args: distribution.args.filter((x) => x !== '--single-process'),
});
const pairs = [],
  metrics = [],
  checks = [];
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://localhost:3001/login')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const locale of ['en', 'ar']) {
    const context = await browser.newContext();
    await context.addInitScript(
      ({ session, locale }) => {
        localStorage.setItem('session', JSON.stringify(session));
        localStorage.setItem('boat-language', locale);
      },
      { session, locale },
    );
    const before = await context.newPage(),
      after = await context.newPage();
    for (const p of [before, after]) p.on('pageerror', (e) => errors.push(e.message));
    for (const width of [320, 390, 768, 1366, 1920]) {
      for (const p of [before, after]) await p.setViewportSize({ width, height: 936 });
      for (const [label, p, port] of [
        ['before', before, 3001],
        ['after', after, 3000],
      ]) {
        await p.goto(`http://localhost:${port}/dashboard/flows/${flow.id}?channelId=${channel.id}`);
        await p.waitForLoadState('networkidle');
        await p.evaluate(() => document.fonts.ready);
        await p.addStyleTag({
          content:
            '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
        });
        await p.mouse.move(width - 2, 930);
        await p.screenshot({ path: `${out}/${label}-${locale}-${width}-canvas.png` });
        await p
          .getByRole('button', {
            name: locale === 'ar' ? 'توسيع أدوات العقد' : 'Expand flow blocks',
            exact: true,
          })
          .click();
        await p.screenshot({ path: `${out}/${label}-${locale}-${width}-palette.png` });
        await p
          .getByRole('button', {
            name: locale === 'ar' ? 'تصغير أدوات العقد' : 'Collapse flow blocks',
            exact: true,
          })
          .click();
        await p.locator('.react-flow__node[data-id=start]').dblclick();
        await p.getByRole('dialog').waitFor();
        await p.screenshot({ path: `${out}/${label}-${locale}-${width}-properties.png` });
        if (label === 'after') {
          const box = await p.getByRole('dialog').boundingBox();
          checks.push({
            name: `Property drawer ${locale} ${width}`,
            pass: box.x >= -1 && box.x + box.width <= width + 1,
          });
          metrics.push({
            locale,
            width,
            drawer: box,
            cards: await p.locator('.premium-flow-node').evaluateAll((es) =>
              es.map((e) => {
                const r = e.getBoundingClientRect(),
                  s = getComputedStyle(e);
                return {
                  type: e.getAttribute('aria-label'),
                  width: s.width,
                  radius: s.borderRadius,
                  border: s.border,
                  font: s.font,
                  screenWidth: r.width,
                };
              }),
            ),
          });
        }
      }
      for (const state of ['canvas', 'palette', 'properties'])
        pairs.push({
          kind: 'builder',
          locale,
          width,
          state,
          before: `before-${locale}-${width}-${state}.png`,
          after: `after-${locale}-${width}-${state}.png`,
        });
    }
    for (const p of [before, after]) await p.setViewportSize({ width: 1366, height: 936 });
    for (const route of [
      '',
      'inbox',
      'crm/overview',
      'crm/sales',
      'channels',
      'automations',
      'team',
      'settings',
      'billing',
      'campaigns',
    ]) {
      const key = route.replaceAll('/', '-') || 'dashboard';
      for (const [label, p, port] of [
        ['before', before, 3001],
        ['after', after, 3000],
      ]) {
        await p.goto(`http://localhost:${port}/dashboard${route ? '/' + route : ''}`);
        await p.waitForLoadState('networkidle');
        await p.evaluate(() => document.fonts.ready);
        await p.addStyleTag({
          content:
            '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
        });
        await p.mouse.move(1364, 934);
        await p.screenshot({ path: `${out}/protected-${label}-${locale}-${key}.png` });
      }
      pairs.push({
        kind: 'protected',
        route,
        locale,
        width: 1366,
        before: `protected-before-${locale}-${key}.png`,
        after: `protected-after-${locale}-${key}.png`,
      });
    }
    await context.close();
  }
} finally {
  writeFileSync(out + '/pairs.json', JSON.stringify(pairs, null, 2));
  writeFileSync(out + '/metrics.json', JSON.stringify({ metrics, checks, errors }, null, 2));
  await browser.close();
  baseline.kill('SIGTERM');
}
assert.equal(errors.length, 0);
assert.ok(checks.every((x) => x.pass));
console.log(JSON.stringify({ pairs: pairs.length, drawerChecks: checks.length, errors }));
