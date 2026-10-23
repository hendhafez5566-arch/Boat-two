/* global localStorage,window,document,innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = local('./dist/database/database.service.js'),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
const db = new DatabaseService(),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122',
  web = process.env.SMOKE_WEB_URL || 'http://localhost:3000',
  shots = process.env.BOAT_SCREENSHOTS || '/workspace/work/ledger-acceptance';
async function call(path, body, token, status = body ? 201 : 200) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
let browser;
try {
  const register = () =>
    call('/auth/register', {
      email: `ledger-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Ledger fixture',
      workspaceName: 'Campaign ledger acceptance',
    });
  const a = await register(),
    b = await register();
  const ch = await call('/channels', { type: 'web', name: 'Local ledger channel' }, a.accessToken);
  const campaign = await call(
    '/campaigns',
    { name: 'Local ledger fixture', channelId: ch.id, content: { text: 'Local campaign' } },
    a.accessToken,
  );
  const ids = await db.withTenant(a.tenantId, async (c) => {
    await c.query("UPDATE campaigns SET status='completed' WHERE id=$1", [campaign.id]);
    const ids = {};
    for (let i = 0; i < 29; i++) {
      const name =
        i === 0
          ? 'Ambiguous recipient'
          : i === 1
            ? 'Processing failure'
            : i === 2
              ? 'Failed existing message'
              : 'Local recipient ' + i;
      const ct = (
        await c.query('INSERT INTO contacts(tenant_id,name) VALUES($1,$2) RETURNING id', [
          a.tenantId,
          name,
        ])
      ).rows[0];
      let message = null;
      if (i === 0 || i === 2) {
        const cv = (
          await c.query(
            'INSERT INTO conversations(tenant_id,channel_id,contact_id) VALUES($1,$2,$3) RETURNING id',
            [a.tenantId, ch.id, ct.id],
          )
        ).rows[0];
        message = (
          await c.query(
            "INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,error) VALUES($1,$2,$3,'out','system','text','{\"text\":\"Local fixture\"}',$4,$5) RETURNING id",
            [
              a.tenantId,
              cv.id,
              ch.id,
              i === 0 ? 'queued' : 'failed',
              i === 2 ? 'LOCAL_DELIVERY_FAILURE' : null,
            ],
          )
        ).rows[0].id;
        await c.query(
          'INSERT INTO outbound_jobs(tenant_id,message_id,status,error) VALUES($1,$2,$3,$4)',
          [
            a.tenantId,
            message,
            i === 0 ? 'ambiguous' : 'failed',
            i === 0
              ? 'Provider outcome unknown; evidence review required'
              : 'Known local fixture failure',
          ],
        );
      }
      const r = (
        await c.query(
          'INSERT INTO campaign_recipients(tenant_id,campaign_id,contact_id,status,message_id,error) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            a.tenantId,
            campaign.id,
            ct.id,
            i === 0 ? 'queued' : i <= 2 ? 'failed' : 'skipped',
            message,
            i === 1 ? 'Local processing failed' : null,
          ],
        )
      ).rows[0];
      if (i <= 2) ids[i] = r.id;
    }
    return ids;
  });
  const path = `/campaigns/${campaign.id}/recipients`;
  const all = await call(path, undefined, a.accessToken);
  assert.equal(all.filteredCount, 29);
  assert.equal(all.items.length, 25);
  assert.equal((await call(path + '?page=2', undefined, a.accessToken)).items.length, 4);
  const ambiguous = await call(path + '?jobStatus=ambiguous', undefined, a.accessToken);
  assert.equal(ambiguous.filteredCount, 1);
  assert.equal(ambiguous.items[0].can_retry, false);
  assert.ok(ambiguous.items[0].job_error.includes('unknown'));
  assert.equal(
    (
      await call(
        path + '?search=AMBIGUOUS&status=queued&deliveryStatus=queued',
        undefined,
        a.accessToken,
      )
    ).filteredCount,
    1,
  );
  assert.equal((await call(path + '?search=%25', undefined, a.accessToken)).filteredCount, 0);
  await call(path + '?jobStatus=invalid', undefined, a.accessToken, 400);
  await call(path, undefined, b.accessToken, 404);
  await call(`${path}/${ids[0]}/retry`, {}, a.accessToken, 400);
  await call(`${path}/${ids[2]}/retry`, {}, a.accessToken, 400);
  const failed = await call(path + '?search=Processing', undefined, a.accessToken);
  assert.equal(failed.items[0].can_retry, true);
  browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
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
  await page.goto(web + '/dashboard/campaigns');
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByText('29 matching recipients', { exact: true }).waitFor();
  const form = page.getByRole('region', { name: 'Campaign recipient filters', exact: true });
  await form.getByLabel('Search contact name', { exact: true }).fill('Ambiguous');
  await form.getByRole('combobox', { name: /Outbound job status/ }).selectOption('ambiguous');
  await form.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByText('1 matching recipients', { exact: true }).waitFor();
  const ledger = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Recipient & delivery ledger', exact: true }),
  });
  await ledger.getByRole('cell', { name: 'Ambiguous recipient', exact: true }).waitFor();
  assert.equal(await ledger.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
  assert.equal(await ledger.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    ledger.getByRole('button', { name: 'Download loaded page', exact: true }).click(),
  ]);
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(data.scope, 'loaded_page_only');
  assert.equal(data.items.length, 1);
  assert.equal(data.filters.jobStatus, 'ambiguous');
  assert.equal(data.items[0].job_status, 'ambiguous');
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + '/campaign-ledger-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: shots + '/campaign-ledger-mobile.png', fullPage: true });
  await form.getByLabel('Search contact name', { exact: true }).fill('No match');
  await form.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByText('No recipients match these filters.', { exact: true }).waitFor();
  await call(`${path}/${ids[1]}/retry`, {}, a.accessToken);
  await call(`${path}/${ids[1]}/retry`, {}, a.accessToken, 400);
  await db.withTenant(a.tenantId, async (c) => {
    await c.query("UPDATE campaigns SET status='canceled' WHERE id=$1", [campaign.id]);
    await c.query("UPDATE campaign_recipients SET status='failed' WHERE id=$1", [ids[1]]);
  });
  await call(`${path}/${ids[1]}/retry`, {}, a.accessToken, 400);
  assert.deepEqual(errors, []);
  console.log(
    'Campaign ledger: paged API, literal/case-insensitive search, status/job filters, isolation, safe retry denial, actual loaded-page JSON download, empty state and desktop/mobile passed. No external delivery.',
  );
} finally {
  await browser?.close();
  await db.onModuleDestroy();
}
