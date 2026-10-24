/* global localStorage, window */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000';
const shots = process.env.SMOKE_SCREENSHOT_DIR || '/workspace/work/acceptance';
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
  email: `provider-browser-${randomUUID()}@example.test`,
  password: randomUUID() + randomUUID(),
  fullName: 'Provider fixture',
  workspaceName: 'AI acceptance',
});
const provider = await call(
  '/agents/providers',
  { name: 'Browser provider', kind: 'openai', model: 'mock', apiKey: 'local_fixture_no_network' },
  a.accessToken,
);
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    (session) => {
      if (window !== window.top) return;
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', 'en');
    },
    { accessToken: a.accessToken, refreshToken: a.refreshToken },
  );
  await page.goto(web + '/dashboard/agents');
  const card = page.getByRole('article').filter({ hasText: 'Browser provider' });
  await card.getByLabel('Name', { exact: true }).fill('Edited provider');
  await card.getByLabel('Model identifier', { exact: true }).fill('mock-v2');
  await card.getByLabel('Model supports tool calls', { exact: true }).uncheck();
  await card.getByRole('button', { name: 'Save model settings', exact: true }).click();
  const edited = page.getByRole('article').filter({ hasText: 'Edited provider' });
  await edited.waitFor();
  const data = await call('/agents', undefined, a.accessToken),
    saved = data.providers.find((p) => p.id === provider.id);
  assert.equal(saved.model, 'mock-v2');
  assert.equal(saved.supports_tools, false);
  assert.equal(saved.revision, 2);
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + '/provider-settings-desktop.png', fullPage: true });
  await edited.getByRole('button', { name: 'Retire provider', exact: true }).click();
  await edited.getByRole('button', { name: 'Confirm permanent retirement', exact: true }).click();
  await edited.getByText('Retired', { exact: true }).waitFor();
  assert.equal(await edited.getByRole('button', { name: 'Rotate key', exact: true }).count(), 0);
  assert.ok(
    (await call('/agents', undefined, a.accessToken)).providers.find((p) => p.id === provider.id)
      .retired_at,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Provider Chromium acceptance: revisioned model/capability editing, saved API values, permanent retirement and removal of key controls passed. No external calls.',
  );
} finally {
  await browser.close();
}
