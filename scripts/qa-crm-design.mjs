import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(
    process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
  ),
  base = 'http://localhost:4000',
  web = 'http://localhost:3000',
  out = process.env.CRM_QA_OUTPUT || 'docs/ux-evidence/crm-redesign',
  before = process.env.CRM_QA_PHASE === 'before',
  workflow = !before && process.env.CRM_WORKFLOW_BASELINE !== 'true';
mkdirSync(out, { recursive: true });
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(r.ok, path + ' ' + r.status + ' ' + JSON.stringify(data));
  return data;
}
const results = [];
let browser;
try {
  for (const language of ['ar', 'en'])
    for (const [width, height, mode] of [
      [320, 720, 'phone'],
      [360, 800, 'phone'],
      [390, 844, 'phone'],
      [430, 932, 'phone'],
      [768, 1024, 'tablet'],
      [844, 390, 'landscape'],
      [980, 840, 'desktop-site'],
      [1366, 900, 'desktop'],
    ].filter(([w]) => !process.env.CRM_QA_WIDTH || w === Number(process.env.CRM_QA_WIDTH))) {
      browser = await chromium.launch({
        executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
        args: ['--no-sandbox'],
      });
      const t = (ar, en) => (language === 'ar' ? ar : en),
        session = await api('/auth/register', null, {
          email: uuid() + '@example.test',
          password: 'Synthetic-' + uuid(),
          fullName: 'CRM design QA',
          workspaceName: 'Synthetic CRM design',
        }),
        token = session.accessToken;
      const channel = await api('/channels', token, { type: 'web', name: 'CRM website' });
      await api('/workspace/onboarding/complete', token, {});
      const owner = (await api('/crm/workspace/members', token)).currentUserId;
      const invitation = await api('/team/invitations', token, {
        email: uuid() + '@example.test',
        role: 'agent',
        sendEmail: false,
      });
      const agent = await api('/auth/accept-invitation', null, {
        token: new URL(invitation.inviteUrl).searchParams.get('token'),
        password: 'Synthetic-' + uuid(),
        fullName: 'Mona Adel',
      });
      const staffId = (await api('/crm/workspace/members', agent.accessToken)).currentUserId;
      const contacts = [];
      for (let i = 0; i < 12; i++)
        contacts.push(
          await api('/crm/contacts', token, {
            name: i === 0 ? 'Nour Hassan' : i === 11 ? 'Mariam Adel' : 'Design client ' + i,
            email: 'client' + i + '@example.test',
            phone: '20100000' + String(i).padStart(4, '0'),
            tags: ['Travel'],
            ownerId: i === 0 ? staffId : i % 2 === 0 ? owner : null,
            attributes: {},
          }),
        );
      const pipeline = await api('/crm/pipelines', token, {
        name: 'Travel sales',
        stages: ['New', 'Proposal', 'Booked'],
      });
      const deal = await api('/crm/deals', token, {
        ownerId: staffId,
        contactId: contacts[0].id,
        pipelineId: pipeline.id,
        title: 'December travel booking',
        stage: 'Proposal',
        valueCents: 125000,
        currency: 'EGP',
      });
      await api('/crm/tasks', token, {
        contactId: contacts[0].id,
        title: 'Confirm passport details',
        dueAt: new Date(Date.now() - 86400000).toISOString(),
        priority: 'high',
        assignedTo: staffId,
      });
      const visitor = await api('/widget/' + channel.external_id + '/session', null, {});
      const inbound = await fetch(
        base + '/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-visitor-token': visitor.token },
          body: JSON.stringify({ text: 'Travel itinerary question', clientMsgId: uuid() }),
        },
      );
      assert.ok(inbound.ok);
      const conversation = (await api('/conversations', token)).items[0];
      const openProfile = t(
        before ? 'ملف المشترك: ' : 'فتح ملف ',
        before ? 'Subscriber actions: ' : 'Open profile for ',
      );
      const profileTitle = t(
        before ? 'ملف المشترك' : 'ملف العميل',
        before ? 'Subscriber profile' : 'Customer profile',
      );
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: mode !== 'desktop',
        isMobile: mode !== 'desktop' && mode !== 'desktop-site',
      });
      await context.addInitScript(
        ({ session, language }) => {
          if (location.protocol === 'http:' && window === window.top) {
            if (!localStorage.getItem('session'))
              localStorage.setItem('session', JSON.stringify(session));
            localStorage.setItem('boat-language', language);
          }
        },
        { session, language },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', (r) =>
        ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname)
          ? r.continue()
          : r.abort(),
      );
      async function shot(name) {
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          name + ' must fit viewport',
        );
        await page.screenshot({ path: `${out}/${name}-${language}-${width}.png` });
      }
      if (!before) {
        await page.goto(web + '/dashboard/crm/today');
        await page.getByRole('heading', { name: t('يوم العمل', 'Today'), exact: true }).waitFor();
        await shot('today');
        await page.getByRole('link', { name: t('الأدوات', 'Tools'), exact: true }).click();
        await page
          .getByRole('heading', { name: t('أدوات CRM', 'CRM tools'), exact: true })
          .waitFor();
        await shot('tools');
      }
      await page.goto(web + '/dashboard/crm');
      await page.getByRole('button', { name: openProfile + 'Mariam Adel', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('combobox', { name: t('القناة', 'Channel'), exact: true }).isVisible(),
        false,
      );
      await page.getByRole('button', { name: t('التصفية', 'Filters'), exact: true }).click();
      assert.ok(
        await page.getByRole('combobox', { name: t('القناة', 'Channel'), exact: true }).isVisible(),
      );
      await page.getByRole('button', { name: t('التصفية', 'Filters'), exact: true }).click();
      await shot('customers');
      if (!before) {
        const unassigned = page.getByRole('button', {
          name: t('دون مسؤول', 'Unassigned'),
          exact: true,
        });
        if (width <= 430) await unassigned.tap();
        else await unassigned.click();
        await page
          .getByRole('button', { name: openProfile + 'Mariam Adel', exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: openProfile + 'Nour Hassan', exact: true })
            .count(),
          0,
        );
        await page.getByRole('button', { name: t('الكل', 'All'), exact: true }).click();
        const search = page.getByRole('searchbox', { name: t('بحث عن عميل', 'Search customers') });
        await search.fill('mariam');
        await page
          .getByRole('button', { name: openProfile + 'Mariam Adel', exact: true })
          .waitFor();
      }
      await page.getByRole('button', { name: openProfile + 'Mariam Adel', exact: true }).click();
      let dialog = page.getByRole(before ? 'dialog' : 'region', {
        name: profileTitle,
        exact: true,
      });
      await dialog.getByRole('heading', { name: 'Mariam Adel', exact: true }).waitFor();
      await shot('profile');
      if (!before) {
        await dialog
          .getByRole('button', { name: t('تعديل البيانات', 'Edit details'), exact: true })
          .click();
        await dialog.locator('input[name=name]').fill('Mariam Saad');
        await dialog
          .getByRole('button', { name: t('حفظ التغييرات', 'Save Changes'), exact: true })
          .click();
        await dialog.getByRole('heading', { name: 'Mariam Saad', exact: true }).waitFor();
        assert.equal((await api('/crm/contacts/' + contacts[11].id, token)).name, 'Mariam Saad');
      }
      if (workflow) {
        const lifecycle = dialog.getByRole('combobox', {
          name: t('مرحلة العميل', 'Lifecycle'),
          exact: true,
        });
        await lifecycle.selectOption('qualified');
        await dialog.getByText(t('حُفظ التغيير.', 'Changes saved.'), { exact: true }).waitFor();
        assert.equal((await api('/crm/contacts/' + contacts[11].id, token)).lifecycle, 'qualified');
        await dialog
          .getByRole('button', { name: t('إضافة ملاحظة', 'Add note'), exact: true })
          .click();
        const note = dialog.getByRole('textbox', {
          name: t('ملاحظة داخلية', 'Internal note'),
          exact: true,
        });
        await note.waitFor();
        await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'text');
        await page.keyboard.type('Requested flexible travel dates');
        await dialog
          .getByRole('button', { name: t('إضافة الملاحظة', 'Add Note'), exact: true })
          .click();
        await dialog.getByText('Requested flexible travel dates', { exact: true }).waitFor();
        const profile = await api('/crm/contacts/' + contacts[11].id + '/profile', token);
        assert.ok(
          profile.timeline.notes.some((item) => item.body === 'Requested flexible travel dates'),
        );
        await dialog
          .getByRole('button', { name: new RegExp(t('آخر نشاط', 'Latest activity')) })
          .click();
        await dialog.getByText('Requested flexible travel dates', { exact: true }).waitFor();
      }
      await dialog
        .getByRole('button', {
          name: before ? 'Close / إغلاق' : t('العودة للعملاء', 'Back to customers'),
          exact: true,
        })
        .click();
      if (!before) {
        assert.equal(
          await page
            .getByRole('searchbox', { name: t('بحث عن عميل', 'Search customers') })
            .inputValue(),
          'mariam',
        );
        await page.getByRole('searchbox', { name: t('بحث عن عميل', 'Search customers') }).fill('');
      }
      await page
        .getByRole('button', { name: t('إضافة عميل', 'Add customer'), exact: true })
        .click();
      dialog = page.getByRole('dialog', { name: t('إضافة عميل', 'Add contact'), exact: true });
      await dialog
        .getByLabel(t('اسم العميل', 'Customer name'), { exact: true })
        .fill('Created through new design');
      await dialog.getByLabel(t('الهاتف', 'Phone'), { exact: true }).fill('201234567890');
      await shot('contact-editor');
      await dialog
        .getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true })
        .click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await api('/crm/contacts?q=Created', token)).items.length, 1);
      if (!before)
        await page
          .getByRole('region', { name: profileTitle })
          .getByRole('heading', { name: 'Created through new design', exact: true })
          .waitFor();
      if (!before) {
        await page.goto(web + '/dashboard/crm?contact=' + conversation.contact_id);
        await page
          .getByRole('link', { name: t('فتح المحادثة', 'Open conversation'), exact: true })
          .click();
        await page.waitForURL(
          (url) =>
            url.pathname === '/dashboard/inbox' &&
            url.searchParams.get('conversation') === conversation.id,
        );
        await page.getByText('Travel itinerary question', { exact: true }).last().waitFor();
        await page.goto(web + '/dashboard/crm?contact=' + contacts[0].id);
        const profile = page.getByRole(before ? 'dialog' : 'region', { name: profileTitle });
        await profile
          .getByRole('button', { name: t('فرص البيع', 'Opportunities'), exact: true })
          .click();
        await profile
          .getByRole('button', { name: 'December travel booking', exact: true })
          .waitFor({ state: 'attached' });
        await profile
          .getByRole('button', { name: t('إضافة متابعة', 'Add follow-up'), exact: true })
          .click();
        await profile
          .getByRole('heading', { name: t('متابعة جديدة', 'New follow-up'), exact: true })
          .waitFor();
        await profile
          .getByLabel(t('العنوان', 'Title'), { exact: true })
          .fill('Check flight preferences');
        await profile
          .getByLabel(t('موعد المتابعة', 'Follow-up date'), { exact: true })
          .fill('2030-01-10T14:30');
        await profile.locator('select[name=ownerId]').selectOption(staffId);
        await profile
          .getByRole('button', { name: t('حفظ المتابعة', 'Save follow-up'), exact: true })
          .click();
        await profile
          .getByRole('button', { name: 'Check flight preferences', exact: true })
          .waitFor();
        const followUp = (await api('/crm/tasks?q=Check%20flight', token)).items[0];
        assert.equal(followUp.assigned_to, staffId);
        assert.equal(followUp.contact_id, contacts[0].id);
      }
      await page.goto(web + '/dashboard/crm/tasks');
      await page.getByRole('button', { name: 'Confirm passport details', exact: true }).waitFor();
      await shot('tasks');
      if (!before) {
        const task = page
          .locator('[data-work-card]')
          .filter({ hasText: 'Confirm passport details' });
        await task.getByRole('button', { name: t('إكمال المتابعة', 'Complete follow-up') }).click();
        await page.getByRole('button', { name: t('مكتملة', 'Completed'), exact: true }).click();
        await task.getByRole('button', { name: t('إعادة فتح', 'Reopen'), exact: true }).waitFor();
        assert.equal((await api('/crm/tasks?q=Confirm', token)).items[0].status, 'done');
        await page.getByRole('button', { name: t('كل المفتوحة', 'All open'), exact: true }).click();
      }
      await page
        .getByRole('button', { name: t('إضافة متابعة', 'Add follow-up'), exact: true })
        .click();
      dialog = page.getByRole('dialog', { name: t('متابعة جديدة', 'New follow-up'), exact: true });
      await dialog
        .getByRole('combobox', { name: t('العميل', 'Customer'), exact: true })
        .selectOption(contacts[0].id);
      await dialog
        .getByLabel(t('العنوان', 'Title'), { exact: true })
        .fill('Review travel itinerary');
      await dialog
        .getByLabel(t('موعد المتابعة', 'Follow-up date'), { exact: true })
        .fill('2030-01-10T14:30');
      await shot('task-editor');
      await dialog
        .getByRole('button', { name: t('حفظ المتابعة', 'Save follow-up'), exact: true })
        .click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Review travel itinerary', exact: true }).waitFor();
      await page.goto(web + '/dashboard/crm/pipeline');
      if (!before && width <= 430)
        await page
          .getByLabel(t('مرحلة البيع', 'Pipeline stage'), { exact: true })
          .selectOption('Proposal');
      await page.getByRole('button', { name: 'December travel booking', exact: true }).waitFor();
      await shot('pipeline');
      if (!before) {
        await page
          .getByLabel(t('مرحلة', 'Stage') + ': December travel booking', { exact: true })
          .selectOption('Booked');
        await page.getByText(t('تم الحفظ', 'Saved'), { exact: true }).waitFor();
        assert.equal((await api('/crm/deals?id=' + deal.id, token)).items[0].stage, 'Booked');
      }
      if (workflow) {
        if (width <= 430)
          await page
            .getByLabel(t('مرحلة البيع', 'Pipeline stage'), { exact: true })
            .selectOption('Booked');
        await page
          .getByRole('combobox', {
            name: t('حالة الفرصة', 'Opportunity status') + ': December travel booking',
          })
          .selectOption('won');
        await page
          .getByRole('combobox', {
            name: t('حالة الفرصة', 'Opportunity status') + ': December travel booking',
          })
          .waitFor({ state: 'hidden' });
        assert.equal((await api('/crm/deals?id=' + deal.id, token)).items[0].status, 'won');
      }
      await page
        .getByRole('button', { name: t('إضافة فرصة', 'Add opportunity'), exact: true })
        .click();
      dialog = page.getByRole('dialog', { name: t('فرصة جديدة', 'New opportunity'), exact: true });
      await dialog
        .getByRole('combobox', { name: t('العميل', 'Customer'), exact: true })
        .selectOption(contacts[0].id);
      await dialog.getByLabel(t('العنوان', 'Title'), { exact: true }).fill('New hotel reservation');
      await dialog.getByLabel(t('القيمة', 'Value'), { exact: true }).fill('150.29');
      await shot('opportunity-editor');
      await dialog
        .getByRole('button', { name: t('حفظ الفرصة', 'Save opportunity'), exact: true })
        .click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(
        String((await api('/crm/deals?q=New%20hotel', token)).items[0].value_cents),
        '15029',
      );
      for (const route of [
        'overview',
        'reports',
        'lists',
        'segments',
        'sales',
        'notifications',
        'work',
        'advanced',
      ]) {
        await page.goto(web + '/dashboard/crm/' + route);
        await page.locator('.page-workspace').first().waitFor();
        await shot(route);
      }
      if (workflow) {
        await page.goto(web + '/dashboard/crm');
        await page.getByRole('button', { name: t('إدارة', 'Manage'), exact: true }).click();
        const csv = page.waitForEvent('download');
        await page.getByRole('button', { name: t('تصدير CSV', 'Export CSV'), exact: true }).click();
        assert.match((await csv).suggestedFilename(), /\.csv$/i);
        await page.getByRole('button', { name: t('إدارة', 'Manage'), exact: true }).click();
        await page
          .getByRole('button', {
            name: t('استيراد وإدارة الملفات', 'Import and manage files'),
            exact: true,
          })
          .click();
        const importDialog = page.getByRole('dialog', {
          name: t('تصدير واستيراد العملاء', 'Customer import and export'),
        });
        await importDialog.waitFor();
        await importDialog.getByRole('button', { name: 'Close / إغلاق', exact: true }).click();
        const tools = page.getByRole('link', { name: t('الأدوات', 'Tools'), exact: true });
        await tools.click();
        await page
          .getByRole('link', { name: t('قوائم العملاء', 'Customer lists'), exact: true })
          .click();
        await page
          .getByLabel(t('اسم القائمة الجديدة', 'New list name'), { exact: true })
          .fill('Returning travelers');
        await page
          .getByRole('button', { name: t('إنشاء القائمة', 'Create list'), exact: true })
          .click();
        await page.getByRole('heading', { name: 'Returning travelers', exact: true }).waitFor();
        const lists = await api('/contact-lists', token);
        assert.ok(lists.some((list) => list.name === 'Returning travelers'));
        await page.goto(web + '/dashboard/crm/segments');
        await page.getByLabel(t('اسم العرض', 'View name'), { exact: true }).fill('Travel accounts');
        await page.getByRole('button', { name: t('حفظ العرض', 'Save view'), exact: true }).click();
        await page.getByText('Travel accounts', { exact: true }).waitFor();
        assert.ok(
          (await api('/crm/workspace/views', token)).some(
            (view) => view.name === 'Travel accounts',
          ),
        );
      }
      if (!before) {
        await page.evaluate(
          (session) => localStorage.setItem('session', JSON.stringify(session)),
          agent,
        );
        if (workflow) {
          await page.goto(web + '/dashboard/crm/today');
          await page.getByRole('link', { name: /Check flight preferences/ }).click();
          await page
            .getByRole('region', { name: profileTitle })
            .getByRole('button', { name: 'Check flight preferences', exact: true })
            .waitFor();
          await page.goto(web + '/dashboard/crm');
          await page.getByRole('link', { name: t('مهامي', 'My tasks'), exact: true }).click();
          await page
            .getByRole('button', { name: 'Check flight preferences', exact: true })
            .waitFor();
          assert.ok(
            (await page
              .getByRole('button', { name: t('مهامي', 'My tasks'), exact: true })
              .getAttribute('aria-pressed')) === 'true',
          );
        }
        if (workflow) {
          await page.goto(web + '/dashboard/crm/pipeline?status=won&view=table');
          const ownDeal = page.getByRole('combobox', {
            name: t('حالة الفرصة', 'Opportunity status') + ': December travel booking',
          });
          await ownDeal.selectOption('open');
          await ownDeal.waitFor({ state: 'hidden' });
          assert.equal((await api('/crm/deals?id=' + deal.id, token)).items[0].status, 'open');
          await page.goto(web + '/dashboard/crm/pipeline?view=table');
          const otherDeal = page.getByRole('combobox', {
            name: t('حالة الفرصة', 'Opportunity status') + ': New hotel reservation',
          });
          await page
            .getByRole('combobox', {
              name: t('حالة الفرصة', 'Opportunity status') + ': December travel booking',
            })
            .waitFor();
          assert.equal(await otherDeal.count(), 0);
        }
        await page.goto(web + '/dashboard/crm/tasks?ownerId=me&status=done');
        await page.getByRole('button', { name: 'Confirm passport details', exact: true }).waitFor();
        await page.goto(web + '/dashboard/crm?contact=' + contacts[0].id);
        await page.getByRole('heading', { name: 'Nour Hassan', exact: true }).waitFor();
        if (workflow) {
          assert.equal(
            await page
              .getByRole('combobox', { name: t('مرحلة العميل', 'Lifecycle'), exact: true })
              .count(),
            0,
          );
        }

        assert.equal(
          await page
            .getByRole('button', { name: t('تعديل البيانات', 'Edit details'), exact: true })
            .count(),
          0,
        );
      }
      assert.deepEqual(errors, []);
      results.push({
        language,
        width,
        height,
        mode,
        status: 'PASS',
        role: before ? 'owner' : 'owner and agent',
        api: 'NestJS with isolated PGlite',
        checks: before
          ? ['baseline capture']
          : [
              'quick filters and preserved search',
              'customer add and inline edit',
              'profile to opportunity and inbox',
              'follow-up create and complete',
              'stage update and opportunity creation',
              'all CRM pages render',
              'employee access boundaries',
              ...(workflow
                ? [
                    'direct lifecycle and opportunity status',
                    'focused note and latest activity',
                    'my tasks shortcut',
                    'CSV export, import dialog, list creation and saved smart view',
                  ]
                : []),
            ],
      });
      await browser.close();
      browser = null;
    }
} finally {
  if (browser) await browser.close();
  writeFileSync(out + '/results.json', JSON.stringify(results, null, 2) + '\n');
}
console.log('PASS CRM journeys', results.length);
