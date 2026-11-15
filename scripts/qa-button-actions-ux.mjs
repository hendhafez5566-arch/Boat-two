/* global localStorage, document, innerWidth, innerHeight, getComputedStyle */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const apiBase = 'http://localhost:4000';
const webBase = 'http://localhost:3000';
const out = 'docs/enterprise-20261115/button-actions-acceptance';
mkdirSync(out, { recursive: true });
const ids = {
  connection: '11111111-1111-4111-8111-111111111111',
  list: '22222222-2222-4222-8222-222222222222',
  sequence: '33333333-3333-4333-8333-333333333333',
  department: '44444444-4444-4444-8444-444444444444',
  staff: '55555555-5555-4555-8555-555555555555',
};
const fixtures = {
  '/crm/fields': [{ key: 'interest', label: 'Interest' }],
  '/integrations': [{ id: ids.connection, provider: 'google', name: 'QA Google', enabled: true }],
  '/contact-lists': [{ id: ids.list, name: 'QA audience' }],
  '/sequences': [{ id: ids.sequence, name: 'QA follow-up', status: 'active' }],
  '/departments': [{ id: ids.department, name: 'QA Team', members: [ids.staff] }],
  '/team': { members: [{ user_id: ids.staff, full_name: 'QA Agent', email: 'agent@example.test' }] },
};
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(apiBase + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, path + ': ' + JSON.stringify(data));
  return data;
}
const session = await api('/auth/register', null, {
  email: randomUUID() + '@example.test',
  password: 'IsolatedQA-' + randomUUID(),
  fullName: 'Automation action UI QA',
  workspaceName: 'Automation action UI QA',
});
const channel = await api('/channels', session.accessToken, { type: 'web', name: 'QA local-only' });
await api('/workspace/onboarding/complete', session.accessToken, {});
const flow = await api('/flows', session.accessToken, { name: 'QA Seven Button Actions', channelIds: [channel.id] });
const graph = {
  startNodeId: 'interactive',
  nodes: [
    { id: 'interactive', type: 'interactive', position: { x: 200, y: 150 },
      data: { text: 'Choose an option', buttons: [{ id: 'choose', title: 'Continue', actions: [] }] },
      edges: { 'option:choose': 'end', fallback: 'end' } },
    { id: 'end', type: 'end', position: { x: 640, y: 150 }, data: {}, edges: {} },
  ],
};
await api('/flows/' + flow.id, session.accessToken, { graph, expectedUpdatedAt: flow.updated_at }, 'PATCH');
const browser = await chromium.launch({ executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = [];
async function openPage(language, width) {
  const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 936 } });
  await context.addInitScript(({ session, language }) => {
    localStorage.setItem('session', JSON.stringify(session));
    localStorage.setItem('boat-language', language);
  }, { session, language });
  const page = await context.newPage();
  page.setDefaultTimeout(17000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [path, data] of Object.entries(fixtures)) {
    await page.route('**' + path, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
  }
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.goto(webBase + '/dashboard/flows/' + flow.id);
  await page.locator('.react-flow__node').filter({ hasText: 'Continue' }).last().click();
  const title = language === 'ar' ? 'إعداد الاختيار' : 'Configure Reply';
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.waitFor();
  await dialog.getByText(language === 'ar'
    ? 'ماذا تريد أن يحدث تلقائيًا عندما يختار العميل هذا الرد؟'
    : 'What should happen automatically when the customer chooses this reply?', { exact: true }).waitFor();
  return { page, dialog, context, errors };
}
async function add(dialog, type, english, arabic, groupEn, groupAr, language) {
  const group = language === 'ar' ? groupAr : groupEn;
  if (!(await dialog.getByRole('button', { name: language === 'ar' ? 'إضافة ' + arabic : 'Add ' + english }).isVisible())) {
    await dialog.getByRole('button', { name: group, exact: true }).click();
  }
  await dialog.getByRole('button', { name: language === 'ar' ? 'إضافة ' + arabic : 'Add ' + english }).click();
  const item = dialog.locator('section[class*="actionItem"]').last();
  assert.equal(await item.locator('button[aria-expanded]').first().getAttribute('aria-expanded'), 'true');
  const opened = await dialog.locator('section[class*="actionItem"] > button[aria-expanded="true"]').count();
  assert.equal(opened, 1, 'only one expanded action at a time');
  return item;
}
const labels = [
  { type: 'set_field', en: 'Save custom field', ar: 'حفظ حقل مخصص', groupEn: 'Customer data and organization', groupAr: 'بيانات العميل وتصنيفه' },
  { type: 'tag', en: 'Add / remove labels', ar: 'إضافة / إزالة وسوم', groupEn: 'Customer data and organization', groupAr: 'بيانات العميل وتصنيفه' },
  { type: 'list', en: 'Add / remove list membership', ar: 'إضافة / إزالة من قائمة', groupEn: 'Customer data and organization', groupAr: 'بيانات العميل وتصنيفه' },
  { type: 'sequence', en: 'Subscribe / unsubscribe sequence', ar: 'اشتراك / إلغاء تسلسل', groupEn: 'Follow-up and conversation routing', groupAr: 'المتابعة وتحويل المحادثة' },
  { type: 'assign', en: 'Assign employee or department', ar: 'تحويل لموظف أو قسم', groupEn: 'Follow-up and conversation routing', groupAr: 'المتابعة وتحويل المحادثة' },
  { type: 'integration', en: 'Update a sheet or book an appointment', ar: 'تحديث جدول أو حجز موعد', groupEn: 'Connected systems', groupAr: 'الربط مع أنظمة أخرى' },
  { type: 'webhook', en: 'Send data to another system', ar: 'إرسال البيانات لنظام خارجي', groupEn: 'Connected systems', groupAr: 'الربط مع أنظمة أخرى' },
];
try {
  // Full real UI create/edit/save/reopen journey on an isolated tenant.
  const { page, dialog, context, errors } = await openPage('en', 1366);
  for (const entry of labels) {
    const item = await add(dialog, entry.type, entry.en, entry.ar, entry.groupEn, entry.groupAr, 'en');
    if (entry.type === 'set_field') {
      await item.getByRole('button', { name: 'New field name or advanced setting' }).click();
      await item.getByLabel('Technical field key').fill('qa_interest');
      await item.getByLabel('Value (supports variables)').fill('travel');
    }
    if (entry.type === 'tag') {
      const input = item.getByLabel('Add labels — comma separated');
      await input.fill('lead, qa');
      await input.press('Tab');
    }
    if (entry.type === 'list') {
      await item.getByLabel('List', { exact: true }).selectOption(ids.list);
      await item.getByLabel('Operation', { exact: true }).selectOption('remove');
      await item.getByLabel('Operation', { exact: true }).selectOption('add');
    }
    if (entry.type === 'sequence') {
      await item.getByLabel('Sequence', { exact: true }).selectOption(ids.sequence);
      await item.getByLabel('Operation', { exact: true }).selectOption('unsubscribe');
      await item.getByLabel('Operation', { exact: true }).selectOption('subscribe');
    }
    if (entry.type === 'assign') {
      await item.getByLabel('Department (optional)').selectOption(ids.department);
      await item.getByLabel('Employee (optional)').selectOption(ids.staff);
    }
    if (entry.type === 'integration') {
      await item.getByLabel('Authorized connection').selectOption(ids.connection);
      await item.getByLabel('Event Title').fill('QA appointment');
      await item.getByLabel(/Start, e.g./).fill('2026-12-25T14:30:00+02:00');
      await item.getByLabel('End with UTC offset').fill('2026-12-25T15:30:00+02:00');
    }
    if (entry.type === 'webhook') {
      await item.getByLabel('HTTPS URL — requires data owner authorization').fill('https://example.test/button-hook');
      await item.getByLabel('Request body (optional variables)').fill('{"source":"qa"}');
    }
  }
  assert.equal(await dialog.locator('section[class*="actionItem"]').count(), 7);
  await page.screenshot({ path: out + '/created-seven-en-1366.png' });
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('All changes saved', { exact: true }).waitFor();
  const saved = await api('/flows/' + flow.id, session.accessToken);
  const actions = saved.draft_graph.nodes.find(n => n.id === 'interactive').data.buttons[0].actions;
  assert.deepEqual(actions.map(a => a.type), labels.map(e => e.type));
  assert.equal(actions[0].key, 'qa_interest');
  assert.deepEqual(actions[1].add, ['lead', 'qa']);
  assert.equal(actions[2].listId, ids.list);
  assert.equal(actions[3].sequenceId, ids.sequence);
  assert.equal(actions[4].userId, ids.staff);
  assert.equal(actions[5].connectionId, ids.connection);
  assert.equal(actions[6].url, 'https://example.test/button-hook');
  assert.deepEqual(errors, []);
  results.push({ test: 'create-edit-save-seven', status: 'PASS' });
  await context.close();

  // Actual reload/reopen and screenshot review inputs across five widths in both locales.
  for (const language of ['ar', 'en']) for (const width of [320, 390, 768, 1366, 1920]) {
    const { page: p, dialog: d, context: ctx, errors: browserErrors } = await openPage(language, width);
    assert.equal(await d.locator('section[class*="actionItem"]').count(), 7, 'reopen persisted actions');
    assert.equal(await p.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
    await d.screenshot({ path: out + '/reopen-' + language + '-' + width + '.png' });
    // Test both DOM horizontal overflow and visible action control hit targets, no forced clicks.
    assert.ok(await d.evaluate(el => el.scrollWidth <= el.clientWidth + 2), 'dialog must not overflow sideways');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'page must not overflow sideways');
    const actionHeading = d.locator('section[class*="actionItem"]').last().locator('button[aria-expanded]').first();
    await actionHeading.click();
    assert.equal(await actionHeading.getAttribute('aria-expanded'), 'true');
    const controls = d.locator('section[class*="actionItem"]').last().getByRole('button', { name: language === 'ar' ? 'إزالة الإجراء' : 'Remove action' });
    const box = await controls.boundingBox();
    assert.ok(box && box.width >= 40 && box.height >= 40, 'action controls must be touch-sized');
    assert.deepEqual(browserErrors, [], 'no browser page errors');
    results.push({ language, width, reopened: 7, overflow: false, actionClick: true, status: 'PASS' });
    await ctx.close();
  }
  writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ status: 'PASS', cases: results.length, kinds: labels.map(x => x.type) }));
} finally {
  await browser.close();
}