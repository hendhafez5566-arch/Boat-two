import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const web = 'http://localhost:3000';
const base = 'http://localhost:4000';
async function request(path, body, session) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { authorization: 'Bearer ' + session.accessToken } : {}) },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, path + ' ' + response.status);
  return response.json();
}
for (const language of ['ar', 'en']) {
  const t = (ar, en) => language === 'ar' ? ar : en;
  const session = await request('/auth/register', {
    email: randomUUID() + '@example.test', password: 'Synthetic-' + randomUUID(),
    fullName: 'Synthetic owner', workspaceName: 'Synthetic search load',
  });
  await request('/channels', { name: 'Synthetic webchat', type: 'web' }, session);
  await request('/workspace/onboarding/complete', {}, session);
  await request('/crm/contacts', { name: 'Synthetic lag check customer' }, session);
  const browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(({ session, language, web }) => {
      if (location.origin !== web) return;
      localStorage.setItem('boat-language', language);
      if (!localStorage.getItem('session')) localStorage.setItem('session', JSON.stringify(session));
    }, { session, language, web });
    const searches = [];
    const paths = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (!['localhost:4000', '127.0.0.1:4000'].includes(url.host) || req.method() !== 'GET') return;
      paths.push(url.pathname);
      if (url.pathname === '/crm/contacts' && url.searchParams.get('q')) searches.push(url.searchParams.get('q'));
    });
    await page.goto(web + '/dashboard/crm');
    await page.getByText('Synthetic lag check customer', { exact: true }).first().waitFor();
    assert.equal(paths.includes('/crm/contacts-summary'), false);
    assert.equal(paths.includes('/crm/contacts/duplicates'), false);
    assert.equal(paths.includes('/crm/pipelines'), false);
    const search = page.getByRole('searchbox', { name: t('بحث عن عميل', 'Search customers'), exact: true });
    const result = page.waitForResponse((response) => new URL(response.url()).searchParams.get('q') === 'Synthetic lag check');
    await search.pressSequentially('Synthetic lag check', { delay: 5 });
    assert.ok((await result).ok());
    assert.deepEqual(searches, ['Synthetic lag check']);
    const stats = page.waitForResponse((response) => new URL(response.url()).pathname === '/crm/contacts-summary');
    await page.getByText(t('إحصائيات العملاء', 'Customer statistics'), { exact: true }).click();
    assert.ok((await stats).ok());
    assert.equal(paths.filter((path) => path === '/crm/contacts-summary').length, 1);
    console.log('PASS 19 keystrokes used one search request; statistics loaded on demand', language);
  } finally {
    await browser.close();
  }
}
