/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3001',
  shots = process.env.SMOKE_SCREENSHOT_DIR || '/workspace/work/maximum-acceptance';
async function call(path, body, token) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  assert.ok(res.ok, JSON.stringify(data));
  return data;
}
const a = await call('/auth/register', {
  email: `ai-browser-${randomUUID()}@example.test`,
  password: randomUUID() + randomUUID(),
  fullName: 'AI fixture',
  workspaceName: 'AI workspace acceptance',
});
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (s) => {
      if (window !== window.top) return;
      localStorage.setItem('session', JSON.stringify(s));
      localStorage.setItem('boat-language', 'en');
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  await page.goto(web + '/dashboard/ai');
  await page.getByRole('textbox', { name: 'Business name', exact: true }).fill('Fixture business');
  await page.getByRole('spinbutton', { name: 'Conversation history limit', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.getByText('Assistant settings saved.', { exact: true }).waitFor();
  assert.equal((await call('/ai/settings', undefined, a.accessToken)).max_history, 8);
  await page.reload();
  assert.equal(
    await page.getByRole('textbox', { name: 'Business name', exact: true }).inputValue(),
    'Fixture business',
  );
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + '/ai-settings-desktop.png', fullPage: true });
  await page.goto(web + '/dashboard/agents');
  await page
    .getByRole('spinbutton', { name: 'Monthly attempt cap (optional)', exact: true })
    .fill('10');
  await page
    .getByRole('spinbutton', { name: 'Monthly token cap (optional)', exact: true })
    .fill('50000');
  await page
    .getByRole('spinbutton', { name: 'Monthly cost cap in USD (optional)', exact: true })
    .fill('2');
  const [saved] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/agents/generation/policy') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Save budget limits', exact: true }).click(),
  ]);
  assert.equal(saved.status(), 201);
  const ledger = await call('/agents/generation', undefined, a.accessToken);
  assert.equal(ledger.policy.monthly_calls, 10);
  assert.equal(Number(ledger.policy.monthly_cost_microusd), 2000000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(web + '/dashboard/ai');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'العربية / English', exact: true }).click();
  await page.getByRole('heading', { name: 'المساعد الذكي', exact: true }).waitFor();
  await page.screenshot({ path: shots + '/ai-settings-arabic-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'AI workspace Chromium: saved/reopened settings, actual budget policy persistence, bilingual responsive UI and no page errors passed.',
  );
} finally {
  await browser.close();
}
