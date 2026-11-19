/* global localStorage, document, getComputedStyle, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(
  process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright',
);
const output = 'docs/enterprise-20261116/inbox-readability';
mkdirSync(output, { recursive: true });

async function api(path, token, body) {
  const response = await fetch('http://localhost:4000' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.ok(response.ok, path + ': ' + JSON.stringify(payload));
  return payload;
}

const session = await api('/auth/register', null, {
  email: 'inbox-visual-' + randomUUID() + '@example.test',
  password: 'Synthetic-' + randomUUID(),
  fullName: 'Inbox visual QA',
  workspaceName: 'Isolated chat readability checks',
});
const channel = await api('/channels', session.accessToken, { type: 'web', name: 'Readability QA webchat' });
await api('/workspace/onboarding/complete', session.accessToken, {});
const visitor = await api('/widget/' + channel.external_id + '/session', null, {});
const inbound = await fetch(
  'http://localhost:4000/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-visitor-token': visitor.token },
    body: JSON.stringify({ text: 'ممكن أعرف تفاصيل الحجز والأسعار؟ 👋', clientMsgId: randomUUID() }),
  },
);
assert.ok(inbound.ok, 'Synthetic inbound fixture must arrive via webchat');
const conversation = (await api('/conversations', session.accessToken)).items[0];
assert.ok(conversation?.id, 'Synthetic conversation exists');
await api('/conversations/' + conversation.id + '/messages', session.accessToken, {
  text: 'أهلًا بحضرتك! نقدر نساعدك بالتفاصيل والأسعار، اختار البرنامج المناسب.',
});
await api('/conversations/' + conversation.id + '/messages', session.accessToken, {
  text: 'Prices start from 1500 EGP. We can help you choose a package. ' + 'تفاصيل إضافية '.repeat(12),
});

function rgb(color) {
  const match = color.match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  assert.ok(match, 'Expected computed RGB ' + color);
  return match.slice(1, 4).map(Number);
}
function luminance([r, g, b]) {
  const channels = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function ratio(fg, bg) {
  const a = luminance(rgb(fg));
  const b = luminance(rgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const language of ['ar', 'en'])
    for (const width of [320, 390, 768, 1366, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 840 } });
      await context.addInitScript(({ session, language }) => {
        localStorage.setItem('session', JSON.stringify(session));
        localStorage.setItem('boat-language', language);
      }, { session, language });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );
      await page.goto('http://localhost:3000/dashboard/inbox?conversation=' + conversation.id);
      await page.locator('.msg-bubble.is-out').first().waitFor();
      await page.locator('.msg-bubble.is-in').first().waitFor();
      const values = await page.evaluate(() => {
        const bubble = document.querySelector('.msg-bubble.is-out');
        const inbound = document.querySelector('.msg-bubble.is-in');
        const meta = document.querySelector('.msg-meta');
        const composer = document.querySelector('.composer-input');
        const thread = document.querySelector('.thread-msgs');
        const list = document.querySelector('aside.inbox-list');
        const rail = document.querySelector('nav[aria-label]');
        const style = (element) => getComputedStyle(element);
        const rect = (element) => {
          const { left, right, width, height } = element.getBoundingClientRect();
          return { left, right, width, height };
        };
        return {
          outbound: { color: style(bubble).color, background: style(bubble).backgroundColor, font: parseFloat(style(bubble).fontSize), lineHeight: parseFloat(style(bubble).lineHeight), rect: rect(bubble) },
          inbound: { color: style(inbound).color, background: style(inbound).backgroundColor, font: parseFloat(style(inbound).fontSize), rect: rect(inbound) },
          metaFont: parseFloat(style(meta).fontSize),
          metaOpacity: parseFloat(style(meta).opacity),
          composerFont: parseFloat(style(composer).fontSize),
          composerSurface: style(document.querySelector('.composer')).backgroundColor,
          threadSurface: style(thread).backgroundColor,
          sharedCanvas: style(document.documentElement).getPropertyValue('--canvas').trim(),
          sharedMuted: style(document.documentElement).getPropertyValue('--surface-muted').trim(),
          daySeparators: document.querySelectorAll('.msg-day-separator').length,
          listVisible: style(list).display !== 'none',
          railVisible: rail ? style(rail).display !== 'none' : null,
          threadVisible: rect(thread).width > 0,
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
        };
      });
      assert.ok(values.outbound.font >= 15.5 && values.inbound.font >= 15.5, 'Chat body must be at least 16px');
      assert.ok(values.outbound.lineHeight >= 24, 'Readable line height');
      assert.ok(values.metaFont >= 11.5 && values.metaOpacity >= 0.95, 'Timestamps must not be tiny or faded');
      assert.ok(values.composerFont >= 16, 'Touch composer must not cause browser text zoom');
      assert.ok(ratio(values.inbound.color, values.inbound.background) >= 7, 'Inbound text needs AAA-grade contrast');
      assert.ok(ratio(values.outbound.color, values.outbound.background) >= 7, 'Outbound text needs AAA-grade contrast');
      assert.ok(values.daySeparators >= 1, 'Message timeline needs day separators');
      assert.equal(values.sharedCanvas, '#f7fafc', 'Shared canvas must be clean off-white');
      assert.equal(values.sharedMuted, '#f3f6fa', 'Supporting panels use pale off-white');
      assert.equal(values.threadSurface, 'rgb(247, 245, 242)', 'Retain the calm canvas from the newer owner-requested Inbox refinement');
      assert.equal(values.composerSurface, 'rgb(255, 255, 255)', 'Composer stays clean white');
      assert.ok(values.documentWidth <= values.viewportWidth + 1, 'No page horizontal overflow');
      assert.ok(values.outbound.rect.left >= -1 && values.outbound.rect.right <= values.viewportWidth + 1, 'Outgoing message stays on screen');
      assert.ok(values.inbound.rect.left >= -1 && values.inbound.rect.right <= values.viewportWidth + 1, 'Incoming message stays on screen');
      assert.equal(values.listVisible, width >= 1024, 'Mobile/tablet must not show split conversation list');
      assert.equal(values.threadVisible, true, 'Chat pane must remain visible');
      assert.deepEqual(errors, []);
      // Isolated presentational probe for states that should never require a live failed WhatsApp delivery.
      // The probe is removed immediately; no customer messages are created or sent.
      const visual = await page.evaluate(() => {
        const thread = document.querySelector('.thread-msgs');
        const probe = document.createElement('div');
        probe.innerHTML = `
          <div class="msg-system" data-event="taken_over"><span class="msg-system-label">Conversation transferred to agent</span><time>12:30</time></div>
          <div class="msg-bubble is-out is-failed">Synthetic failed delivery probe</div>
          <div class="msg-meta is-delivery-failed"><details class="msg-delivery-error"><summary><span class="msg-delivery-icon">!</span><strong>Message not delivered</strong><span class="msg-delivery-more">View reason</span></summary><p>External delivery is disabled</p></details></div>
        `;
        thread.append(probe);
        const system = probe.querySelector('.msg-system');
        const failed = probe.querySelector('.msg-bubble');
        const details = probe.querySelector('.msg-delivery-error');
        const summary = details.querySelector('summary');
        const style = (element) => getComputedStyle(element);
        const report = {
          systemBackground: style(system).backgroundColor,
          systemBorder: style(system).borderTopWidth,
          systemFont: parseFloat(style(system).fontSize),
          bubbleOutline: style(failed).outlineStyle,
          bubbleBorder: style(failed).borderTopColor,
          bubbleFont: parseFloat(style(failed).fontSize),
          warningBackground: style(details).backgroundColor,
          summaryCursor: style(summary).cursor,
        };
        summary.click();
        report.revealsReason = details.open && details.textContent.includes('External delivery is disabled');
        probe.remove();
        return report;
      });
      assert.equal(visual.systemBackground, 'rgb(255, 255, 255)', 'Timeline event keeps the newer white activity marker');
      assert.equal(visual.systemBorder, '1px', 'Timeline event keeps its subtle one-pixel border');
      assert.ok(visual.systemFont >= 12.5, 'Timeline event stays legible');
      assert.equal(visual.bubbleOutline, 'none', 'Failed delivery must not draw harsh red outlines');
      assert.ok(visual.bubbleFont >= 16, 'Failed message retains normal message typography');
      assert.equal(visual.summaryCursor, 'pointer', 'Delivery failure reason is actionable');
      assert.ok(visual.revealsReason, 'Delivery reason can be expanded without hiding failure');
      await page.screenshot({ path: output + '/chat-' + language + '-' + width + '.png', fullPage: false });
      if (width === 390 || width === 1366) {
        // The customer action drawer is the highest-traffic employee control.
        // Its colors must reflect persisted human/bot ownership, never a fixed green icon.
        await page.getByRole('button', {
          name: language === 'ar' ? 'إجراءات المحادثة' : 'Chat actions',
          exact: true,
        }).click();
        const botButton = page.locator('button[data-bot-state]:visible');
        await botButton.waitFor();
        const panelReadability = await page.locator('.customer-panel:visible').evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          headerSize: parseFloat(getComputedStyle(element.querySelector('h2')).fontSize),
        }));
        assert.equal(panelReadability.background, 'rgb(255, 255, 255)', 'Customer actions should be a white surface, not grey');
        assert.ok(panelReadability.headerSize >= 18, 'Customer panel title is easy to read');
        if ((await botButton.getAttribute('data-bot-state')) === 'paused') {
          await botButton.click();
          await page.locator('button[data-bot-state="running"]:visible').waitFor();
        }
        await page.waitForTimeout(240); // wait for the deliberate 150ms hover/background transition
        const running = await botButton.evaluate((element) => ({
          bg: getComputedStyle(element).backgroundColor,
          label: element.getAttribute('aria-label'),
        }));
        assert.equal(running.label, language === 'ar' ? 'إيقاف البوت' : 'Pause Bot');
        console.log('BOT RUNNING COMPUTED STYLE', JSON.stringify({ language, width, running }));
        await page.screenshot({ path: output + '/bot-running-diagnostic-' + language + '-' + width + '.png' });
        const green = rgb(running.bg);
        assert.ok(green[1] > green[0] && green[1] > green[2], 'Running bot has green state');
        await botButton.click();
        await page.locator('button[data-bot-state="paused"]:visible').waitFor();
        await page.waitForTimeout(240);
        const paused = await botButton.evaluate((element) => ({
          bg: getComputedStyle(element).backgroundColor,
          label: element.getAttribute('aria-label'),
        }));
        assert.equal(paused.label, language === 'ar' ? 'استئناف البوت' : 'Resume Bot');
        const red = rgb(paused.bg);
        assert.ok(red[0] > red[1] && red[0] > red[2], 'Paused bot has subtle red state');
        const returnedText=await page.locator('.msg-system[data-event="returned_to_bot"] .msg-system-label').last().textContent();
        assert.ok(returnedText.includes(language === 'ar' ? 'أُعيدت المحادثة' : 'Conversation returned to the bot'), 'Activity events use the selected UI language');
        await page.screenshot({ path: output + '/bot-paused-' + language + '-' + width + '.png' });
        await botButton.click();
        await page.locator('button[data-bot-state="running"]:visible').waitFor();
        await page.waitForTimeout(240);
        await page.screenshot({ path: output + '/bot-running-' + language + '-' + width + '.png' });
        if (width < 1024) await page.keyboard.press('Escape');
      }
      if (width < 1024) {
        await page.getByRole('button', { name: language === 'ar' ? 'رجوع للقائمة' : 'Back to list' }).click();
        await page.locator('aside.inbox-list').waitFor({ state: 'visible' });
        const check = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
          nameSize: parseFloat(getComputedStyle(document.querySelector('.inbox-name')).fontSize),
        }));
        assert.ok(check.width <= check.viewport + 1, 'List has no horizontal overflow');
        assert.ok(check.nameSize >= 15, 'List names must be legible');
        await page.screenshot({ path: output + '/list-' + language + '-' + width + '.png', fullPage: false });
      }
      results.push({ language, width, status: 'PASS', messageFont: values.inbound.font,
        metaFont: values.metaFont, composerFont: values.composerFont,
        inboundContrast: Number(ratio(values.inbound.color, values.inbound.background).toFixed(2)),
        outboundContrast: Number(ratio(values.outbound.color, values.outbound.background).toFixed(2)),
        mobileSinglePane: !values.listVisible, sharedCanvas: values.sharedCanvas,
        threadSurface: values.threadSurface, composerSurface: values.composerSurface });
      await context.close();
    }
} finally {
  await browser.close();
  writeFileSync(output + '/results.json', JSON.stringify(results, null, 2));
}
console.log('INBOX VISUAL ACCEPTANCE', results.length, 'responsive AR/EN journeys passed');
