import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
async function recoverCreate(page, dialog, save, kind, query, token) {
  const endpoint = '**/crm/' + kind;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const committed = await route.fetch();
    assert.ok(committed.ok());
    await route.abort('internetdisconnected');
  });
  await save.click();
  await dialog.getByRole('alert').waitFor();
  await page.unroute(endpoint);
  assert.equal((await api('/crm/' + kind + '?q=' + encodeURIComponent(query), token)).total, 1);
  await save.click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await api('/crm/' + kind + '?q=' + encodeURIComponent(query), token)).total, 1);
}
async function recoverEdit(page, editor, save, endpoint) {
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    assert.ok((await route.fetch()).ok());
    await route.abort('internetdisconnected');
  });
  await save.click();
  await editor.getByRole('alert').first().waitFor();
  await page.unroute(endpoint);
  await save.click();
  await save.waitFor({ state: 'hidden' });
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
    ].filter(([w]) => !process.env.CRM_QA_WIDTH || process.env.CRM_QA_WIDTH.split(',').map(Number).includes(w))) {
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
      const managerRun = !before && process.env.CRM_QA_MANAGER === 'admin';
      let managerSession = session;
      if (managerRun) {
        const managerInvite = await api('/team/invitations', token, {
          email: uuid() + '@example.test',
          role: 'admin',
          sendEmail: false,
        });
        managerSession = await api('/auth/accept-invitation', null, {
          token: new URL(managerInvite.inviteUrl).searchParams.get('token'),
          password: 'Synthetic-' + uuid(),
          fullName: 'CRM QA administrator',
        });
        assert.equal(
          (await api('/crm/workspace/members', managerSession.accessToken)).role,
          'admin',
        );
      }
      const staffId = (await api('/crm/workspace/members', agent.accessToken)).currentUserId;
      if (!before) {
        for (const type of ['text', 'number', 'date', 'boolean'])
          await api('/crm/fields', token, { key: 'qa_' + type, label: 'QA ' + type, type });
      }
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
        const back = dialog.getByRole('button', { name: t('العودة للعملاء', 'Back to customers'), exact: true });
        page.once('dialog', (dialog) => dialog.dismiss());
        await back.click();
        assert.equal(await dialog.locator('input[name=name]').inputValue(), 'Mariam Saad');
        const saveChanges = dialog.getByRole('button', {
          name: t('حفظ التغييرات', 'Save Changes'),
          exact: true,
        });
        const profilePath = '**/crm/contacts/' + contacts[11].id + '/profile';
        let attempts = 0;
        await page.route(profilePath, async (route) => {
          if (route.request().method() !== 'PATCH') return route.continue();
          attempts++;
          if (attempts === 1) {
            assert.ok((await route.fetch()).ok());
            return route.abort('internetdisconnected');
          }
          return route.continue();
        });
        await saveChanges.click();
        await dialog.getByRole('alert').getByText(t('تعذّر الاتصال', 'Unable to connect'), { exact: false }).waitFor();
        assert.equal(await dialog.locator('input[name=name]').inputValue(), 'Mariam Saad');
        assert.equal((await api('/crm/contacts/' + contacts[11].id, token)).name, 'Mariam Saad');
        await saveChanges.dblclick();
        await dialog.getByRole('heading', { name: 'Mariam Saad', exact: true }).waitFor();
        await page.unroute(profilePath);
        assert.equal(attempts, 2);
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
      if (!before) {
        const name = dialog.getByLabel(t('اسم العميل', 'Customer name'), { exact: true });
        await name.fill('Unsaved QA draft');
        const cancel = dialog.getByRole('button', { name: t('إلغاء', 'Cancel'), exact: true });
        await cancel.click();
        const discard = page.getByRole('dialog', { name: t('تجاهل التغييرات؟', 'Discard changes?') });
        await discard.getByRole('button', { name: t('متابعة التعديل', 'Keep editing') }).click();
        assert.equal(await name.inputValue(), 'Unsaved QA draft');
        await cancel.click();
        await discard.getByRole('button', { name: t('تجاهل التغييرات', 'Discard changes'), exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal((await api('/crm/contacts?q=Unsaved%20QA%20draft', token)).total, 0);
        await page.getByRole('button', { name: t('إضافة عميل', 'Add customer'), exact: true }).click();
      }
      await dialog
        .getByLabel(t('اسم العميل', 'Customer name'), { exact: true })
        .fill('Created through new design');
      await dialog.getByLabel(t('الهاتف', 'Phone'), { exact: true }).fill('201234567890');
      if (!before) {
        await dialog.getByText(t('الحقول المخصصة', 'Custom fields'), { exact: true }).click();
        await dialog.getByLabel('QA text', { exact: true }).fill('Synthetic value');
        await dialog.getByLabel('QA number', { exact: true }).fill('0');
        await dialog.getByLabel('QA date', { exact: true }).fill('2030-05-04');
        await dialog.getByLabel('QA boolean', { exact: true }).selectOption('false');
        await shot('contact-custom-fields');
      }
      await shot('contact-editor');
      const createContact = dialog.getByRole('button', { name: t('حفظ العميل', 'Save contact'), exact: true });
      const contactsEndpoint = '**/crm/contacts';
      if (!before) await page.route(contactsEndpoint, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const committed = await route.fetch();
        assert.ok(committed.ok());
        await route.abort('internetdisconnected');
      });
      await createContact.click();
      if (!before) {
        await dialog.getByRole('alert').waitFor();
        await page.unroute(contactsEndpoint);
        assert.equal((await api('/crm/contacts?q=Created', token)).total, 1);
        await createContact.click();
      }
      await dialog.waitFor({ state: 'hidden' });
      assert.equal((await api('/crm/contacts?q=Created', token)).items.length, 1);
      if (!before) {
        const saved = (await api('/crm/contacts?q=Created', token)).items[0];
        assert.equal(saved.attributes.qa_text, 'Synthetic value');
        assert.equal(saved.attributes.qa_number, 0);
        assert.equal(saved.attributes.qa_date, '2030-05-04');
        assert.equal(saved.attributes.qa_boolean, false);
        const created = page.getByRole('region', { name: profileTitle });
        await created
          .getByRole('heading', { name: 'Created through new design', exact: true })
          .waitFor();
        const id = new URL(page.url()).searchParams.get('contact');
        await created.getByText(t('لا توجد محادثات.', 'No conversations.'), { exact: true }).waitFor();
        assert.equal(await created.getByRole('link', { name: t('فتح المحادثة', 'Open conversation'), exact: true }).count(), 0);
        const archive = created.getByRole('button', {
          name: t('أرشفة العميل', 'Archive customer'),
          exact: true,
        });
        page.once('dialog', (dialog) => dialog.dismiss());
        await archive.click();
        assert.equal((await api('/crm/contacts/' + id, token)).archived_at, null);
        page.once('dialog', (dialog) => dialog.accept());
        await archive.click();
        await created
          .getByRole('button', { name: t('استعادة العميل', 'Restore customer'), exact: true })
          .waitFor();
        assert.ok((await api('/crm/contacts/' + id, token)).archived_at);
        await created
          .getByRole('button', { name: t('العودة للعملاء', 'Back to customers'), exact: true })
          .click();
        await page.getByRole('button', { name: t('الأرشيف', 'Archived'), exact: true }).click();
        await page
          .getByRole('button', { name: openProfile + 'Created through new design', exact: true })
          .click();
        await created
          .getByRole('button', { name: t('استعادة العميل', 'Restore customer'), exact: true })
          .click();
        await created
          .getByRole('button', { name: t('أرشفة العميل', 'Archive customer'), exact: true })
          .waitFor();
        assert.equal((await api('/crm/contacts/' + id, token)).archived_at, null);
        const disposable = await api('/crm/contacts', token, { name: 'Synthetic deletion candidate' });
        const deletionPath = '/crm/contacts/' + disposable.id;
        await api(deletionPath + '/archive', token, { archived: true }, 'PATCH');
        await page.goto(web + '/dashboard/crm?contact=' + disposable.id);
        const deleteButton = page.getByRole('button', {
          name: t('حذف العميل نهائيًا', 'Permanently delete customer'), exact: true,
        });
        page.once('dialog', (dialog) => dialog.dismiss());
        await deleteButton.click();
        assert.ok((await api(deletionPath, token)).archived_at);
        page.once('dialog', (dialog) => dialog.accept());
        await deleteButton.click();
        await deleteButton.waitFor({ state: 'hidden' });
        assert.equal((await api('/crm/contacts?q=Synthetic%20deletion%20candidate&archived=all', token)).total, 0);
      }
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
        await profile
          .getByRole('button', { name: 'Check flight preferences', exact: true })
          .click();
        await profile
          .getByLabel(t('ربط بفرصة بيع (اختياري)', 'Link opportunity (optional)'), { exact: true })
          .selectOption(deal.id);
        await profile.getByLabel(t('الأولوية', 'Priority'), { exact: true }).selectOption('high');
        const saveFollowUp = profile.getByRole('button', { name: t('حفظ المتابعة', 'Save follow-up'), exact: true });
        await recoverEdit(page, profile, saveFollowUp, '**/crm/tasks/' + followUp.id);
        await profile
          .getByRole('button', { name: t('حفظ المتابعة', 'Save follow-up'), exact: true })
          .waitFor({ state: 'hidden' });
        const edited = (await api('/crm/tasks?q=Check%20flight', token)).items[0];
        assert.equal(edited.deal_id, deal.id);
        assert.equal(edited.priority, 'high');
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
      {
        const save = dialog.getByRole('button', { name: t('حفظ المتابعة', 'Save follow-up'), exact: true });
        if (before) await save.click();
        else await recoverCreate(page, dialog, save, 'tasks', 'Review travel itinerary', token);
      }
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
      {
        const save = dialog.getByRole('button', { name: t('حفظ الفرصة', 'Save opportunity'), exact: true });
        if (before) await save.click();
        else await recoverCreate(page, dialog, save, 'deals', 'New hotel reservation', token);
      }
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
      if (!before) {
        await page.goto(web + '/dashboard/crm/advanced');
        await page
          .getByRole('button', {
            name: t('إعداد خطوط المبيعات', 'Configure pipelines'),
            exact: true,
          })
          .click();
        const pipelineForm = page.locator('form').filter({
          has: page.getByRole('heading', {
            name: t('خط مبيعات جديد', 'New pipeline'),
            exact: true,
          }),
        });
        await pipelineForm.getByLabel(t('الاسم', 'Name'), { exact: true }).fill('ZZ QA pipeline');
        await pipelineForm.locator('input[name=stage]').nth(0).fill('Prospect');
        await pipelineForm.locator('input[name=stage]').nth(1).fill('Review');
        await pipelineForm
          .getByRole('button', { name: t('إضافة مرحلة', 'Add stage'), exact: true })
          .click();
        await pipelineForm.locator('input[name=stage]').nth(2).fill('Booked');
        await pipelineForm
          .getByRole('button', { name: t('لأعلى', 'Move up'), exact: true })
          .nth(2)
          .click();
        await shot('pipeline-settings');
        await pipelineForm
          .getByRole('button', { name: t('إنشاء خط مبيعات', 'Create pipeline'), exact: true })
          .click();
        await page.getByText('ZZ QA pipeline', { exact: true }).last().waitFor();
        assert.deepEqual(
          (await api('/crm/pipelines', token)).find((p) => p.name === 'ZZ QA pipeline').stages,
          ['Prospect', 'Booked', 'Review'],
        );
        const p = (await api('/crm/pipelines', token)).find((p) => p.name === 'ZZ QA pipeline');
        const linked = await api('/crm/deals', token, {
          contactId: contacts[9].id,
          pipelineId: p.id,
          title: 'Synthetic migration deal',
          stage: 'Prospect',
          currency: 'USD',
          valueCents: 12345,
          ownerId: staffId,
          expectedClose: '2030-05-04',
        });
        const settings = page
          .locator('details')
          .filter({ has: page.locator('summary').getByText('ZZ QA pipeline', { exact: true }) })
          .last();
        await settings.locator('summary').first().click();
        await settings
          .getByRole('button', { name: t('إزالة المرحلة', 'Remove stage'), exact: true })
          .first()
          .click();
        const refused = page.waitForResponse(
          (r) => r.url().endsWith('/crm/pipelines/' + p.id) && r.request().method() === 'PATCH',
        );
        await settings
          .getByRole('button', { name: t('حفظ المراحل', 'Save stages'), exact: true })
          .click();
        assert.equal((await refused).status(), 400);
        assert.equal((await api('/crm/deals?id=' + linked.id, token)).items[0].stage, 'Prospect');
        await settings.locator('select[name=replacement-0]').selectOption('Booked');
        await shot('pipeline-replacement');
        await settings
          .getByRole('button', { name: t('حفظ المراحل', 'Save stages'), exact: true })
          .click();
        await settings.locator('input[name=stage]').first().getAttribute('value');
        for (let attempt = 0; attempt < 12; attempt++) {
          const migrated = (await api('/crm/deals?id=' + linked.id, token)).items[0];
          if (migrated.stage === 'Booked') {
            for (const key of [
              'id',
              'title',
              'value_cents',
              'currency',
              'owner_id',
              'contact_id',
              'expected_close',
              'created_at',
            ])
              assert.equal(String(migrated[key]), String(linked[key]));
            break;
          }
          if (attempt === 11) throw new Error('Pipeline migration did not persist');
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        await page.goto(web + '/dashboard/crm/pipeline?view=table&allPipelines=true&status=');
        await page.getByRole('button', { name: 'Synthetic migration deal', exact: true }).click();
        const dealDialog = page
          .getByRole('dialog')
          .filter({
            has: page.getByRole('button', {
              name: t('حفظ الفرصة', 'Save opportunity'),
              exact: true,
            }),
          });
        await dealDialog.locator('select[name=status]').selectOption('lost');
        await dealDialog.locator('textarea[name=lossReason]').fill('Synthetic loss reason');
        await dealDialog.locator('input[name=value]').fill('147.25');
        await dealDialog.locator('input[name=currency]').fill('EUR');
        await dealDialog.locator('select[name=ownerId]').selectOption(owner);
        const saveDeal = dealDialog.getByRole('button', { name: t('حفظ الفرصة', 'Save opportunity'), exact: true });
        await recoverEdit(page, dealDialog, saveDeal, '**/crm/deals/' + linked.id);
        await dealDialog.waitFor({ state: 'hidden' });
        const lost = (await api('/crm/deals?id=' + linked.id, token)).items[0];
        assert.equal(lost.status, 'lost');
        assert.equal(lost.loss_reason, 'Synthetic loss reason');
        assert.equal(Number(lost.value_cents), 14725);
        assert.equal(lost.currency, 'EUR');
        assert.equal(lost.owner_id, owner);
        const outcome = page.getByRole('combobox', {
          name: t('حالة الفرصة', 'Opportunity status') + ': Synthetic migration deal',
          exact: true,
        });
        for (const status of ['open', 'won']) {
          const changed = page.waitForResponse(
            (res) =>
              res.url().endsWith('/crm/deals/' + linked.id) && res.request().method() === 'PATCH',
          );
          await outcome.selectOption(status);
          assert.equal((await (await changed).json()).status, status);
        }
      }
      if (workflow) {
        await page.goto(web + '/dashboard/crm');
        await page.getByRole('button', { name: t('إدارة', 'Manage'), exact: true }).click();
        const csv = page.waitForEvent('download');
        await page.getByRole('button', { name: t('تصدير CSV', 'Export CSV'), exact: true }).click();
        const exportDialog = page.getByRole('dialog', {
          name: t('حقول تصدير العملاء', 'Customer export fields'),
        });
        await exportDialog.getByLabel('QA number', { exact: true }).check();
        await exportDialog.getByLabel('QA boolean', { exact: true }).check();
        await exportDialog.getByRole('button', { name: t('تنزيل CSV', 'Download CSV') }).click();
        const downloadedContacts = await csv;
        assert.match(downloadedContacts.suggestedFilename(), /\.csv$/i);
        const contactsCsv = readFileSync(await downloadedContacts.path(), 'utf8');
        assert.match(contactsCsv, /"attribute:qa_boolean","attribute:qa_number"/);
        assert.match(contactsCsv, /"Created through new design"[^\r\n]*,"false","0"/);
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
        const importFile = importDialog.locator('input[accept=".csv,.xlsx,.json"]');
        await importFile.setInputFiles({
          name: 'invalid.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('Name,Email\nBroken,bad-address\n'),
        });
        await importDialog
          .getByText(t('البريد غير صالح', 'Invalid email'), { exact: false })
          .waitFor();
        const start = importDialog.getByRole('button', {
          name: t('تأكيد وبدء الاستيراد', 'Confirm and start import'),
          exact: true,
        });
        assert.equal(await start.isEnabled(), false);
        const { Workbook } = createRequire(new URL('../apps/api/package.json', import.meta.url))(
          'exceljs',
        );
        const book = new Workbook();
        book.addWorksheet('Empty');
        book.addWorksheet('Reject').addRows([
          ['Name', 'Email'],
          ['Wrong sheet', 'invalid'],
        ]);
        book.addWorksheet('Import').addRows([
          ['Name', 'Email'],
          ['QA import', 'crm-import@example.test'],
          ['Duplicate must not replace', contacts[0].email],
        ]);
        await importFile.setInputFiles({
          name: 'review.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from(await book.xlsx.writeBuffer()),
        });
        const worksheet = importDialog.locator('select').first();
        assert.equal(await worksheet.inputValue(), 'Reject');
        await worksheet.selectOption('Empty');
        await importDialog.getByText(t('لا توجد أعمدة في هذه الورقة', 'This sheet has no columns'), { exact: false }).waitFor();
        assert.equal(await start.count(), 0);
        await worksheet.selectOption('Import');
        await start.click();
        await importDialog
          .getByText(t('تم تجهيز الاستيراد', 'Import queued'), { exact: false })
          .waitFor();
        for (let attempt = 0; attempt < 20; attempt++) {
          if ((await api('/crm/contacts?q=QA%20import', token)).items.length) break;
          if (attempt === 19) throw new Error('Isolated import job did not complete');
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        assert.equal((await api('/crm/contacts/' + contacts[0].id, token)).name, 'Nour Hassan');
        await importFile.setInputFiles({
          name: 'resume.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify([{ name: 'QA resumed JSON', email: 'qa-resume@example.test' }])),
        });
        const completion = '**/crm/jobs/*/complete-upload';
        let acceptedJob;
        await page.route(completion, async (route) => {
          const response = await route.fetch();
          assert.ok(response.ok());
          acceptedJob = (await response.json()).id;
          await route.abort('internetdisconnected');
        });
        await start.click();
        await importDialog.getByRole('alert').waitFor();
        assert.ok(acceptedJob);
        await page.unroute(completion);
        const resumed = page.waitForResponse((response) => response.url().endsWith('/crm/jobs/uploads') && response.request().method() === 'POST');
        await start.click();
        assert.equal((await (await resumed).json()).id, acceptedJob);
        await importDialog.getByText(t('تم تجهيز الاستيراد', 'Import queued'), { exact: false }).waitFor();
        assert.equal((await api('/crm/jobs', token)).filter((job) => job.id === acceptedJob).length, 1);
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
        const list = lists.find((item) => item.name === 'Returning travelers');
        await page.goto(web + '/dashboard/crm?contact=' + contacts[9].id);
        const record = page.getByRole('region', { name: profileTitle });
        await record
          .getByText(t('بيانات وإعدادات إضافية', 'More details and settings'), { exact: true })
          .click();
        await record.getByRole('button', { name: t('القوائم', 'Lists'), exact: true }).click();
        await record.locator('select[name=list]').selectOption(list.id);
        await record
          .getByRole('button', { name: t('إضافة للقائمة', 'Add to List'), exact: true })
          .click();
        await record.getByRole('button', { name: t('إزالة', 'Remove'), exact: true }).click();
        await record
          .getByRole('button', { name: t('إزالة', 'Remove'), exact: true })
          .waitFor({ state: 'hidden' });
        assert.equal(
          (await api('/crm/contacts/' + contacts[9].id + '/profile', token)).lists.length,
          0,
        );
        await record.getByRole('button', { name: t('الموظف', 'Agent'), exact: true }).click();
        await record.locator('select[name=owner]').selectOption(staffId);
        const ownerSaved = page.waitForResponse(
          (res) => res.url().endsWith('/profile') && res.request().method() === 'PATCH',
        );
        await record
          .getByRole('button', { name: t('حفظ الموظف', 'Save Agent'), exact: true })
          .click();
        assert.ok((await ownerSaved).ok());
        assert.equal((await api('/crm/contacts/' + contacts[9].id, token)).owner_id, staffId);
        await record.getByRole('button', { name: t('الوسوم', 'Labels'), exact: true }).click();
        await record.locator('input[name=tag]').fill('qa-browser-label');
        await record
          .getByRole('button', { name: t('إضافة الوسم', 'Add Label'), exact: true })
          .click();
        await record
          .getByRole('button', { name: t('إزالة', 'Remove') + ' qa-browser-label', exact: true })
          .click();
        await record
          .getByRole('button', { name: t('إزالة', 'Remove') + ' qa-browser-label', exact: true })
          .waitFor({ state: 'hidden' });
        await page.goto(web + '/dashboard/crm?contact=' + conversation.contact_id);
        const consentRecord = page.getByRole('region', { name: profileTitle });
        await consentRecord
          .getByText(t('بيانات وإعدادات إضافية', 'More details and settings'), { exact: true })
          .click();
        await consentRecord
          .getByRole('button', { name: t('موافقة التسويق', 'Marketing Consent'), exact: true })
          .click();
        await consentRecord.locator('select[name=status]').selectOption('opted_out');
        await consentRecord.locator('input[name=evidence]').fill('Synthetic consent withdrawal');
        await consentRecord
          .getByRole('button', { name: t('حفظ الموافقة', 'Record Consent'), exact: true })
          .click();
        await consentRecord.getByText('Synthetic consent withdrawal', { exact: true }).waitFor();
        assert.equal(
          (
            await api('/crm/contacts/' + conversation.contact_id + '/profile', token)
          ).timeline.consent.find((c) => c.channel_id === channel.id).status,
          'opted_out',
        );
        await page.goto(web + '/dashboard/crm');
        await page
          .getByRole('searchbox', { name: t('بحث عن عميل', 'Search customers'), exact: true })
          .fill('Design client 9');
        await page
          .getByRole('checkbox', { name: t('تحديد ', 'Select ') + 'Design client 9', exact: true })
          .check();
        await page
          .getByRole('button', { name: t('إجراءات جماعية', 'Bulk Actions'), exact: true })
          .click();
        const bulk = page.locator('form').filter({
          has: page.getByRole('button', {
            name: t('تطبيق على المحددين', 'Apply to selected'),
            exact: true,
          }),
        });
        await bulk.locator('input[name=tags]').fill('qa-bulk-label');
        await bulk.getByText(/Design client 9/).waitFor();
        const applyBulk = bulk.getByRole('button', { name: t('تطبيق على المحددين', 'Apply to selected'), exact: true });
        page.once('dialog', (dialog) => dialog.dismiss());
        await applyBulk.click();
        assert.equal((await api('/crm/contacts/' + contacts[9].id, token)).tags.includes('qa-bulk-label'), false);
        page.once('dialog', (dialog) => dialog.accept());
        const bulkSaved = page.waitForResponse(
          (res) => res.url().endsWith('/contacts/bulk') && res.request().method() === 'POST',
        );
        await bulk
          .getByRole('button', { name: t('تطبيق على المحددين', 'Apply to selected'), exact: true })
          .click();
        assert.ok((await bulkSaved).ok());
        assert.ok(
          (await api('/crm/contacts/' + contacts[9].id, token)).tags.includes('qa-bulk-label'),
        );
        await page.goto(web + '/dashboard/crm');
        const searchBulk = page.getByRole('searchbox', { name: t('بحث عن عميل', 'Search customers'), exact: true });
        const selectPage = page.getByRole('checkbox', { name: t('تحديد عملاء الصفحة', 'Select this page'), exact: true });
        const bulkButton = page.getByRole('button', { name: t('إجراءات جماعية', 'Bulk Actions'), exact: true });
        await selectPage.check();
        await bulkButton.waitFor();
        await page.getByRole('button', { name: t('عملاء مؤهلون', 'Qualified'), exact: true }).click();
        await bulkButton.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: t('الكل', 'All'), exact: true }).click();
        await selectPage.check();
        await bulkButton.waitFor();
        await page.getByRole('button', { name: t('التالي', 'Next'), exact: true }).click();
        await bulkButton.waitFor({ state: 'hidden' });
        await selectPage.check();
        await bulkButton.waitFor();
        await searchBulk.fill('Nour');
        await bulkButton.waitFor({ state: 'hidden' });
        await selectPage.check();
        await page.getByRole('button', { name: t('الأرشيف', 'Archived'), exact: true }).click();
        await bulkButton.waitFor({ state: 'hidden' });
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
        await page.goto(web + '/dashboard/crm');
        await page.getByRole('button', { name: t('إدارة', 'Manage'), exact: true }).click();
        await page
          .getByRole('button', { name: t('ملفات مكررة ودمج', 'Duplicates and merge'), exact: true })
          .click();
        const mergeTool = page
          .locator('section')
          .filter({
            has: page.getByRole('heading', {
              name: t('معاينة ودمج الملفات المكررة', 'Preview and merge duplicate profiles'),
              exact: true,
            }),
          })
          .last();
        await mergeTool
          .getByText(t('التطابقات المكتشفة', 'Detected matches'), { exact: true })
          .click();
        await mergeTool
          .getByText(t('لا توجد تطابقات', 'No matches found'), { exact: true })
          .waitFor();
        await mergeTool.locator('select').nth(0).selectOption(contacts[9].id);
        await mergeTool.locator('select').nth(1).selectOption(contacts[10].id);
        await mergeTool
          .getByRole('button', {
            name: t('معاينة التأثير والتعارضات', 'Preview impact and conflicts'),
            exact: true,
          })
          .click();
        await mergeTool
          .getByRole('heading', { name: t('الملف الأساسي', 'Target profile'), exact: true })
          .waitFor();
        await shot('merge-preview');
        const otherVisitor = await api('/widget/' + channel.external_id + '/session', null, {});
        const conflictingMessage = await fetch(
          base + '/widget/' + channel.external_id + '/messages?visitorId=' + otherVisitor.visitorId,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-visitor-token': otherVisitor.token },
            body: JSON.stringify({ text: 'Synthetic separate identity', clientMsgId: uuid() }),
          },
        );
        assert.ok(conflictingMessage.ok);
        const conversations = (await api('/conversations', token)).items;
        const conflict = conversations.find(
          (item) => item.contact_id && item.contact_id !== conversation.contact_id,
        );
        assert.ok(conflict);
        const blocked = await api(
          '/crm/contacts/' +
            conversation.contact_id +
            '/merge-preview?sourceId=' +
            conflict.contact_id,
          token,
        );
        assert.equal(blocked.canMerge, false);
        assert.equal(blocked.identities.length, 1);
        await mergeTool.getByText(t('اختيار بالمعرّف', 'Select by ID'), { exact: true }).click();
        await mergeTool
          .getByLabel(t('معرّف الأساسي', 'Target ID'), { exact: true })
          .fill(conversation.contact_id);
        await mergeTool
          .getByLabel(t('معرّف المكرر', 'Source ID'), { exact: true })
          .fill(conflict.contact_id);
        await mergeTool
          .getByRole('button', {
            name: t('معاينة التأثير والتعارضات', 'Preview impact and conflicts'),
            exact: true,
          })
          .click();
        await mergeTool
          .getByText(
            t(
              'تعارض هوية القناة؛ يتطلب مراجعة بشرية',
              'Channel identity conflict; manual review required',
            ),
            { exact: false },
          )
          .waitFor();
        assert.equal(
          await mergeTool
            .getByRole('button', { name: t('دمج بعد المراجعة', 'Merge after review'), exact: true })
            .isEnabled(),
          false,
        );
        await shot('merge-conflict');

        if (managerRun)
          await page.evaluate(
            (session) => localStorage.setItem('session', JSON.stringify(session)),
            managerSession,
          );
        await page.goto(web + '/dashboard/crm/reports');
        const exportReport = page.waitForEvent('download');
        await page.getByRole('button', { name: t('تصدير CSV', 'Export CSV'), exact: true }).click();
        const reportFile = await exportReport;
        assert.equal(reportFile.suggestedFilename(), 'boat-crm-report.csv');
        const reportCsv = readFileSync(await reportFile.path(), 'utf8');
        assert.match(reportCsv, /EGP/);
        assert.match(reportCsv, /Mona Adel/);
        await page.locator('a[href*="currency=EGP"]').first().click();
        await page.waitForURL(
          (url) => url.pathname.endsWith('/pipeline') && url.searchParams.get('currency') === 'EGP',
        );
        await page
          .getByRole('button', {
            name: t('إزالة فلتر العملة', 'Clear currency filter'),
            exact: true,
          })
          .waitFor();
        await page.goto(web + '/dashboard/crm/reports');

        await page
          .getByRole('link', {
            name: t('المتابعات المتأخرة', 'Overdue follow-ups') + ': Mona Adel',
            exact: true,
          })
          .click();
        await page.waitForURL(
          (url) =>
            url.pathname.endsWith('/tasks') &&
            url.searchParams.get('period') === 'overdue' &&
            url.searchParams.get('ownerId') === staffId,
        );
        await page.goto(web + '/dashboard/crm/reports');
        const periodFilter = page.getByLabel(t('فترة التقرير', 'Report period'), { exact: true });
        for (const period of ['1', '7', '30', 'month']) {
          const requested = page.waitForResponse(
            (r) => r.url().includes('/crm/workspace/analytics?from=') && r.ok(),
          );
          await periodFilter.selectOption(period);
          const report = await (await requested).json();
          assert.ok(report.from && report.to && report.timezone);
        }
        await periodFilter.selectOption('custom');
        await page.getByLabel(t('من تاريخ', 'From date'), { exact: true }).fill('2000-01-01');
        const custom = page.waitForResponse(
          (r) => r.url().includes('from=2000-01-01&to=2000-01-02') && r.ok(),
        );
        await page.getByLabel(t('إلى تاريخ', 'To date'), { exact: true }).fill('2000-01-02');
        const historical = await (await custom).json();
        assert.equal(historical.contacts.new, 0);
        assert.equal(historical.sales.length, 0);
        const personal = page.waitForResponse((r) => r.url().includes('mine=true') && r.ok());
        await page.getByRole('button', { name: t('الفريق كله', 'All team'), exact: true }).click();
        assert.equal((await (await personal).json()).scope, 'mine');
        await page.goto(web + '/dashboard/crm/advanced');
        await page.getByText(t('تقييم العملاء', 'Customer scoring'), { exact: true }).click();
        const scoring = page.locator('form').filter({
          has: page.getByRole('button', { name: t('حفظ القواعد', 'Save rules'), exact: true }),
        });
        await scoring.locator('input[name=email]').fill('12');
        await scoring
          .getByRole('button', { name: t('حفظ القواعد', 'Save rules'), exact: true })
          .click();
        await page
          .getByText(t('حُفظت قواعد التقييم', 'Scoring rules saved'), { exact: true })
          .waitFor();
        assert.equal((await api('/crm/workspace/scoring', token)).rules.email, 12);
        await page.getByText(t('أتمتة CRM', 'CRM automation'), { exact: true }).click();
        const automation = page.locator('form').filter({
          has: page.getByRole('button', {
            name: t('معاينة واختبار اصطناعي', 'Preview & synthetic test'),
            exact: true,
          }),
        });
        await automation
          .getByLabel(t('اسم القاعدة', 'Rule name'), { exact: true })
          .fill('Synthetic acceptance rule');
        await automation
          .getByLabel(t('بوجود وسم (اختياري)', 'With tag (optional)'), { exact: true })
          .fill('reviewed');
        await automation
          .getByLabel(t('مرحلة العميل (اختياري)', 'Customer lifecycle (optional)'), { exact: true })
          .selectOption('qualified');
        await automation
          .getByLabel(t('العنوان', 'Title'), { exact: true })
          .fill('Synthetic follow-up only');
        await automation
          .getByRole('button', {
            name: t('معاينة واختبار اصطناعي', 'Preview & synthetic test'),
            exact: true,
          })
          .click();
        await page
          .getByText(t('المعاينة الاصطناعية مطابقة', 'Synthetic preview matched'), { exact: false })
          .waitFor();
        await shot('automation-preview');
        const saveRule = automation.getByRole('button', { name: t('حفظ القاعدة', 'Save rule'), exact: true });
        const ruleTag = automation.getByLabel(t('بوجود وسم (اختياري)', 'With tag (optional)'), { exact: true });
        await ruleTag.fill('another-tag');
        await ruleTag.fill('reviewed');
        assert.equal(await saveRule.isEnabled(), false);
        await automation.getByRole('button', {
          name: t('معاينة واختبار اصطناعي', 'Preview & synthetic test'),
          exact: true,
        }).click();
        await page.getByText(t('المعاينة الاصطناعية مطابقة', 'Synthetic preview matched'), { exact: false }).waitFor();
        await saveRule.click();
        await page.getByText(t('حُفظت القاعدة', 'Rule saved'), { exact: false }).waitFor();
        const saved = (await api('/automations', token)).find(
          (r) => r.name === 'Synthetic acceptance rule',
        );
        await page
          .getByRole('link', { name: t('فتح القاعدة المحفوظة', 'Open saved rule'), exact: true })
          .click();
        const editor = page.locator('form').filter({
          has: page.getByRole('button', { name: t('حفظ المسار', 'Save sequence'), exact: true }),
        });
        await editor
          .getByLabel(t('الاسم', 'Name'), { exact: true })
          .fill('Synthetic reviewed rule');
        const savedResponse = page.waitForResponse(
          (r) => r.url().endsWith('/automations/' + saved.id) && r.request().method() === 'PATCH',
        );
        await editor
          .getByRole('button', { name: t('حفظ المسار', 'Save sequence'), exact: true })
          .click();
        assert.ok((await savedResponse).ok());
        await page.goto(web + '/dashboard/automations');
        const autoCard = page.locator('.auto-card').filter({ hasText: 'Synthetic reviewed rule' });
        page.once('dialog', (dialog) => dialog.accept());
        await autoCard
          .getByRole('switch', { name: t('تفعيل القاعدة', 'Enable rule'), exact: true })
          .click();
        await autoCard
          .getByRole('switch', { name: t('إيقاف القاعدة', 'Disable rule'), exact: true })
          .click();
        await autoCard
          .getByRole('switch', { name: t('تفعيل القاعدة', 'Enable rule'), exact: true })
          .waitFor();
        assert.equal(
          (await api('/automations', token)).find((r) => r.id === saved.id).enabled,
          false,
        );
        if (process.env.CRM_QA_SEQUENCE === '1') {
          const me = await api('/auth/me', token);
          const tenantId =
            me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
          const { channelId } = await api('/__qa/crm', null, {
            tenantId,
            op: 'inbound',
            phone: '201002345678',
          });
          const linked = (await api('/conversations', token)).items.find(
            (item) => item.channel_id === channelId,
          );
          assert.ok(linked);
          const sequence = await api('/sequences', token, {
            name: 'Synthetic sequence acceptance',
            channelId,
            steps: [
              {
                id: 'step1',
                delay: { amount: 1000, unit: 'hours' },
                content: { text: 'Synthetic event only' },
              },
            ],
          });
          await api(
            '/sequences/' + sequence.id + '/status',
            token,
            { status: 'active', expectedRevision: sequence.revision },
            'PATCH',
          );
          await page.goto(web + '/dashboard/crm?contact=' + linked.contact_id);
          const card = page.getByRole('region', { name: profileTitle });
          await card
            .getByText(t('بيانات وإعدادات إضافية', 'More details and settings'), { exact: true })
            .click();
          await card
            .getByRole('button', { name: t('التسلسلات', 'Sequences'), exact: true })
            .click();
          await card.locator('select[name=sequence]').selectOption(sequence.id);
          await card
            .getByRole('button', { name: t('إضافة للتسلسل', 'Enroll'), exact: true })
            .click();
          await card
            .getByRole('button', { name: t('إيقاف للمشترك', 'Stop for subscriber'), exact: true })
            .click();
          await card
            .getByRole('button', { name: t('إيقاف للمشترك', 'Stop for subscriber'), exact: true })
            .waitFor({ state: 'hidden' });
          assert.equal(
            (await api('/crm/contacts/' + linked.contact_id + '/profile', token)).sequences.find(
              (x) => x.id === sequence.id,
            ).status,
            'stopped',
          );
        }
        await page.goto(web + '/dashboard/crm/sales');
        await page
          .getByRole('button', {
            name: t('اختبار السياسة المحفوظة دون إسناد', 'Test saved policy without assignment'),
            exact: true,
          })
          .click();
        await page.locator('output[role=status]').waitFor();
        const assignment = page.locator('form').filter({
          has: page.getByRole('heading', {
            name: t('توزيع العملاء', 'Lead assignment'),
            exact: true,
          }),
        });
        await assignment
          .getByText(t('الموظفون المؤهلون للتوزيع', 'Eligible employees'), { exact: false })
          .click();
        await assignment.getByRole('checkbox', { name: 'Mona Adel', exact: true }).check();
        await assignment.getByRole('checkbox', { name: 'CRM design QA', exact: true }).check();
        await assignment
          .getByRole('checkbox', {
            name: t('تشغيل التوزيع التلقائي', 'Enable automatic assignment'),
            exact: true,
          })
          .check();
        await assignment
          .getByRole('button', { name: t('حفظ الإعدادات', 'Save settings'), exact: true })
          .click();
        await page.getByText(t('تم حفظ الإعدادات.', 'Settings saved.'), { exact: true }).waitFor();
        const assignmentSettings = await api('/crm/sales/settings', token);
        assert.equal(assignmentSettings.assignment.enabled, true);
        assert.ok(assignmentSettings.assignment.memberIds.includes(staffId));
        assert.ok(assignmentSettings.assignment.memberIds.includes(owner));
        await shot('assignment-preview');
        await page.goto(web + '/dashboard/crm/notifications');
        const notificationPanel = page.locator('main');
        const unread = notificationPanel.getByRole('button', {
          name: t('غير مقروء', 'Unread'),
          exact: true,
        });
        await unread.click();
        const noticeToken = managerSession.accessToken;
        const notices = await api('/crm/sales/notifications?tab=unread', noticeToken);
        assert.ok(notices.items.length > 0);
        const handled = page.waitForResponse(
          (r) => r.url().includes('/crm/sales/notifications/') && r.request().method() === 'POST',
        );
        await notificationPanel
          .locator('article')
          .first()
          .getByRole('button', { name: t('تم التعامل معها', 'Mark handled'), exact: true })
          .click();
        assert.ok((await handled).ok());
        await notificationPanel
          .getByRole('button', { name: t('تم التعامل معها', 'Handled'), exact: true })
          .first()
          .click();
        await notificationPanel.locator('article').first().waitFor();
        assert.ok(
          (await api('/crm/sales/notifications?tab=handled', noticeToken)).items.length > 0,
        );
        await shot('notifications-handled');
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
      if (workflow && process.env.CRM_QA_FIRST_CONTACT === '1') {
        const me = await api('/auth/me', token);
        const tenantId = me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
        const { channelId } = await api('/__qa/crm', null, { tenantId, op: 'outbound-channel' });
        const first = await api('/crm/contacts', token, { name: 'Synthetic first contact', phone: '+12025550136' });
        const path = '/crm/contacts/' + first.id;
        const startPath = path + '/start-conversation';
        const payload = { channelId, name: 'qa_first_contact', language: 'en' };
        async function expectDenied(accessToken, expected) {
          const response = await fetch(base + startPath, {
            method: 'POST',
            headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          assert.equal(response.status, expected);
        }
        await expectDenied(agent.accessToken, 403);
        await expectDenied(token, 400);
        await api(path + '/consent', token, { channelId, status: 'opted_in', evidence: 'Isolated QA consent' }, 'PUT');
        await page.evaluate((value) => localStorage.setItem('session', JSON.stringify(value)), session);
        await page.goto(web + '/dashboard/crm?contact=' + first.id);
        await page.getByRole('button', { name: t('بدء محادثة', 'Start conversation'), exact: true }).click();
        await page.getByRole('combobox', { name: t('قناة واتساب والقالب', 'WhatsApp channel and template') }).selectOption(channelId + ':qa_first_contact:en');
        await page.getByText('Synthetic greeting', { exact: true }).waitFor();
        const send = page.getByRole('button', { name: t('إرسال القالب', 'Send template'), exact: true });
        page.once('dialog', (dialog) => dialog.dismiss());
        await send.click();
        assert.equal((await api(path + '/profile', token)).timeline.conversations.length, 0);
        await api(path + '/consent', token, { channelId, status: 'opted_out', evidence: 'Isolated QA withdrawal' }, 'PUT');
        page.once('dialog', (dialog) => dialog.accept());
        await send.click();
        await page.getByRole('alert').getByText(/customer opt-in/).waitFor();
        assert.equal((await api(path + '/profile', token)).timeline.conversations.length, 0);
        await api(path + '/consent', token, { channelId, status: 'opted_in', evidence: 'Isolated QA consent renewed' }, 'PUT');
        page.once('dialog', (dialog) => dialog.accept());
        await send.click();
        await page.getByText(t('تمت جدولة الرسالة الأولى.', 'First message queued.'), { exact: true }).waitFor();
        const repeated = await api(startPath, token, payload);
        assert.equal(repeated.started, false);
        assert.equal((await api(path + '/profile', token)).timeline.conversations.length, 1);
        const messages = (await api('/conversations/' + repeated.id + '/messages', token)).items;
        assert.equal(messages.filter((message) => message.direction === 'out').length, 1);
      }
      if (workflow && process.env.CRM_QA_VOLUME === '1') {
        const me = await api('/auth/me', token);
        const tenantId = me.user.tenantId || me.user.tenant_id || me.tenant?.id || me.workspaces[0].tenant_id;
        await api('/__qa/crm', null, {
          tenantId,
          op: 'work-volume',
          pipelineId: pipeline.id,
          contactId: contacts[0].id,
          staffId,
        });
        await page.goto(web + '/dashboard/crm/pipeline');
        await page.getByRole('combobox', { name: t('خط المبيعات', 'Pipeline'), exact: true }).selectOption(pipeline.id);
        await page.getByRole('textbox', { name: t('بحث', 'Search work'), exact: true }).fill('Kanban volume');
        const mobileStage = page.getByRole('combobox', { name: t('مرحلة البيع', 'Pipeline stage'), exact: true });
        if (await mobileStage.isVisible()) await mobileStage.selectOption('Proposal');
        const fullCount = page.getByRole('heading', { name: 'Proposal 106', exact: true });
        await fullCount.waitFor();
        assert.equal(await page.locator('[data-work-card]').count(), 50);
        const nextPage = page.getByRole('button', { name: t('التالي', 'Next'), exact: true });
        await nextPage.click();
        await fullCount.waitFor();
        await nextPage.click();
        await fullCount.waitFor();
        assert.equal(await page.locator('[data-work-card]').count(), 6);
        await shot('pipeline-paginated-total');
      }
      assert.deepEqual(errors, []);
      results.push({
        language,
        width,
        height,
        mode,
        status: 'PASS',
        role: before ? 'owner' : managerRun ? 'owner, admin and agent' : 'owner and agent',
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
