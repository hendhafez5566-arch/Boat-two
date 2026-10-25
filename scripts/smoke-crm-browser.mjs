/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000',
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
  email: `crm-browser-${randomUUID()}@example.test`,
  password: randomUUID() + randomUUID(),
  fullName: 'CRM fixture',
  workspaceName: 'CRM acceptance',
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
  let failed = false;
  await page.route('**/crm/contacts?**', (route) => {
    if (!failed) {
      failed = true;
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto(web + '/dashboard/crm');
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', {name:'Add contact',exact:true}).click();
  const contactForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'New contact', exact: true }) });
  await contactForm.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser customer');
  await contactForm
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill('customer-fixture@example.test');
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/crm/contacts') && r.request().method() === 'POST',
    ),
    contactForm.getByRole('button', { name: 'Save contact', exact: true }).click(),
  ]);
  assert.equal(created.status(), 201);
  const contact = await created.json();
  await page.getByRole('button', { name: 'Browser customer', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Deals', exact: true }).click();
  const pipeline = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'New pipeline', exact: true }) });
  await pipeline.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser pipeline');
  await pipeline
    .getByRole('textbox', { name: 'Comma-separated stages', exact: true })
    .fill('New, Won');
  const [savedPipeline] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/crm/pipelines') && r.request().method() === 'POST',
    ),
    pipeline.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  assert.equal(savedPipeline.status(), 201);
  const p = await savedPipeline.json(),
    deal = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Create deal', exact: true }) });
  await deal.getByRole('textbox', { name: 'Title', exact: true }).fill('Browser deal');
  await deal.locator('select[name=contactId]').selectOption(contact.id);
  await deal.locator('select[name=pipelineId]').selectOption(p.id);
  await deal.getByRole('spinbutton', { name: 'Value', exact: true }).fill('125');
  const [savedDeal] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/crm/deals') && r.request().method() === 'POST'),
    deal.getByRole('button', { name: 'Create deal', exact: true }).click(),
  ]);
  assert.equal(savedDeal.status(), 201);
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const task = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'New follow-up', exact: true }) });
  await task.getByRole('textbox', { name: 'Task', exact: true }).fill('Browser follow-up');
  await task.locator('select[name=contactId]').selectOption(contact.id);
  await task.locator('input[name=dueAt]').fill('2026-10-24T12:00');
  const [savedTask] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/crm/tasks') && r.request().method() === 'POST'),
    task.getByRole('button', { name: 'Save follow-up', exact: true }).click(),
  ]);
  assert.equal(savedTask.status(), 201);
  await page.getByRole('button', { name: 'Contacts', exact: true }).click();
  const exported = page.waitForResponse(
    (r) => r.url().endsWith('/crm/jobs') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create snapshot export', exact: true }).click();
  assert.equal((await exported).status(), 201);
  const jobs = await call('/crm/jobs', undefined, a.accessToken);
  assert.ok(jobs.some((j) => j.kind === 'export'));
  for (let attempt = 0; attempt < 50; attempt++) {
    const progress = await call('/crm/jobs', undefined, a.accessToken);
    if (progress.some((j) => j.kind === 'export' && j.status === 'completed')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const jobPanel = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Contact import and export jobs', exact: true }),
  });
  await jobPanel.getByRole('button', { name: 'Refresh', exact: true }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    jobPanel.getByRole('button', { name: 'Download results', exact: true }).click(),
  ]);
  const payload = JSON.parse(await readFile(await file.path(), 'utf8'));
  assert.ok(payload.result.some((row) => row.name === 'Browser customer'));

  await page.getByRole('button', { name: 'Browser customer', exact: true }).click();
  await page.getByText('Export customer activity and consent', { exact: true }).click();
  const [activityResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/crm/jobs') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Create activity snapshot', exact: true }).click(),
  ]);
  assert.equal(activityResponse.status(), 201);
  const activityJob = await activityResponse.json();
  assert.equal(activityJob.kind, 'activity_export');
  for (let attempt = 0; attempt < 100; attempt++) {
    const currentJobs = await call('/crm/jobs', undefined, a.accessToken);
    if (currentJobs.find((j) => j.id === activityJob.id)?.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await jobPanel.getByRole('button', { name: 'Refresh', exact: true }).click();
  const activityCard = jobPanel.locator('article').filter({ hasText: 'Customer activity' });
  const [activityFile] = await Promise.all([
    page.waitForEvent('download'),
    activityCard.getByRole('button', { name: 'Download results', exact: true }).click(),
  ]);
  const activity = JSON.parse(await readFile(await activityFile.path(), 'utf8'));
  assert.equal(activity.contact_id, contact.id);
  assert.match(activity.history_semantics, /retained_observed/);
  assert.ok(activity.result.some((row) => row.kind === 'profile_history'));
  assert.ok(activity.result.some((row) => row.kind === 'task_current'));
  assert.ok(activity.result.some((row) => row.kind === 'deal_current'));

  await page.getByText('CRM history & job payload retention', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview cleanup', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm permanent cleanup', exact: true }).waitFor();
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + '/crm-history-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: shots + '/crm-history-mobile.png', fullPage: true });
  const tasks = await call('/crm/tasks', undefined, a.accessToken),
    deals = await call('/crm/deals', undefined, a.accessToken);
  assert.ok(tasks.items.some((x) => x.title === 'Browser follow-up'));
  assert.ok(deals.items.some((x) => x.title === 'Browser deal'));
  assert.deepEqual(errors, []);
  console.log(
    'CRM Chromium: network failure/retry, actual contact/pipeline/deal/task creation, snapshot/activity downloads, retained profile history and current work, retention preview, API persistence and desktop/mobile passed. Cleanup was not applied.',
  );
} finally {
  await browser.close();
}
