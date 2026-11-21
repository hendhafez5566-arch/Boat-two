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
assert.ok((await fetch(base + '/channels', {
  method: 'POST', headers, body: JSON.stringify({ type: 'web', name: 'CSV QA site' }),
})).ok);
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
      'Resume client ' + i + ',' + (i === 100 ? '' : 'resume-' + i + '@example.test'))].join('\n')),
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

  if (process.env.CRM_QA_FIRST_CONTACT === '1') {
    const request = async (path, body) => {
      const response = await fetch(base + path, {
        headers,
        ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      });
      assert.ok(response.ok, path + ' ' + response.status);
      return response.json();
    };
    const me = await request('/auth/me');
    const tenantId = me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
    const { channelId } = await request('/__qa/crm', { tenantId, op: 'outbound-channel' });
    const contact = await request('/crm/contacts', { name: 'Manual opt-in QA', phone: '+12025550137' });
    const profile = '/crm/contacts/' + contact.id + '/profile';
    assert.equal((await request(profile)).channels.length, 0);
    await page.goto('http://localhost:3000/dashboard/crm?contact=' + contact.id);
    const record = page.getByRole('region', { name: 'Customer profile', exact: true });
    await record.getByText('More details and settings', { exact: true }).click();
    await record.getByRole('button', { name: 'Marketing Consent', exact: true }).click();
    await record.getByLabel('Account', { exact: true }).selectOption(channelId);
    await record.getByLabel('Status', { exact: true }).selectOption('opted_in');
    await record.getByLabel('Consent evidence', { exact: true }).fill('Synthetic explicit consent');
    await record.getByRole('button', { name: 'Record Consent', exact: true }).click();
    await record.getByText('Synthetic explicit consent', { exact: true }).waitFor();
    await record.getByRole('button', { name: 'Overview', exact: true }).click();
    await record.getByRole('button', { name: 'Start conversation', exact: true }).click();
    await record.getByLabel('WhatsApp channel and template', { exact: true }).selectOption(channelId + ':qa_first_contact:en');
    page.once('dialog', (dialog) => dialog.accept());
    await record.getByRole('button', { name: 'Send template', exact: true }).click();
    await record.getByText('First message queued.', { exact: true }).waitFor();
    assert.equal((await request(profile)).timeline.conversations.length, 1);
    console.log('PASS recorded opt-in from an unlinked profile and queued the first template');
  }
} finally {
  await browser.close();
}
