/* global localStorage, window */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = local('./dist/database/database.service.js'),
  { CryptoService } = local('./dist/messaging/crypto.service.js'),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const db = new DatabaseService(),
  crypto = new CryptoService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  mock = 'http://localhost:' + (process.env.BOAT_AI_FIXTURE_PORT || '4135'),
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000',
  shots = process.env.BOAT_SCREENSHOTS || '/workspace/work/acceptance';
const child = fork(fileURLToPath(new URL('./fixture-ai-api.mjs', import.meta.url)), [], {
  execArgv: [],
  env: {
    ...process.env,
    NODE_ENV: 'test',
    API_PORT: new URL(mock).port,
    AI_PROVIDER_CALLS_ENABLED: 'true',
    EXTERNAL_DELIVERY_ENABLED: 'false',
  },
  stdio: 'ignore',
});
let browser;
async function call(path, body, token) {
  const r = await fetch(mock + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch(mock + '/health');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The isolated server may still be starting. */
    }
    await delay(100);
  }
  assert.ok(ready, 'Isolated mocked API should start');
  await mkdir(shots, { recursive: true });
  const a = await call('/auth/register', {
    email: `ai-recovery-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    fullName: 'AI recovery fixture',
    workspaceName: 'AI recovery acceptance',
  });
  await db.withTenant(a.tenantId, async (c) => {
    const p = (
      await c.query(
        "INSERT INTO ai_providers(tenant_id,name,kind,model,credentials_enc,enabled) VALUES($1,'Mock-only provider','openai','fixture',$2,true) RETURNING id",
        [a.tenantId, crypto.encrypt({ apiKey: 'fixture_no_real_account' })],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO ai_agents(tenant_id,name,provider_id,enabled,is_default,allowed_tools) VALUES($1,'Recovery fixture',$2,true,true,ARRAY[]::text[])",
      [a.tenantId, p],
    );
  });
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Forward browser requests to the real isolated API. Only its provider implementation is mocked.
  await page.route(base + '/**', async (route) => {
    const response = await route.fetch({ url: mock + route.request().url().slice(base.length) });
    await route.fulfill({ response });
  });
  await page.addInitScript(
    (s) => {
      if (window !== window.top) return;
      if (!localStorage.getItem('session')) localStorage.setItem('session', JSON.stringify(s));
      if (!localStorage.getItem('boat-language')) localStorage.setItem('boat-language', 'en');
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  await page.goto(web + '/dashboard/ai');
  await page
    .getByRole('textbox', { name: /^Fallback message/ })
    .fill('Local fallback for our team');
  await page.getByRole('checkbox', { name: 'Allow human escalation', exact: true }).check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByText('Assistant settings saved.', { exact: true }).waitFor();
  await page.getByLabel('Test question', { exact: true }).fill('fixture-fail once');
  const [failed] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/ai/test') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Test reply', exact: true }).click(),
  ]);
  const failure = await failed.json();
  assert.equal(failure.failed, true);
  assert.equal(failure.handoff, true);
  await page
    .locator('article[role=status]')
    .getByText('Local fallback for our team', { exact: true })
    .waitFor();
  await page.getByText('Human follow-up required.', { exact: true }).waitFor();
  await page.getByLabel('Test question', { exact: true }).fill('recover new request');
  const [recovered] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/ai/test') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Test reply', exact: true }).click(),
  ]);
  assert.equal((await recovered.json()).failed, false);
  await page.getByText('Mock provider recovered successfully', { exact: true }).waitFor();
  const runs = await db.withTenant(
    a.tenantId,
    async (c) => (await c.query('SELECT status,error FROM ai_runs ORDER BY created_at')).rows,
  );
  assert.equal(runs.length, 2);
  assert.equal(runs.filter((r) => r.status === 'failed').length, 1);
  assert.ok(!JSON.stringify(runs).includes('private_mock_failure'));
  await page.screenshot({ path: shots + '/ai-recovery-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('heading', { name: 'المساعد الذكي', exact: true }).waitFor();
  await page.screenshot({ path: shots + '/ai-recovery-arabic-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'AI recovery Chromium: real configuration save and API/runtime with isolated mocked provider, persisted fallback/human escalation, one sanitized failure then successful new request, exactly two run records and Arabic/mobile passed. No external requests.',
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: '/workspace/work/ai-recovery-failure.png', fullPage: true });
    await writeFile(
      '/workspace/work/ai-recovery-failure.txt',
      await page.locator('body').innerText(),
    );
  }
  throw error;
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  await delay(300);
  if (child.exitCode === null) child.kill('SIGKILL');
  await db.onModuleDestroy();
}
