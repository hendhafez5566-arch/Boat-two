/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { openSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const out = 'docs/acceptance/2026-11-01-crm-v3';
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
  start([next, 'start', '-p', '3000'], root + '/apps/web', 'primary');
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
    const salesSettings = await req('/crm/sales/settings', token);
    await req('/crm/sales/settings', token, {
      ...salesSettings,
      assignment: { enabled: true, method: 'round_robin', memberIds: [ownerId], rules: [] },
      expected: salesSettings,
    });
    await req('/automations', token, {
      name: 'Widget interest to sales',
      enabled: true,
      trigger: 'crm.bot.answer',
      conditions: { attribute: { key: 'interest', value: 'product' } },
      actions: [
        {
          type: 'deal',
          pipelineId: pipeline.id,
          stage: 'جديدة',
          title: 'Widget opportunity',
          valueCents: 12300,
          currency: 'EGP',
        },
        { type: 'task', title: 'Widget follow-up', delayMinutes: 60 },
        { type: 'notify', title: 'Widget interest collected' },
      ],
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
              edges: { ok: 'interest' },
            },
            {
              id: 'interest',
              type: 'question',
              data: {
                text: 'QA interest?',
                answerType: 'text',
                saveAs: 'interest',
                saveToContact: true,
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
    await visitor.getByText('QA interest?', { exact: true }).waitFor();
    await visitor.getByRole('textbox', { name: 'اكتب رسالة', exact: true }).fill('product');
    await visitor.getByRole('button', { name: 'إرسال', exact: true }).click();
    await visitor.getByText('QA CRM V2 bot response', { exact: true }).waitFor();
    const conversations = await req('/conversations', token);
    const conversation = conversations.items[0];
    assert.ok(conversation);
    checks.push(sector + ': real widget bot question saves CRM identity and returns response');
    let widgetProfile;
    for (let i = 0; i < 60; i++) {
      widgetProfile = await req('/crm/contacts/' + conversation.contact_id + '/profile', token);
      if (widgetProfile.timeline.deals.length && widgetProfile.timeline.tasks.length) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!widgetProfile.timeline.deals.length)
      console.log(
        'AUTOMATION_DIAGNOSTIC',
        JSON.stringify({
          failures: await req('/automations/failures', token),
          timeline: widgetProfile.timeline.events,
        }),
      );
    assert.equal(widgetProfile.contact.name, 'QA ' + sector + ' Visitor');
    assert.equal(widgetProfile.contact.attributes.interest, 'product');
    assert.equal(widgetProfile.contact.owner_id, ownerId);
    assert.equal(widgetProfile.timeline.deals.length, 1);
    assert.equal(widgetProfile.timeline.tasks.length, 1);
    checks.push(
      sector +
        ': actual bot answers create one canonical assigned lead, deal and follow-up through automation',
    );
    await go('/dashboard/crm/notifications');
    await page.getByRole('heading', { name: 'تنبيهاتك ومتابعاتك', exact: true }).waitFor();
    await page.getByText('Widget interest collected', { exact: true }).waitFor();
    await shot(sector + '-notifications-ar');
    await page.getByRole('button', { name: 'قراءة الجميع', exact: true }).click();
    await go('/dashboard/crm/sales');
    await page
      .getByRole('heading', { name: 'الفريق المناسب، في الوقت المناسب', exact: true })
      .waitFor();
    const enabled = page.getByLabel('تشغيل التوزيع التلقائي', { exact: true });
    assert.equal(await enabled.isChecked(), true);
    await page
      .getByRole('button', { name: 'اختبار السياسة المحفوظة دون إسناد', exact: true })
      .click();
    await page
      .locator('output')
      .getByText('V2 ' + sector + ' Owner', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    await page.getByText('تم حفظ الإعدادات.', { exact: true }).waitFor();
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.equal(await enabled.isChecked(), true);
    await shot(sector + '-smart-sales-ar');
    checks.push(
      sector +
        ': assignment settings dry-run and save survive reload; internal notifications render',
    );
    const automation = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: 'أتمتة المبيعات والمتابعات', exact: true }),
      })
      .last();
    await automation.getByLabel('اسم القاعدة', { exact: true }).fill('UI scoring ' + sector);
    await automation.getByLabel('العنوان', { exact: true }).fill('Synthetic UI follow-up');
    await automation.getByText('شروط الاهتمام والصفقة وبيانات العميل', { exact: true }).click();
    await automation.getByLabel('درجة الاهتمام', { exact: true }).selectOption('cold');
    await automation.getByLabel('مفتاح حقل العميل أو إجابة البوت', { exact: true }).fill('budget');
    await automation.getByLabel('نوع قيمة الشرط', { exact: true }).selectOption('number');
    await automation.getByLabel('يساوي', { exact: true }).fill('0');
    await automation.getByRole('button', { name: 'معاينة واختبار اصطناعي', exact: true }).click();
    await automation
      .getByText('المعاينة الاصطناعية مطابقة. لم يُنفذ أي إجراء. راجع الملخص ثم احفظ.', {
        exact: true,
      })
      .waitFor();
    await automation.getByRole('button', { name: 'حفظ القاعدة', exact: true }).click();
    await automation
      .getByText('حُفظت القاعدة. يمكنك إدارتها ومراجعة سجلها من الأتمتة.', { exact: true })
      .waitFor();
    let uiRule = (await req('/automations', token)).find((r) => r.name === 'UI scoring ' + sector);
    assert.equal(uiRule.conditions.scoreBand, 'cold');
    assert.equal(uiRule.conditions.attribute.value, 0);
    assert.equal(uiRule.enabled, false);
    checks.push(
      sector +
        ': beginner wizard previews and saves scored typed-field conditions without activation',
    );
    await go('/dashboard/automations');
    await page.getByRole('button', { name: 'تحرير المسارات والتكاملات', exact: true }).click();
    await page.getByLabel('افتح قاعدة محفوظة', { exact: true }).selectOption(uiRule.id);
    const editor = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', { name: 'تحرير المسارات المحفوظة والتكاملات', exact: true }),
      })
      .last();
    await editor.getByLabel('أقل عدد نقاط (0–100)', { exact: true }).fill('0');
    await editor.getByRole('button', { name: 'إضافة مجموعة OR', exact: true }).click();
    const nested = editor.locator('details.condition-clause').last();
    await nested.locator('summary').click();
    await nested.getByLabel('حقل العميل أو إجابة البوت', { exact: true }).fill('consented');
    await nested.getByLabel('نوع قيمة الشرط', { exact: true }).selectOption('boolean');
    await nested.getByLabel('يساوي', { exact: true }).selectOption('false');
    await editor.getByRole('button', { name: 'حفظ المسار', exact: true }).click();
    await editor.getByText('تم حفظ التغيير.', { exact: true }).waitFor();
    uiRule = (await req('/automations', token)).find((r) => r.id === uiRule.id);
    assert.equal(uiRule.conditions.minScore, 0);
    assert.equal(uiRule.conditions.attribute.value, 0);
    assert.equal(uiRule.conditions.anyOf[0].attribute.value, false);
    checks.push(sector + ': advanced editor preserves score and zero/false in nested AND/OR');
    if (index === 0) {
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1024 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await shot('scored-conditions-' + width + '-ar');
      }
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    await go('/dashboard/crm/sales');
    const bell = page.getByRole('button', { name: 'مركز التنبيهات', exact: true });
    await bell.click();
    await page.getByRole('heading', { name: 'مركز التنبيهات', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await bell.getAttribute('aria-expanded'), 'false');
    await bell.click();
    await page
      .getByRole('heading', { name: 'الفريق المناسب، في الوقت المناسب', exact: true })
      .click();
    assert.equal(await bell.getAttribute('aria-expanded'), 'false');
    checks.push(sector + ': bell closes with Escape and outside click');
    await go('/dashboard/inbox?conversation=' + conversation.id + '&channelId=' + channel.id);
    await page.getByRole('button', { name: 'إيقاف البوت', exact: true }).click();
    await page.getByRole('button', { name: 'استئناف البوت', exact: true }).waitFor();
    const questionCount = await visitor.getByText('QA CRM V2 الاسم؟', { exact: true }).count();
    await visitor
      .getByRole('textbox', { name: 'اكتب رسالة', exact: true })
      .fill('QA hello after human takeover');
    await visitor.getByRole('button', { name: 'إرسال', exact: true }).click();
    await new Promise((r) => setTimeout(r, 2200));
    assert.equal(
      await visitor.getByText('QA CRM V2 الاسم؟', { exact: true }).count(),
      questionCount,
    );
    const cvAfter = await req('/conversations/' + conversation.id, token);
    assert.equal(cvAfter.handled_by, 'human');
    checks.push(sector + ': real UI takeover pauses bot while new inbound arrives');
    // Same seeded records and API for both versions; these are local Chromium screenshots.
    if (index === 0) {
      for (const version of ['after']) {
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
    checks.push(sector + ': V2 daily dashboard remains usable after V3 integration');
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
    await page.getByRole('button', { name: 'صفقات تحتاج تدخلًا', exact: true }).click();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('button', { name: deal.title, exact: true }).count(), 0);
    if (index === 0) await shot('pipeline-needs-attention-ar');
    await page.getByRole('button', { name: 'صفقات تحتاج تدخلًا', exact: true }).click();
    await page.getByRole('button', { name: deal.title, exact: true }).waitFor();
    checks.push(sector + ': attention filter uses company policy and restores normal pipeline');
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
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1024 });
        for (const path of ['sales', 'notifications']) {
          await go('/dashboard/crm/' + path);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            path + ' overflow at ' + width,
          );
          await shot('v3-' + path + '-' + width + '-ar');
        }
      }
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
    for (const role of ['admin', 'agent']) {
      const invitation = await req('/team/invitations', token, {
        email: randomUUID() + '@example.test',
        role,
        sendEmail: false,
      });
      const staff = await req('/auth/accept-invitation', null, {
        token: new URL(invitation.inviteUrl).searchParams.get('token'),
        fullName: sector + ' ' + role,
        password: 'Synthetic-' + randomUUID(),
      });
      const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await staffContext.addInitScript((s) => {
        localStorage.setItem('session', JSON.stringify(s));
        localStorage.setItem('boat-language', 'ar');
      }, staff);
      const staffPage = await staffContext.newPage();
      staffPage.on('pageerror', (e) => errors.push(e.message));
      await staffPage.goto('http://localhost:3001/dashboard/crm/sales');
      await staffPage
        .getByRole('heading', {
          name: role === 'agent' ? 'مساحة عملي' : 'الفريق المناسب، في الوقت المناسب',
          exact: true,
        })
        .waitFor();
      if (role === 'agent')
        assert.equal(
          await staffPage.getByLabel('تشغيل التوزيع التلقائي', { exact: true }).count(),
          0,
        );
      else {
        await staffPage.getByLabel('تشغيل التوزيع التلقائي', { exact: true }).waitFor();
      }
      assert.ok(await staffPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await staffPage.screenshot({
        path: out + '/' + sector + '-' + role + '-mobile-ar.jpg',
        quality: 78,
      });
      checks.push(sector + ': ' + role + ' mobile workspace respects management role');
      await staffContext.close();
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
          'Screenshots show current local build with isolated synthetic records',
          'Native external PostgreSQL not available; PGlite enforces RLS',
        ],
      },
      null,
      2,
    ),
  );
  console.log('CRM_V3_BROWSER_PASS', checks.length);
} finally {
  if (browser) await browser.close();
  for (const c of children) c.kill('SIGTERM');
}
