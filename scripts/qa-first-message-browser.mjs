import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const web = 'http://localhost:3000';
const base = 'http://localhost:4000';
async function request(path, body, token, extra = {}) {
  const response = await fetch(base + path, {
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...extra },
  });
  assert.ok(response.ok, path + ' ' + response.status);
  return response.json();
}
const register = () => request('/auth/register', {
  email: randomUUID() + '@example.test', password: 'Synthetic-' + randomUUID(),
  fullName: 'Synthetic owner', workspaceName: 'Synthetic first message',
});
for (const language of ['ar', 'en']) {
  const t = (ar, en) => language === 'ar' ? ar : en;
  const session = await register();
  const channel = await request('/channels', { type: 'web', name: 'Synthetic chat' }, session.accessToken);
  const browser = await chromium.launch({
    executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript(({ session, language, web }) => {
      if (location.origin !== web) return;
      localStorage.setItem('boat-language', language);
      if (!localStorage.getItem('session')) localStorage.setItem('session', JSON.stringify(session));
    }, { session, language, web });
    await page.goto(web + '/dashboard/onboarding');
    const link = page.getByRole('link', { name: t('افتح تجربة محادثة الموقع', 'Open website chat demo') });
    const check = page.getByRole('button', { name: t('تحقق من الرسالة', 'Check for a message') });
    await check.click();
    await page.getByText(t('لم تصل رسالة واردة بعد.', 'No incoming message yet.'), { exact: true }).waitFor();
    const demo = await context.newPage();
    await demo.goto(new URL(await link.getAttribute('href'), web).href);
    await demo.locator('.launcher').click();
    const text = 'Synthetic first incoming ' + language;
    await demo.locator('input[aria-label]').fill(text);
    await demo.locator('.send').click();
    await demo.getByText(text, { exact: true }).waitFor();
    const indicator = await request('/workspace/onboarding/message-check', undefined, session.accessToken);
    assert.equal(indicator.received, true);
    await check.click();
    await page.getByText(t('تم استلام رسالة واردة.', 'An incoming message was received.'), { exact: true }).waitFor();
    await page.getByRole('link', { name: t('افتح صندوق الوارد', 'Open inbox') }).click();
    await page.waitForURL(/\/dashboard\/inbox/);
    const conversations = await request('/conversations', undefined, session.accessToken);
    assert.equal(conversations.items.length, 1);
    await page.locator('.inbox-item').filter({ hasText: text }).click();
    const reply = 'Synthetic operator reply ' + language;
    const composer = page.getByLabel(t('محرر الرد', 'Reply composer'));
    await composer.fill(reply);
    await composer.press('Enter');
    await demo.getByText(reply, { exact: true }).waitFor();
    await page.getByRole('button', { name: t('تعيين متابعة', 'Set Follow-up') }).click();
    const followup = page.getByRole('dialog', { name: t('تعيين متابعة', 'Set Follow-up') });
    await followup.locator('input[type=datetime-local]').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
    await followup.getByLabel(t('السبب', 'Reason'), { exact: false }).fill('Synthetic pilot follow-up');
    await followup.getByRole('button', { name: t('حفظ المتابعة', 'Save Follow-up') }).click();
    await followup.waitFor({ state: 'hidden' });
    const tasks = await request('/crm/tasks?q=Synthetic%20pilot%20follow-up', undefined, session.accessToken);
    assert.equal(tasks.total, 1);

    const other = await register();
    assert.equal((await request('/workspace/onboarding/message-check', undefined, other.accessToken)).received, false);
    assert.equal((await request('/conversations', undefined, other.accessToken)).items.length, 0);
    console.log('PASS first incoming Webchat message, inbox reply, follow-up and workspace isolation', language, 390);
  } finally {
    await browser.close();
  }
}
