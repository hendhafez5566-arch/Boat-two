/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
const local = createRequire(import.meta.url);
const { chromium } = local(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const api = 'http://127.0.0.1:4000',
  web = 'http://localhost:3000',
  out = process.env.BOAT_QA_OUT || 'docs/acceptance/2026-11-01-pr4';
fs.mkdirSync(out, { recursive: true });
async function call(path, body, token, method = body ? 'POST' : 'GET', status) {
  const r = await fetch(api + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (status) assert.equal(r.status, status, path);
  else assert.ok(r.ok, path + ' ' + text);
  return data;
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BOAT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const checks = [],
    errs = [],
    tenants = [];
  let page;
  try {
    for (const [i, business] of ['Travel QA', 'Restaurant QA', 'Store QA'].entries()) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(() => {
        if (!localStorage.getItem('boat-language')) localStorage.setItem('boat-language', 'en');
      });
      await page.goto(web + '/register');
      await page.locator('input[name=fullName]').fill('Local QA Owner');
      await page
        .locator('input[name=workspaceName]')
        .fill(business + ' ' + randomUUID().slice(0, 8));
      await page.locator('input[name=email]').fill('qa-' + randomUUID() + '@example.test');
      await page.locator('input[name=password]').fill('Local-QA-' + randomUUID());
      await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
      await page.waitForURL('**/dashboard/onboarding');
      const session = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
      const token = session.accessToken;
      const workspace = await call('/workspace', null, token);
      assert.equal(workspace.role, 'owner');
      assert.deepEqual(
        await call('/flows', null, token),
        [],
        'new tenant must not have a tourism bot',
      );
      assert.deepEqual(await call('/commerce/sources', null, token), []);
      const channel = await call('/channels', { type: 'web', name: business + ' Website' }, token);
      await call('/workspace/onboarding/complete', {}, token);
      await page.goto(web + '/dashboard/channels');
      await page
        .getByText(business + ' Website', { exact: false })
        .first()
        .waitFor();
      if (i === 0) await page.screenshot({ quality: 75, path: out + '/full-channels-en.jpg' });
      await page.goto(web + '/dashboard/commerce');
      await page.getByRole('button', { name: 'Data sources', exact: true }).click();
      await page.getByLabel('Source name', { exact: true }).fill(business + ' Catalog');
      const csv = 'id,name,category,price,visible\nitem1,' + business + ' item,General,100,true\n';
      await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'catalog.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.getByRole('checkbox', { name: 'price', exact: true }).check();
      await page.getByRole('button', { name: 'Review customer preview', exact: true }).click();
      await page.getByRole('button', { name: 'Apply previewed update', exact: true }).click();
      await page
        .getByRole('button', { name: 'Apply previewed update', exact: true })
        .waitFor({ state: 'hidden' });
      await page.getByText('price: 100', { exact: true }).waitFor();
      const sources = await call('/commerce/sources', null, token);
      assert.equal(sources.length, 1);
      const flow = await call(
        '/flows',
        { name: business + ' Bot', language: 'en', channelIds: [channel.id] },
        token,
      );
      const graph = {
        startNodeId: 'catalog',
        nodes: [
          {
            id: 'catalog',
            type: 'catalog',
            position: { x: 0, y: 0 },
            data: {
              text: 'Choose an item',
              sourceId: sources[0].id,
              category: 'General',
              fields: ['price'],
              native: false,
              productIds: [],
              selectable: true,
            },
            edges: { next: 'staff' },
          },
          {
            id: 'staff',
            type: 'handoff',
            position: { x: 500, y: 0 },
            data: { message: 'Staff will follow up' },
            edges: {},
          },
        ],
      };
      await call('/flows/' + flow.id, { graph, channelIds: [channel.id] }, token, 'PATCH');
      await call('/flows/' + flow.id + '/publish', {}, token);
      await page.goto(web + '/dashboard/flows/' + flow.id);
      await page.getByRole('button', { name: 'Publish update', exact: true }).waitFor();
      await page.locator('.react-flow__node[data-id=catalog]').click();
      await page.getByRole('button', { name: 'Edit step', exact: true }).click();
      await page.getByRole('button', { name: 'Add or update a data source', exact: true }).click();
      const sourceDialog = page.getByRole('dialog', { name: 'Bot catalog', exact: true });
      await sourceDialog
        .getByRole('combobox', { name: 'Source', exact: true })
        .selectOption(sources[0].id);
      await sourceDialog
        .getByLabel('Source name', { exact: true })
        .fill(business + ' Catalog updated');
      let prompted = false;
      page.once('dialog', async (d) => {
        prompted = true;
        await d.dismiss();
      });
      await sourceDialog.getByRole('button', { name: 'Close / إغلاق', exact: true }).click();
      assert.ok(prompted);
      assert.ok(await sourceDialog.isVisible());
      page.once('dialog', async (d) => d.accept());
      await sourceDialog.getByRole('button', { name: 'Close / إغلاق', exact: true }).click();
      await page.getByRole('button', { name: 'Add or update a data source', exact: true }).click();
      const updateDialog = page.getByRole('dialog', { name: 'Bot catalog', exact: true });
      await updateDialog
        .getByRole('combobox', { name: 'Source', exact: true })
        .selectOption(sources[0].id);
      await updateDialog
        .locator('input[type=file]')
        .setInputFiles({
          name: 'updated.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv.replace('100', '125')),
        });
      await updateDialog
        .getByRole('button', { name: 'Review customer preview', exact: true })
        .click();
      await updateDialog
        .getByRole('button', { name: 'Apply previewed update', exact: true })
        .click();
      await updateDialog.waitFor({ state: 'hidden' });
      const updated = await call('/commerce/sources/' + sources[0].id + '/items', null, token);
      assert.equal(updated.items[0].dynamic_fields.find((f) => f.label === 'price').value, '125');
      assert.equal(
        await page.getByRole('combobox', { name: 'Category', exact: true }).inputValue(),
        'General',
      );
      assert.ok(await page.getByRole('checkbox', { name: 'price', exact: true }).isChecked());
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      if (i === 0) await page.screenshot({ quality: 75, path: out + '/full-builder-en.jpg' });
      await page.goto(web + '/dashboard/crm');
      await page.getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('button', { name: 'Add subscriber', exact: true }).click();
      const form = page
        .locator('form')
        .filter({ has: page.getByRole('heading', { name: 'New contact', exact: true }) });
      await form.getByRole('textbox', { name: 'Name', exact: true }).fill(business + ' Customer');
      await form
        .getByRole('textbox', { name: 'Email', exact: true })
        .fill('contact-' + i + '@example.test');
      await form.getByRole('button', { name: 'Save contact', exact: true }).click();
      await page.getByRole('button', { name: business + ' Customer', exact: true }).waitFor();
      if (i === 0) await page.screenshot({ quality: 75, path: out + '/full-crm-en.jpg' });
      const contacts = await call('/crm/contacts', null, token);
      assert.ok(contacts.items.some((c) => c.name === business + ' Customer'));
      await page.goto(web + '/dashboard/team');
      const inviteForm = page
        .locator('form')
        .filter({ has: page.getByRole('button', { name: 'Create invitation link', exact: true }) });
      await inviteForm
        .getByLabel('Email', { exact: true })
        .fill('agent-' + randomUUID() + '@example.test');
      const inviteResponse = page.waitForResponse(
        (r) => r.url().endsWith('/team/invitations') && r.request().method() === 'POST',
      );
      await inviteForm.getByRole('button', { name: 'Create invitation link', exact: true }).click();
      const invite = await (await inviteResponse).json();
      const agent = await call('/auth/accept-invitation', {
        token: new URL(invite.inviteUrl).searchParams.get('token'),
        password: 'Local-Agent-' + randomUUID(),
        fullName: business + ' Agent',
      });
      await call(
        '/team/invitations',
        { email: 'denied@example.test', role: 'agent', sendEmail: false },
        agent.accessToken,
        'POST',
        403,
      );
      await page.goto(web + '/dashboard/team');
      await page.getByText(business + ' Agent', { exact: true }).waitFor();
      if (i === 0) await page.screenshot({ quality: 75, path: out + '/full-team-en.jpg' });
      // Receive a real local Webchat event. No provider or external customer is contacted.
      const visitor = await call('/widget/' + channel.external_id + '/session', {});
      const sent = await fetch(
        api + '/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
          body: JSON.stringify({ text: 'Local QA inbound', clientMsgId: randomUUID() }),
        },
      );
      assert.ok(sent.ok, await sent.text());
      const conversations = await call('/conversations', null, token);
      const rows = Array.isArray(conversations) ? conversations : conversations.items;
      assert.ok(rows.length);
      const conversation = rows[0];
      await page.goto(web + '/dashboard/inbox');
      await page
        .getByRole('button', { name: /Visitor/ })
        .first()
        .click();
      await call('/conversations/' + conversation.id + '/takeover', {}, token);
      assert.equal(
        (await call('/conversations/' + conversation.id, null, token)).handled_by,
        'human',
      );
      await call(
        '/conversations/' + conversation.id + '/notes',
        { text: 'Internal local QA note' },
        token,
      );
      await call('/conversations/' + conversation.id + '/release', {}, token);
      assert.equal(
        (await call('/conversations/' + conversation.id, null, token)).handled_by,
        'bot',
      );
      if (i === 0) await page.screenshot({ quality: 75, path: out + '/full-inbox-en.jpg' });
      await page.goto(web + '/dashboard/campaigns');
      await page.getByRole('button', { name: /Create Campaign/ }).click();
      await page.getByLabel('Campaign name', { exact: true }).fill(business + ' Draft');
      await page.getByRole('button', { name: 'Review audience', exact: true }).click();
      await page.getByText(/Matching filters:/).waitFor();
      await page
        .getByRole('textbox', { name: 'Message content', exact: true })
        .fill('Draft only; never sent');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page
        .getByRole('button', { name: 'Save draft', exact: true })
        .waitFor({ state: 'hidden' });
      await page
        .getByText('Campaign draft saved. Review and schedule it below.', { exact: true })
        .waitFor();
      await page.getByText(business + ' Draft', { exact: true }).waitFor();
      const campaigns = await call(
        '/campaigns?channelType=web&channelId=' + channel.id,
        null,
        token,
      );
      const campaign = (Array.isArray(campaigns) ? campaigns : campaigns.items).find(
        (c) => c.name === business + ' Draft',
      );
      assert.ok(campaign, JSON.stringify(campaigns));
      assert.equal(campaign.status, 'draft');
      if (i === 0)
        await page.screenshot({ quality: 75, path: out + '/full-campaign-draft-en.jpg' });
      for (const tenant of tenants) {
        await call('/commerce/sources/' + tenant.source + '/items', null, token, 'GET', 404);
        await call('/flows/' + tenant.flow, null, token, 'GET', 404);
        await call('/crm/contacts/' + tenant.contact, null, token, 'GET', 404);
      }
      tenants.push({ source: sources[0].id, flow: flow.id, contact: contacts.items[0].id });
      for (const route of [
        '/dashboard',
        '/dashboard/flows',
        '/dashboard/channels',
        '/dashboard/crm',
        '/dashboard/campaigns',
        '/dashboard/settings',
      ]) {
        await page.goto(web + route);
        await page.locator('main').waitFor();
        assert.ok(!(await page.locator('body').innerText()).includes('Internal server error'));
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(web + '/dashboard/channels');
      await page
        .getByText(business + ' Website', { exact: false })
        .first()
        .waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      if (i === 0)
        await page.screenshot({ quality: 75, path: out + '/full-channels-mobile-en.jpg' });
      await page.evaluate(() => localStorage.setItem('boat-language', 'ar'));
      await page.reload();
      assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
      if (i === 0)
        await page.screenshot({ quality: 75, path: out + '/full-channels-mobile-ar.jpg' });
      for (const route of [
        '/dashboard/flows',
        '/dashboard/crm',
        '/dashboard/campaigns',
        '/dashboard/settings',
      ]) {
        await page.goto(web + route);
        await page.locator('main').waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          route + ' mobile RTL overflow',
        );
      }
      checks.push(
        business +
          ': UI signup/onboarding, generic empty tenant, real catalog import, flow publish/editor, unsaved-source protection, CRM contact, invitation/agent RBAC, local Webchat Inbox takeover/release/note, campaign draft, isolation and mobile',
      );
      await context.close();
    }
    assert.deepEqual(errs, []);
    fs.writeFileSync(
      out + '/full-results.json',
      JSON.stringify(
        {
          passed: true,
          checks,
          pageErrors: errs,
          limits: [
            'embedded PostgreSQL transport; complete Nest AppModule and all current migrations',
            'external delivery and background timers disabled',
            'no Google OAuth or Meta live reply tested',
          ],
        },
        null,
        2,
      ),
    );
    console.log('PASS FULL APP', checks);
  } catch (e) {
    if (page && !page.isClosed()) {
      await page.screenshot({ quality: 75, path: out + '/full-failure.jpg' });
      console.error((await page.locator('body').innerText()).slice(-6000));
    }
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
