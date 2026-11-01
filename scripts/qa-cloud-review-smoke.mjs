/* global localStorage, getComputedStyle */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { openSync, mkdirSync, writeFileSync } from 'node:fs';
const local = createRequire(import.meta.url);
const { chromium } = local(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const log = openSync('/tmp/boat-review-gateway.log', 'w');
const child = spawn(process.execPath, ['scripts/qa-cloud-review.mjs'], {
  stdio: ['ignore', log, log],
  env: { ...process.env, BOAT_CLOUD_REVIEW: 'true', PORT: '8080' },
});
let browser;
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch('http://127.0.0.1:8080/__review/health');
      if (r.ok) {
        const h = await r.json();
        assert.equal(h.ownerDatabase, false);
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(ready, 'isolated gateway starts');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BOAT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:8080/__review');
  await page.getByRole('button', { name: 'إنشاء شركة اختبار مستقلة', exact: true }).click();
  const app = page.frameLocator('#app');
  await app.getByRole('heading', { name: 'دليل البداية' }).first().waitFor();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
  assert.ok(session.accessToken);
  results.push('gateway isolation, bootstrap through real register API and onboarding UI');
  const call = async (path, body, method = body ? 'POST' : 'GET') => {
    const r = await fetch('http://127.0.0.1:8080/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.accessToken,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json();
    assert.ok(r.ok, path + JSON.stringify(d));
    return d;
  };
  const channel = await call('/channels', { type: 'web', name: 'Isolated QA Webchat' });
  await call('/workspace/onboarding/complete', {});
  const flow = await call('/flows', {
    name: 'Six fixes QA',
    language: 'en',
    channelIds: [channel.id],
  });
  await call(
    '/flows/' + flow.id,
    {
      graph: {
        startNodeId: 'hello',
        nodes: [
          {
            id: 'hello',
            type: 'message',
            position: { x: 0, y: 0 },
            data: { text: 'Hello isolated QA' },
            edges: { next: 'staff' },
          },
          {
            id: 'staff',
            type: 'handoff',
            position: { x: 400, y: 0 },
            data: { message: 'QA staff handoff' },
            edges: {},
          },
        ],
      },
      channelIds: [channel.id],
    },
    'PATCH',
  );
  await page.evaluate(() => localStorage.setItem('boat-language', 'en'));
  await page.goto('http://127.0.0.1:8080/dashboard/flows/' + flow.id);
  await page.getByRole('button', { name: 'More tools', exact: true }).click();
  await page.getByRole('button', { name: /^Undo/ }).waitFor();
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.getByRole('button', { name: /^Undo/ }).waitFor({ state: 'hidden' });
  results.push('tools menu closes on actual canvas click');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Start preview', exact: true }).click();
  await page.getByText('QA staff handoff', { exact: true }).waitFor();
  await page.getByPlaceholder(/restart/).waitFor();
  assert.match(
    await page
      .getByRole('textbox', { name: 'Customer reply', exact: true })
      .getAttribute('placeholder'),
    /restart/,
  );
  assert.equal(await page.locator('.tp-system').count(), 0);
  results.push('simulator ends with restart hint and diagnostics are outside customer transcript');
  await page.goto('http://127.0.0.1:8080/dashboard/crm');
  const color = await page
    .locator('.bs-topbar')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(color, 'rgba(0, 0, 0, 0)');
  results.push('sticky header is opaque');
  mkdirSync('docs/acceptance/2026-11-01-cloud-audit/review', { recursive: true });
  await page.screenshot({
    path: 'docs/acceptance/2026-11-01-cloud-audit/review/local-review-smoke.jpg',
    quality: 75,
  });
  writeFileSync(
    'docs/acceptance/2026-11-01-cloud-audit/review/local-smoke.json',
    JSON.stringify(
      {
        status: 'PASS',
        results,
        limits: [
          'This is local Chromium, not Cloud Browser acceptance; polling and Excel feedback still require UI checks',
        ],
      },
      null,
      2,
    ),
  );
  console.log('REVIEW_SMOKE_PASS', results);
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
}
