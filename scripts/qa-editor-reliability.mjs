/* global localStorage, getComputedStyle */
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const out = 'docs/enterprise-20261114/editor-reliability';
mkdirSync(out, { recursive: true });
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json();
  assert.ok(r.ok, path + JSON.stringify(d));
  return d;
}
const session = await api('/auth/register', null, {
  email: randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Recovery QA',
  workspaceName: 'Isolated editor reliability',
});
await api('/channels', session.accessToken, { type: 'web', name: 'Isolated editor QA' });
await api('/workspace/onboarding/complete', session.accessToken, {});
const product = await api('/commerce/products', session.accessToken, {
  name: 'Recovery product',
  sku: 'QA',
  priceCents: '100',
  currency: 'EGP',
  description: '',
});
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const results = [];
let activePage;
try {
  for (const language of ['ar', 'en']) {
    const width = language === 'ar' ? 390 : 1366;
    const context = await browser.newContext({ viewport: { width, height: 936 } });
    await context.addInitScript(
      ({ session, language }) => {
        localStorage.setItem('session', JSON.stringify(session));
        localStorage.setItem('boat-language', language);
      },
      { session, language },
    );
    const page = await context.newPage();
    activePage = page;
    page.on('dialog', (dialog) => dialog.accept());
    await page.route('**/*', (r) =>
      ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    const t = (ar, en) => (language === 'ar' ? ar : en);
    const f = await api('/flows', session.accessToken, {
      name: 'Recovery ' + language,
      channelIds: [],
    });
    const graph = {
      startNodeId: 'catalog',
      nodes: [
        {
          id: 'catalog',
          type: 'catalog',
          position: { x: 250, y: 100 },
          data: { text: 'Catalog', productIds: [product.id] },
          edges: { next: 'end' },
        },
        { id: 'end', type: 'end', position: { x: 700, y: 100 }, data: {} },
        { id: 'spare', type: 'end', position: { x: 700, y: 400 }, data: {} },
      ],
    };
    await api(
      '/flows/' + f.id,
      session.accessToken,
      { graph, expectedUpdatedAt: f.updated_at },
      'PATCH',
    );
    await page.goto('http://localhost:3000/dashboard/flows/' + f.id);
    const openNode = async () => {
      await page.locator('.react-flow__node[data-id="catalog"]').dblclick();
      await page.getByLabel(t('نص الكتالوج', 'Catalog message'), { exact: true }).waitFor();
    };
    const applyNode = () =>
      page.getByRole('button', { name: t('حفظ التغييرات', 'Save Changes'), exact: true }).click();
    await openNode();
    // Real API rejection: empty catalog text fails Zod and returns an errors dictionary.
    await page.getByLabel(t('نص الكتالوج', 'Catalog message'), { exact: true }).fill('');
    await applyNode();
    await page
      .getByRole('button', { name: t('المزيد من الأدوات', 'More tools'), exact: true })
      .click();
    await page.getByRole('button', { name: t('نشر البوت', 'Publish bot'), exact: true }).click();
    const rejected = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith('/flows/' + f.id) &&
          r.request().method() === 'PATCH' &&
          r.status() === 400,
      ),
      page.getByRole('button', { name: t('تأكيد النشر', 'Confirm publish'), exact: true }).click(),
    ]);
    const invalid = await rejected[0].json();
    assert.ok(invalid.errors && !Array.isArray(invalid.errors));
    await page.locator('.publish-outcome[data-kind="error"]').waitFor();
    assert.equal(await page.getByText(/Application error: a client-side exception/).count(), 0);
    await openNode();
    for (let i = 0; i < 24; i++)
      await page
        .getByLabel(t('نص الكتالوج', 'Catalog message'), { exact: true })
        .fill('Repeated edit ' + i);
    const pending = 'Pending settings survive crash ' + language;
    await page.getByLabel(t('نص الكتالوج', 'Catalog message'), { exact: true }).fill(pending);
    await page.waitForFunction(
      (pending) =>
        Object.keys(localStorage).some(
          (k) => k.startsWith('boat:flow-recovery:') && localStorage.getItem(k).includes(pending),
        ),
      pending,
    );
    // Controlled transport fault exercises a genuine React render exception in the statistics row.
    const statsRoute = '**/flows/' + f.id + '/stats';
    await page.route(statsRoute, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ catalog: { sent: { fault: 'controlled-render-fault' } } }),
      }),
    );
    await page.reload();
    await page
      .getByRole('heading', { name: 'تعذّر عرض مصمم البوت / Editor interrupted', exact: true })
      .waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'تنزيل نسخة الاسترجاع / Download recovery', exact: true })
      .click();
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith('-recovery.json'));
    await page.screenshot({ path: out + '/recovery-' + language + '.png', fullPage: false });
    await page.unroute(statsRoute);
    await page
      .getByRole('button', { name: 'إعادة فتح المصمم / Reopen editor', exact: true })
      .click();
    await page
      .getByRole('button', { name: t('استعادة المسودة', 'Restore draft'), exact: true })
      .click();
    assert.equal(
      await page.getByLabel(t('نص الكتالوج', 'Catalog message'), { exact: true }).inputValue(),
      pending,
    );
    await applyNode();
    // Force one expired-access response, then let the real refresh-token endpoint rotate the session.
    let expired = false;
    await page.route('**/flows/' + f.id, async (r) => {
      if (r.request().method() === 'PATCH' && !expired) {
        expired = true;
        return r.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"message":"Expired test access"}',
        });
      }
      return r.continue();
    });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/flows/' + f.id) && r.request().method() === 'PATCH' && r.ok(),
      ),
      page.getByRole('button', { name: t('حفظ', 'Save'), exact: true }).click(),
    ]);
    assert.ok(expired);
    const renewed = await page.evaluate(() => JSON.parse(localStorage.getItem('session')));
    const saved = await api('/flows/' + f.id, renewed.accessToken);
    assert.equal(saved.draft_graph.nodes[0].data.text, pending);
    await page.waitForFunction(
      () => !Object.keys(localStorage).some((k) => k.startsWith('boat:flow-recovery:')),
    );
    await page.reload();
    await openNode();
    assert.equal(
      await page.getByLabel(t('نص الكتالوج', 'Catalog message'), { exact: true }).inputValue(),
      pending,
    );
    await page.getByRole('button', { name: t('إغلاق', 'Close'), exact: true }).click();
    // A live drag must not paint every full-node drop target purple.
    const source = await page
      .locator('.react-flow__node[data-id="catalog"] .react-flow__handle.source')
      .first()
      .boundingBox();
    assert.ok(source);
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + 30, source.y + 70, { steps: 6 });
    await page.locator('.builder-canvas.is-connecting').waitFor();
    const colors = await page
      .locator('.premium-flow-node .react-flow__handle.target')
      .evaluateAll((es) =>
        es.map((e) => ({
          background: getComputedStyle(e).backgroundColor,
          animation: getComputedStyle(e).animationName,
        })),
      );
    assert.ok(colors.length >= 3);
    assert.ok(
      colors.every((c) => c.background === 'rgba(0, 0, 0, 0)' && c.animation === 'none'),
      JSON.stringify(colors),
    );
    await page.screenshot({ path: out + '/connecting-' + language + '.png', fullPage: false });
    await page.mouse.up();
    await page.locator('.builder-canvas.is-connecting').waitFor({ state: 'detached' });
    results.push({
      language,
      width,
      validationRejection: 'PASS',
      pendingRecovery: 'PASS',
      renderBoundary: 'PASS',
      refreshAndSave: 'PASS',
      connectionColors: 'PASS',
    });
    await context.close();
  }
} catch (e) {
  if (activePage) {
    await activePage.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
    writeFileSync(out + '/failure-dom.txt', await activePage.content().catch(() => ''));
  }
  throw e;
} finally {
  await browser.close();
  writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
}
