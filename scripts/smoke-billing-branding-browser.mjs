/* global localStorage, window, document, innerWidth */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url)),
  { DatabaseService } = local('./dist/database/database.service.js'),
  { ExternalEffects } = local('./dist/events/external-effect.js'),
  { env } = local('./dist/config/env.js'),
  { BillingService } = local('./dist/billing/billing.service.js'),
  Stripe = local('stripe'),
  { chromium } = local(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright-core');
env.STRIPE_SECRET_KEY = 'sk_test_browser_fixture_no_network';
env.STRIPE_WEBHOOK_SECRET = 'whsec_browser_fixture';
const db = new DatabaseService(),
  billing = new BillingService(db, new ExternalEffects(db)),
  base = process.env.SMOKE_API_URL || 'http://localhost:4122',
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
let browser;
try {
  const a = await call('/auth/register', {
      email: `billing-browser-${randomUUID()}@example.test`,
      password: randomUUID() + randomUUID(),
      fullName: 'Billing fixture',
      workspaceName: 'Billing and branding acceptance',
    }),
    customer = 'cus_browser_' + randomUUID(),
    subscription = 'sub_browser_' + randomUUID(),
    created = Math.floor(Date.now() / 1000);
  await db.withTenant(a.tenantId, (c) =>
    c.query(
      "UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE code='business'),status='active',stripe_customer_id=$1,stripe_subscription_id=$2",
      [customer, subscription],
    ),
  );
  const event = {
    id: 'evt_browser_' + randomUUID(),
    type: 'invoice.payment_failed',
    object: 'event',
    created,
    data: {
      object: {
        id: 'in_browser_' + randomUUID().replaceAll('-', ''),
        number: 'LOCAL-BROWSER-001',
        customer,
        subscription,
        currency: 'usd',
        amount_due: 5000,
        amount_paid: 0,
        amount_remaining: 5000,
        status: 'open',
        attempt_count: 1,
        created,
        metadata: { tenantId: a.tenantId },
        hosted_invoice_url: 'https://invoice.stripe.com/i/local-browser',
      },
    },
    livemode: false,
    pending_webhooks: 1,
  };
  const raw = JSON.stringify(event);
  await billing.handleWebhook(
    Buffer.from(raw),
    Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET }),
  );
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
  await page.goto(web + '/dashboard/billing');
  const invoices = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Invoices and payment status', exact: true }),
  });
  await invoices.getByRole('cell', { name: 'LOCAL-BROWSER-001', exact: true }).waitFor();
  await invoices.getByRole('status').filter({ hasText: 'Payment failed' }).waitFor();
  assert.equal(
    await invoices.getByRole('link', { name: 'View at Stripe', exact: true }).getAttribute('href'),
    'https://invoice.stripe.com/i/local-browser',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Invoices & payment methods', exact: true })
      .isDisabled(),
    true,
  );
  const requests = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Subscription change requests', exact: true }),
  });
  await requests
    .getByRole('checkbox', { name: 'I confirm this change under the policy above', exact: true })
    .check();
  const [saved] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/billing/subscription-requests') && r.request().method() === 'POST',
    ),
    requests.getByRole('button', { name: 'Save request', exact: true }).click(),
  ]);
  assert.equal(saved.status(), 201);
  const jobs = await call('/billing/subscription-requests', undefined, a.accessToken);
  assert.ok(jobs.some((j) => j.kind === 'cancel' && ['pending', 'blocked'].includes(j.status)));
  assert.equal(env.EXTERNAL_DELIVERY_ENABLED, 'false');
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: shots + '/billing-fixture-desktop.png' });
  await page.goto(web + '/dashboard/branding');
  await page
    .getByRole('textbox', { name: 'Brand name', exact: true })
    .fill('Local acceptance brand');
  await page
    .getByRole('textbox', { name: 'Customer widget title', exact: true })
    .fill('Local support');
  const [brand] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/workspace/branding') && r.request().method() === 'PATCH',
    ),
    page.getByRole('button', { name: 'Save branding', exact: true }).click(),
  ]);
  assert.equal(brand.status(), 200);
  assert.equal(
    (await call('/workspace/branding', undefined, a.accessToken)).branding.name,
    'Local acceptance brand',
  );
  await page.reload();
  assert.equal(
    await page.getByRole('textbox', { name: 'Brand name', exact: true }).inputValue(),
    'Local acceptance brand',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: shots + '/branding-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Billing/branding Chromium: verified local invoice/failure display, safe document URL, disabled real portal, durable gated cancellation, saved/reopened brand and mobile passed. No Stripe/email/domain calls.',
  );
} finally {
  await browser?.close();
  await db.onModuleDestroy();
}
