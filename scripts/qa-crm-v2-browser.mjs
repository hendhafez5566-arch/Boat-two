/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { openSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const out = 'docs/acceptance/2026-11-01-crm-v2';
mkdirSync(out, { recursive: true });
const children = [];
let browser;
const checks = [],
  errors = [];
function start(args, cwd, label, env = {}) {
  const log = openSync('/tmp/crmv2-' + label + '.log', 'w');
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
  });
  children.push(child);
  return child;
}
const root = process.cwd(),
  next = root + '/apps/web/node_modules/next/dist/bin/next';
async function ready(url) {
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* service is starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error('Not ready ' + url);
}
const req = async (path, token, body, method = body ? 'POST' : 'GET', expected) => {
  const r = await fetch('http://127.0.0.1:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  if (expected) assert.equal(r.status, expected, path + JSON.stringify(d));
  else assert.ok(r.ok, path + JSON.stringify(d));
  return d;
};
try {
  start(['scripts/qa-full-api.mjs'], root, 'api-browser', {
    BOAT_CLOUD_REVIEW: 'true',
    BOAT_CRM_QA: 'true',
  });
  await ready('http://127.0.0.1:4000/health');
  start([next, 'start', '-p', '3000'], '/tmp/boat-crm-v2-before/apps/web', 'before');
  start([next, 'start', '-p', '3001'], root + '/apps/web', 'after');
  await Promise.all([ready('http://localhost:3000/login'), ready('http://localhost:3001/login')]);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BOAT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  for (const [index, sector] of ['Travel', 'Restaurant', 'Store'].entries()) {
    const session = await req('/auth/register', null, {
      email: randomUUID() + '@example.test',
      password: 'Synthetic-' + randomUUID(),
      fullName: 'V2 ' + sector + ' Owner',
      workspaceName: 'CRM V2 ' + sector,
    });
    const token = session.accessToken;
    const member = await req('/crm/workspace/members', token);
    const ownerId = member.currentUserId;
    await req(
      '/workspace',
      token,
      {
        name: 'CRM V2 ' + sector,
        industry: sector,
        timezone: 'Africa/Cairo',
        language: 'ar',
        preferredPlan: 'pro',
      },
      'PATCH',
    );
    const channel = await req('/channels', token, {
      type: 'web',
      name: 'QA ' + sector + ' Webchat',
    });
    await req('/workspace/onboarding/complete', token, {});
    const one = await req('/crm/contacts', token, {
      name: 'QA ' + sector + ' Customer',
      email: sector.toLowerCase() + '@example.test',
      lifecycle: 'qualified',
      tags: ['interested'],
      ownerId,
      attributes: { source: 'Website' },
    });
    await req('/crm/contacts', token, {
      name: 'QA ' + sector + ' New Lead',
      email: sector.toLowerCase() + '-lead@example.test',
      attributes: { source: 'Campaign' },
    });
    const pipeline = await req('/crm/pipelines', token, {
      name: 'QA Sales',
      stages: ['جديدة', 'مؤهلة', 'عرض سعر'],
    });
    const deal = await req('/crm/deals', token, {
      contactId: one.id,
      pipelineId: pipeline.id,
      title: 'QA ' + sector + ' Opportunity',
      stage: 'جديدة',
      valueCents: 125000,
      currency: 'EGP',
      ownerId,
    });
    await req('/crm/deals', token, {
      contactId: one.id,
      pipelineId: pipeline.id,
      title: 'QA USD Opportunity',
      stage: 'مؤهلة',
      valueCents: 50000,
      currency: 'USD',
      ownerId,
    });
    const task = await req('/crm/tasks', token, {
      contactId: one.id,
      title: 'QA ' + sector + ' follow-up',
      dueAt: new Date(Date.now() - 3600000).toISOString(),
      assignedTo: ownerId,
      priority: 'high',
    });
    const flow = await req('/flows', token, {
      name: 'QA ' + sector + ' Bot',
      language: 'ar',
      channelIds: [channel.id],
    });
    await req(
      '/flows/' + flow.id,
      token,
      {
        channelIds: [channel.id],
        graph: {
          startNodeId: 'ask',
          nodes: [
            {
              id: 'ask',
              type: 'question',
              data: {
                text: 'QA CRM V2 الاسم؟',
                answerType: 'text',
                saveAs: 'name',
                saveToSystem: 'name',
              },
              edges: { ok: 'reply' },
            },
            {
              id: 'reply',
              type: 'message',
              data: { text: 'QA CRM V2 bot response' },
              edges: { next: 'end' },
            },
            { id: 'end', type: 'end', data: {}, edges: {} },
          ],
        },
      },
      'PATCH',
    );
    await req('/flows/' + flow.id + '/publish', token, {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.addInitScript((s) => {
      localStorage.setItem('session', JSON.stringify(s));
      localStorage.setItem('boat-language', 'ar');
    }, session);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(e.message));
    const go = async (path, base = 'http://localhost:3001') => {
      await page.goto(base + path);
      await page.waitForLoadState('networkidle');
    };
    const shot = async (name) =>
      page.screenshot({ path: out + '/' + name + '.jpg', quality: 78, fullPage: false });
    const visitor = await context.newPage();
    await visitor.goto('http://localhost:3001/widget-demo.html?key=' + channel.external_id);
    await visitor.getByRole('button', { name: 'تحدث معنا', exact: true }).click();
    await visitor.getByRole('textbox', { name: 'اكتب رسالة', exact: true }).fill('QA hello');
    await visitor.getByRole('button', { name: 'إرسال', exact: true }).click();
    await visitor.getByText('QA CRM V2 الاسم؟', { exact: true }).waitFor();
    await visitor
      .getByRole('textbox', { name: 'اكتب رسالة', exact: true })
      .fill('QA ' + sector + ' Visitor');
    await visitor.getByRole('button', { name: 'إرسال', exact: true }).click();
    await visitor.getByText('QA CRM V2 bot response', { exact: true }).waitFor();
    const conversations = await req('/conversations', token);
    const conversation = conversations.items[0];
    assert.ok(conversation);
    checks.push(sector + ': real widget bot question saves CRM identity and returns response');
    // Same seeded records and API for both versions; these are local Chromium screenshots.
    if (index === 0) {
      for (const version of ['before', 'after']) {
        const base = 'http://localhost:' + (version === 'before' ? '3000' : '3001');
        await go(version === 'before' ? '/dashboard' : '/dashboard/crm/overview', base);
        await shot(version + '-dashboard-ar');
        await go('/dashboard/crm', base);
        await page
          .getByRole('button', { name: 'QA ' + sector + ' Customer', exact: true })
          .waitFor();
        await shot(version + '-customers-ar');
        await page.getByRole('button', { name: 'QA ' + sector + ' Customer', exact: true }).click();
        await page
          .getByRole('heading', { name: 'QA ' + sector + ' Customer', exact: true })
          .waitFor();
        await page.waitForLoadState('networkidle');
        await shot(version + '-customer360-ar');
        await go('/dashboard/crm/pipeline', base);
        await page.getByRole('button', { name: deal.title, exact: true }).waitFor();
        await shot(version + '-pipeline-ar');
        await go('/dashboard/crm/tasks', base);
        await page.getByRole('button', { name: task.title, exact: true }).waitFor();
        await shot(version + '-tasks-ar');
        await go('/dashboard/crm/reports', base);
        await shot(version + '-reports-ar');
        await go(
          '/dashboard/inbox?conversation=' + conversation.id + '&channelId=' + channel.id,
          base,
        );
        await page.getByRole('textbox', { name: 'محرر الرد', exact: true }).waitFor();
        await shot(version + '-inbox-crm-ar');
        await go('/dashboard/crm/advanced', base);
        await shot(version + '-settings-ar');
        await page.setViewportSize({ width: 390, height: 844 });
        await go('/dashboard/crm', base);
        await shot(version + '-mobile-ar');
        await page.setViewportSize({ width: 1440, height: 1100 });
      }
    }
    await go('/dashboard/crm/overview');
    await page.getByRole('heading', { name: 'كل فرصة تبدأ بعلاقة.', exact: true }).waitFor();
    await page.getByRole('link').filter({ hasText: 'دون مسؤول' }).click();
    await page.getByRole('button', { name: 'QA ' + sector + ' New Lead', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'QA ' + sector + ' Customer', exact: true }).count(),
      0,
    );
    checks.push(sector + ': dashboard unassigned drilldown matches real rows');
    await go('/dashboard/crm?create=true');
    const form = page.getByRole('dialog');
    await form.getByLabel('الاسم', { exact: true }).fill('QA ' + sector + ' UI customer');
    await form
      .getByLabel('البريد', { exact: true })
      .fill(sector.toLowerCase() + '-ui@example.test');
    await form.getByRole('button', { name: 'حفظ العميل', exact: true }).click();
    await page
      .getByRole('button', { name: 'QA ' + sector + ' UI customer', exact: true })
      .waitFor();
    checks.push(sector + ': actual UI customer form/save');
    await go('/dashboard/crm/pipeline');
    const card = page.locator('article[draggable=true]').filter({ hasText: deal.title });
    await card.dragTo(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'عرض سعر 0', exact: true }) })
        .last(),
    );
    await page.getByRole('combobox', { name: 'مرحلة: ' + deal.title, exact: true }).waitFor();
    await page.waitForFunction(
      (title) =>
        Array.from(document.querySelectorAll('select')).find(
          (el) => el.getAttribute('aria-label') === 'مرحلة: ' + title,
        )?.value === 'عرض سعر',
      deal.title,
    );
    await page
      .getByRole('combobox', { name: 'مرحلة: ' + deal.title, exact: true })
      .selectOption('مؤهلة');
    await page.getByText('تم الحفظ', { exact: true }).waitFor();
    const saved = (await req('/crm/deals?pipelineId=' + pipeline.id, token)).items.find(
      (d) => d.id === deal.id,
    );
    assert.equal(saved.stage, 'مؤهلة');
    checks.push(sector + ': Kanban drag and accessible stage change persist');
    await go('/dashboard/crm/tasks?period=overdue');
    await page.getByRole('button', { name: task.title, exact: true }).waitFor();
    await page.getByRole('button', { name: 'إكمال المتابعة', exact: true }).click();
    await page.getByText('تم الحفظ', { exact: true }).waitFor();
    assert.equal((await req('/crm/tasks?status=done', token)).items[0].id, task.id);
    checks.push(sector + ': overdue filter and completion reflected in API');
    await go('/dashboard/crm/reports');
    await page.getByRole('combobox', { name: 'فترة التقرير', exact: true }).selectOption('7');
    await page.waitForLoadState('networkidle');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'تصدير CSV', exact: true }).click();
    const dl = await downloadPromise;
    await dl.saveAs(out + '/' + sector + '-report.csv');
    checks.push(sector + ': date preset and filtered CSV download');
    await go('/dashboard/crm?contact=' + one.id);
    await page.getByRole('button', { name: 'متابعة', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('heading', { name: 'متابعة جديدة', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Close / إغلاق', exact: true }).click();
    await page.getByRole('button', { name: 'النشاط', exact: true }).click();
    assert.equal(
      await page.locator('aside').getByText('crm.crm_contacts.update', { exact: true }).count(),
      0,
    );
    checks.push(sector + ': Customer360 quick follow-up and readable timeline');
    if (index === 0) {
      await page.setViewportSize({ width: 768, height: 1024 });
      await go('/dashboard/crm/overview');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shot('after-tablet-ar');
      await page.setViewportSize({ width: 390, height: 844 });
      await go('/dashboard/crm/overview');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shot('after-dashboard-mobile-ar');
      await page.setViewportSize({ width: 1440, height: 1100 });
      await go('/dashboard/crm/segments');
      await shot('after-segments-ar');
      await page.getByRole('button', { name: 'قائمة الحساب', exact: true }).click();
      await page.getByRole('menuitem', { name: 'العربية / English', exact: true }).click();
      await go('/dashboard/crm/reports');
      await shot('after-reports-en');
      checks.push('RTL mobile/tablet no document overflow; English reports render');
    }
    if (index === 2) {
      const me = await req('/auth/me', token);
      const tenantId = me.workspaces[0].tenant_id;
      await req('/__qa/crm', null, { tenantId, op: 'seed' });
      const start = Date.now();
      const data = await req('/crm/contacts?limit=100&page=2', token);
      assert.equal(data.items.length, 100);
      assert.ok(data.total >= 3000);
      assert.ok(Date.now() - start < 15000);
      checks.push('Store:3000-record paging under15s in isolated database');
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + '/browser-results.json',
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        errors,
        limits: [
          'Local Chromium with real API; not Cloud Browser',
          'Synthetic fixture bootstrap is not registration UI acceptance',
          'Screenshots before/after use same seeded synthetic records',
          'Native external PostgreSQL not available; PGlite enforces RLS',
        ],
      },
      null,
      2,
    ),
  );
  console.log('CRM_V2_BROWSER_PASS', checks.length);
} finally {
  if (browser) await browser.close();
  for (const c of children) c.kill('SIGTERM');
}
