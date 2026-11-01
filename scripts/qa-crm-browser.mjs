/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
const local = createRequire(import.meta.url);
const { chromium } = local(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const { Workbook } = createRequire(new URL('../apps/api/package.json', import.meta.url))('exceljs');
const base = 'http://127.0.0.1:4000',
  web = 'http://localhost:3000',
  out = process.env.BOAT_CRM_QA_OUT || 'docs/acceptance/2026-11-01-crm';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [],
  tenants = [];
async function call(path, body, token, method = body ? 'POST' : 'GET', expected) {
  const start = performance.now();
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (expected) assert.equal(r.status, expected, path + JSON.stringify(data));
  else assert.ok(r.ok, path + JSON.stringify(data));
  return { data, ms: Math.round(performance.now() - start) };
}
const req = async (...args) => (await call(...args)).data;
async function fixture(tenantId, op, extra = {}) {
  return req('/__qa/crm', { tenantId, op, ...extra });
}
let activePage;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BOAT_CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  for (const [i, business] of ['Travel', 'Restaurant', 'Store'].entries()) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('boat-language')) localStorage.setItem('boat-language', 'en');
    });
    await page.goto(web + '/register');
    await page.locator('input[name=fullName]').fill(business + ' Owner');
    await page
      .locator('input[name=workspaceName]')
      .fill('CRM ' + business + ' ' + randomUUID().slice(0, 6));
    await page.locator('input[name=email]').fill(randomUUID() + '@example.test');
    await page.locator('input[name=password]').fill('Synthetic-' + randomUUID());
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.waitForURL('**/dashboard/onboarding');
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
    const token = session.accessToken;
    const me = await req('/auth/me', null, token);
    const tenantId =
      me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
    assert.ok(tenantId, 'tenant from me');
    await req('/channels', { type: 'web', name: business + ' QA Web' }, token);
    await req('/workspace/onboarding/complete', {}, token);
    const members = await req('/crm/workspace/members', null, token);
    const ownerId = members.currentUserId;
    const invitation = await req(
      '/team/invitations',
      { email: randomUUID() + '@example.test', role: 'agent', sendEmail: false },
      token,
    );
    const agent = await req('/auth/accept-invitation', {
      token: new URL(invitation.inviteUrl).searchParams.get('token'),
      password: 'Synthetic-' + randomUUID(),
      fullName: business + ' Agent',
    });
    const agentId = (await req('/crm/workspace/members', null, agent.accessToken)).currentUserId;
    await page.goto(web + '/dashboard/crm');
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    const form = page
      .locator('form')
      .filter({ has: page.getByRole('heading', { name: 'New contact', exact: true }) });
    await form.getByLabel('Name', { exact: true }).fill(business + ' Customer');
    await form.getByLabel('Email', { exact: true }).fill(business.toLowerCase() + '@example.test');
    await form.getByRole('button', { name: 'Save contact', exact: true }).click();
    await page.getByRole('button', { name: business + ' Customer', exact: true }).waitFor();
    let contact = (await req('/crm/contacts', null, token)).items.find(
      (c) => c.name === business + ' Customer',
    );
    assert.ok(contact);
    const phone = '20100000000' + i;
    await req(
      '/crm/contacts/' + contact.id + '/profile',
      {
        phone,
        attributes: { company: 'Shared Company', source: business + ' campaign' },
        expectedUpdatedAt: contact.updated_at,
      },
      token,
      'PATCH',
    );
    contact = await req('/crm/contacts/' + contact.id, null, token);
    await req('/crm/contacts', { name: 'Duplicate', phone: '+' + phone }, token, 'POST', 409);
    const pipeline = await req(
      '/crm/pipelines',
      { name: business + ' sales', stages: ['New', 'Qualified', 'Proposal'] },
      token,
    );
    await page.getByRole('link', { name: 'Pipeline', exact: true }).click();
    await page.getByRole('button', { name: 'Add opportunity', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'New opportunity', exact: true });
    await dialog.getByLabel('Customer', { exact: true }).selectOption(contact.id);
    await dialog.getByLabel('Title', { exact: true }).fill(business + ' Opportunity');
    await dialog.getByLabel('Value', { exact: true }).fill('1250.50');
    await dialog.getByLabel('Assigned employee', { exact: true }).selectOption(agentId);
    await dialog.getByLabel('Expected close', { exact: true }).fill('2026-12-15');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: business + ' Opportunity', exact: true }).waitFor();
    let deal = (await req('/crm/deals?contactId=' + contact.id, null, token)).items[0];
    assert.equal(deal.owner_id, agentId);
    assert.equal(Number(deal.value_cents), 125050);
    assert.equal(deal.expected_close.slice(0, 10), '2026-12-15');
    const drop = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /^Proposal / }) })
      .last();
    const moved = page.waitForResponse(
      (r) => r.url().endsWith('/crm/deals/' + deal.id) && r.request().method() === 'PATCH',
    );
    await page
      .getByRole('article')
      .filter({ hasText: business + ' Opportunity' })
      .dragTo(drop);
    assert.ok((await moved).ok(), 'drag and drop persisted');
    await page
      .getByRole('combobox', { name: 'Stage: ' + business + ' Opportunity', exact: true })
      .selectOption('Qualified');
    await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
    let changed = (await req('/crm/deals?contactId=' + contact.id, null, token)).items[0];
    assert.equal(changed.stage, 'Qualified');
    await req(
      '/crm/deals/' + deal.id,
      { stage: 'Proposal', expectedUpdatedAt: deal.updated_at },
      token,
      'PATCH',
      400,
    );
    await req('/crm/deals/' + deal.id, { ownerId: ownerId }, agent.accessToken, 'PATCH', 403);
    await req(
      '/crm/deals/' + deal.id,
      { status: 'won', expectedUpdatedAt: changed.updated_at },
      agent.accessToken,
      'PATCH',
    );
    await req('/crm/deals/' + deal.id, { expectedClose: '2026-02-31' }, token, 'PATCH', 400);
    await page.getByRole('button', { name: 'Table view', exact: true }).click();
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('won');
    await page.getByRole('cell', { name: business + ' Customer', exact: true }).waitFor();
    if (i === 0) await page.screenshot({ path: out + '/pipeline-table-en.jpg', quality: 75 });
    await page.getByRole('link', { name: 'Tasks & follow-ups', exact: true }).click();
    await page.getByRole('button', { name: 'Add follow-up', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'New follow-up', exact: true });
    await dialog.getByLabel('Customer', { exact: true }).selectOption(contact.id);
    await dialog.getByLabel('Title', { exact: true }).fill(business + ' Follow-up');
    await dialog.getByLabel('Follow-up date', { exact: true }).fill('2026-01-01T12:00');
    await dialog.getByLabel('Assigned employee', { exact: true }).selectOption(agentId);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: business + ' Follow-up', exact: true }).waitFor();
    await page
      .getByRole('combobox', { name: 'Due date filter', exact: true })
      .selectOption('overdue');
    await page.getByRole('heading', { name: business + ' Follow-up', exact: true }).waitFor();
    const task = (await req('/crm/tasks?contactId=' + contact.id, null, token)).items[0];
    await req('/crm/tasks/' + task.id, { assignedTo: ownerId }, agent.accessToken, 'PATCH', 403);
    await req(
      '/crm/tasks/' + task.id,
      { status: 'done', expectedUpdatedAt: task.updated_at },
      agent.accessToken,
      'PATCH',
    );
    await req(
      '/crm/tasks/' + task.id,
      { title: 'Stale', expectedUpdatedAt: task.updated_at },
      token,
      'PATCH',
      400,
    );
    await page.goto(web + '/dashboard/crm?contact=' + contact.id);
    await page.getByRole('button', { name: 'Opportunities', exact: true }).click();
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('won');
    await page.getByRole('heading', { name: business + ' Opportunity', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Company', exact: true }).click();
    await page
      .getByRole('link', { name: business + ' Customer', exact: true })
      .last()
      .waitFor();
    const related = await req(
      '/crm/workspace/company-contacts?company=Shared%20Company',
      null,
      token,
    );
    assert.equal(related.length, 1);
    if (i === 0) await page.screenshot({ path: out + '/customer-360-en.jpg', quality: 75 });
    // Real existing import jobs, row rejection and atomic identity protection.
    await page.goto(web + '/dashboard/crm');
    await page.getByRole('button', { name: 'Export/Import', exact: true }).click();
    await page.getByRole('button', { name: 'Import and manage files', exact: true }).click();
    dialog = page.getByRole('dialog');
    const book = new Workbook();
    book.addWorksheet('Customers').addRows([
      ['Name', 'Email', 'Phone', 'Company', 'Source'],
      [business + ' Imported', 'import-' + i + '@example.test', '', 'Shared Company', 'Excel'],
      ['Duplicate row', business.toLowerCase() + '@example.test', '', 'Shared Company', 'Excel'],
    ]);
    await dialog
      .locator('input[type=file]')
      .first()
      .setInputFiles({
        name: 'customers.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await book.xlsx.writeBuffer()),
      });
    await dialog.getByRole('button', { name: 'Confirm and start import', exact: true }).waitFor();
    if (i === 0) await page.screenshot({ path: out + '/import-preview-en.jpg', quality: 75 });
    await dialog.getByRole('button', { name: 'Confirm and start import', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Import queued' }).waitFor();
    await fixture(tenantId, 'jobs');
    const jobs = await req('/crm/jobs', null, token);
    assert.equal(jobs[0].succeeded, 1);
    assert.equal(jobs[0].errors.length, 1);
    assert.ok(
      (await req('/crm/contacts?q=Imported', null, token)).items.some(
        (c) => c.name === business + ' Imported',
      ),
    );
    await page.goto(web + '/dashboard/crm?contact=' + contact.id);
    await page.getByRole('button', { name: 'Company', exact: true }).click();
    await page.getByRole('link', { name: business + ' Imported', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('contact') !== contact.id);
    await page.getByRole('heading', { name: business + ' Imported', exact: true }).waitFor();
    // Real incoming message handler, with external delivery disabled.
    await fixture(tenantId, 'inbound', { phone });
    const profile = await req('/crm/contacts/' + contact.id + '/profile', null, token);
    assert.equal(profile.timeline.conversations.length, 1);
    const cv = profile.timeline.conversations[0];
    await req(
      '/conversations/' + cv.id,
      { handledBy: 'human', assignedTo: agentId },
      token,
      'PATCH',
    );
    assert.equal((await req('/conversations/' + cv.id, null, token)).assigned_to, agentId);
    await page.goto(web + '/dashboard/inbox?conversation=' + cv.id);
    await page
      .getByRole('button', { name: new RegExp(business + ' Customer') })
      .first()
      .click();
    await page.getByText('Local inbound only', { exact: true }).waitFor();
    // Existing automation engine, same domain event replayed twice must create only one deal.
    await req(
      '/automations',
      {
        name: 'CRM interest to opportunity',
        enabled: true,
        trigger: 'crm.contacts.update',
        conditions: { tag: 'interested' },
        actions: [
          {
            type: 'deal',
            pipelineId: pipeline.id,
            stage: 'New',
            title: 'Automated interest',
            valueCents: 0,
            currency: 'EGP',
          },
        ],
      },
      token,
    );
    contact = await req('/crm/contacts/' + contact.id, null, token);
    await req(
      '/crm/contacts/' + contact.id + '/profile',
      { tags: ['interested'], expectedUpdatedAt: contact.updated_at },
      token,
      'PATCH',
    );
    await fixture(tenantId, 'automation', { contactId: contact.id });
    assert.equal(
      (await req('/crm/deals?contactId=' + contact.id + '&q=Automated', null, token)).total,
      1,
    );
    const or = await req(
      '/crm/workspace/search',
      { conditions: { anyOf: [{ tag: 'interested' }, { q: 'Imported' }] } },
      token,
    );
    assert.equal(or.total, 2);
    const and = await req(
      '/crm/workspace/search',
      { conditions: { allOf: [{ tag: 'interested' }, { q: 'Imported' }] } },
      token,
    );
    assert.equal(and.total, 0);
    await req(
      '/crm/workspace/views',
      {
        name: 'Interested or imported',
        conditions: { anyOf: [{ tag: 'interested' }, { q: 'Imported' }] },
      },
      token,
    );
    await req('/crm/contacts/' + contact.id + '/archive', { archived: true }, token, 'PATCH');
    assert.equal((await req('/crm/contacts?q=' + business + '%20Customer', null, token)).total, 0);
    await req('/crm/contacts/' + contact.id + '/archive', { archived: false }, token, 'PATCH');
    const report = await req('/crm/workspace/report', null, token);
    assert.equal(report.contacts.total, 2);
    assert.equal(report.sales.find((x) => x.status === 'won').value_cents, '125050');
    await req('/crm/workspace/report', null, agent.accessToken, 'GET', 403);
    await req('/crm/workspace/import-preview', {}, agent.accessToken, 'POST', 403);
    await page.goto(web + '/dashboard/crm/reports');
    await page.getByRole('heading', { name: 'Team performance', exact: true }).waitFor();
    if (i === 0) await page.screenshot({ path: out + '/reports-en.jpg', quality: 75 });
    for (const previous of tenants) {
      await req('/crm/contacts/' + previous.contactId, null, token, 'GET', 404);
      await req('/crm/deals/' + previous.dealId, { stage: 'New' }, token, 'PATCH', 404);
      assert.equal(
        (await req('/crm/workspace/company-contacts?company=Shared%20Company', null, token)).length,
        2,
      );
    }
    await page.goto(web + '/dashboard/crm/advanced');
    await page
      .getByRole('heading', { name: 'Smart segments & saved views', exact: true })
      .waitFor();
    await page.getByRole('textbox', { name: 'Condition value', exact: true }).fill('interested');
    await page.getByRole('button', { name: 'Show results', exact: true }).click();
    await page
      .getByRole('link', { name: business + ' Customer', exact: true })
      .first()
      .waitFor();
    await page.getByLabel('View name', { exact: true }).fill('UI interested');
    await page.getByRole('button', { name: 'Save view', exact: true }).click();
    await page.getByRole('button', { name: 'UI interested', exact: true }).waitFor();
    assert.ok(
      (await req('/crm/workspace/views', null, token)).some((v) => v.name === 'UI interested'),
    );
    assert.equal(
      (await req('/crm/segments', null, token)).length,
      0,
      'smart views cannot widen legacy campaign audiences',
    );
    await page.goto(web + '/dashboard/automations');
    await page
      .getByRole('button', { name: 'CRM interest to opportunity · Edit and review', exact: true })
      .click();
    await page.getByLabel('Title', { exact: true }).fill('Edited automatic opportunity');
    const savedRule = page.waitForResponse(
      (r) => r.url().includes('/automations/') && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save sequence', exact: true }).click();
    assert.ok(
      (await savedRule).ok(),
      'new deal action can be edited by the existing workflow editor',
    );
    assert.equal(
      (await req('/automations', null, token)).find((r) => r.name === 'CRM interest to opportunity')
        .actions[0].title,
      'Edited automatic opportunity',
    );
    // Thousands of synthetic rows in each isolated schema tenancy, direct fixture for load only.
    await fixture(tenantId, 'seed');
    const loaded = await call('/crm/contacts?limit=100&page=30', null, token);
    assert.equal(loaded.data.items.length, 100);
    assert.equal(loaded.data.total, 3002);
    const filtered = await call('/crm/contacts?q=Load%20customer%20299', null, token);
    assert.equal(filtered.data.total, 11);
    checks.push({
      business,
      contacts: 3002,
      listPage30Ms: loaded.ms,
      filteredMs: filtered.ms,
      ui: 'customer/deal/stage/task/company/import/report',
      api: 'dedupe/concurrency/agent/RLS/inbound/automation/archive/3000 rows',
    });
    await page.goto(web + '/dashboard/crm/pipeline');
    await page.getByRole('heading', { name: 'Automated interest', exact: true }).waitFor();
    if (i === 0) await page.screenshot({ path: out + '/pipeline-board-en.jpg', quality: 75 });
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'العربية / English', exact: true }).click();
    await page.getByRole('heading', { name: 'فرص البيع', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await page.setViewportSize({ width: 390, height: 844 });
    if (i === 0) await page.screenshot({ path: out + '/pipeline-ar-mobile.jpg', quality: 75 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
      'page has no horizontal overflow',
    );
    await page.goto(web + '/dashboard/crm/tasks');
    await page.getByRole('heading', { name: 'المهام والمتابعات', exact: true }).waitFor();
    if (i === 0) await page.screenshot({ path: out + '/tasks-ar-mobile.jpg', quality: 75 });
    tenants.push({ contactId: contact.id, dealId: deal.id });
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/results.json',
    JSON.stringify({ status: 'PASS', checks, pageErrors: errors }, null, 2),
  );
  console.log('CRM_ACCEPTANCE_PASS', JSON.stringify(checks));
} catch (e) {
  if (activePage) {
    await activePage.screenshot({ path: '/tmp/boat-crm-failure.jpg' });
    console.error((await activePage.locator('body').innerText()).slice(-10000));
  }
  throw e;
} finally {
  await browser.close();
}
