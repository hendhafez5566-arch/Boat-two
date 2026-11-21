import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://localhost:4000';
const response = await fetch(base + '/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: randomUUID() + '@example.test',
    password: 'Synthetic-' + randomUUID(),
    fullName: 'CSV QA',
    workspaceName: 'CSV QA',
  }),
});
assert.ok(response.ok);
const session = await response.json();
const headers = { authorization: 'Bearer ' + session.accessToken, 'content-type': 'application/json' };
assert.ok((await fetch(base + '/workspace/onboarding/complete', { method: 'POST', headers, body: '{}' })).ok);

const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript((value) => {
    localStorage.setItem('boat-language', 'en');
    if (!localStorage.getItem('session')) localStorage.setItem('session', JSON.stringify(value));
  }, session);
  const fixture = {
    name: 'resumable.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(['Name,Email', ...Array.from({ length: 101 }, (_, i) =>
      'Resume client ' + i + ',resume-' + i + '@example.test')].join('\n')),
  };
  async function stageImport() {
    await page.goto('http://localhost:3000/dashboard/crm');
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'Import and manage files', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Customer import and export', exact: true });
    await dialog.locator('input[accept=".csv,.xlsx,.json"]').setInputFiles(fixture);
    return dialog;
  }
  const upload = '**/crm/jobs/*/upload';
  let original;
  await page.route(upload, async (route) => {
    const sent = await route.fetch();
    assert.ok(sent.ok());
    original = await sent.json();
    assert.equal(original.uploaded, 100);
    await route.abort('internetdisconnected');
  });
  let dialog = await stageImport();
  await dialog.getByRole('button', { name: 'Confirm and start import', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.ok(original?.id);
  await page.unroute(upload);
  dialog = await stageImport();
  const resumed = page.waitForResponse((res) => res.url().endsWith('/' + original.id + '/upload'));
  await dialog.getByRole('button', { name: 'Confirm and start import', exact: true }).click();
  const chunk = await resumed;
  assert.ok(chunk.ok());
  assert.equal(chunk.request().postDataJSON().after, 100);
  assert.equal((await chunk.json()).uploaded, 101);
  await dialog.getByText(/Import queued/).waitFor();
  const jobs = await (await fetch(base + '/crm/jobs', { headers })).json();
  assert.equal(jobs.filter((job) => job.kind === 'import').length, 1);
  for (let attempt = 0; ; attempt++) {
    const result = await (await fetch(base + '/crm/contacts?q=Resume%20client&limit=100', { headers })).json();
    if (result.total === 101) break;
    assert.ok(attempt < 40, 'Expected the job to import all 101 distinct customers');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log('PASS CSV recovery after a committed chunk and page reopen');
} finally {
  await browser.close();
}
