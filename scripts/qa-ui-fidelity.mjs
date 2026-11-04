// Isolated local application tests. Never connects to Preview or customer channels.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const out = process.env.BOAT_UI_OUT || 'docs/ui-rebuild-20261104/local-evidence';
mkdirSync(out, { recursive: true });
async function api(path, body, token, method = body ? 'POST' : 'GET') {
  const r = await fetch('http://localhost:4000' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(r.ok, path + ': ' + JSON.stringify(data));
  return data;
}
const session = await api('/auth/register', {
  email: 'ui-' + randomUUID() + '@example.test',
  password: 'Local-UI-' + randomUUID(),
  fullName: 'UI Review Owner',
  workspaceName: 'Boat UI Lab',
});
const token = session.accessToken;
const channel = await api('/channels', { type: 'web', name: 'Website QA' }, token);
await api('/workspace/onboarding/complete', {}, token);
await api('/crm/contacts', {name:'UI Sample Customer',email:'ui-customer@example.test',phone:'+201000000000',lifecycle:'lead',tags:['UI QA']},token);
const flow = await api(
  '/flows',
  { name: 'UI acceptance flow', language: 'en', channelIds: [channel.id] },
  token,
);
await api(
  '/flows/' + flow.id,
  {
    channelIds: [channel.id],
    graph: {
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          type: 'message',
          position: { x: 100, y: 200 },
            data: { text: 'Welcome to the isolated UI test.' },
            edges: { next: 'end' },
        },
        { id: 'end', type: 'end', position: { x: 500, y: 200 }, data: {} },
      ],
      edges: [{ id: 'edge1', source: 'start', target: 'end', sourceHandle: 'next' }],
    },
  },
  token,
  'PATCH',
);
const chromiumDistribution = process.env.BOAT_CHROMIUM_MODULE
  ? (await import(process.env.BOAT_CHROMIUM_MODULE)).default
  : null;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BOAT_CHROMIUM_PATH ||
    (chromiumDistribution ? await chromiumDistribution.executablePath() : undefined),
  args: chromiumDistribution
    ? chromiumDistribution.args.filter(arg => arg !== '--single-process')
    : ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [],
  errors = [],
  interaction = [], a11y = [];
const routes = [
  '',
  'channels',
  'flows',
  'inbox',
  'crm',
  'crm/overview',
  'crm/pipeline',
  'crm/tasks',
  'crm/sales',
  'inbox/settings',
  'team',
  'departments',
  'campaigns',
  'reports',
  'automations',
  'settings',
  'billing',
  'onboarding',
  'commerce',
  'sequences',
  'knowledge',
  'account',
  'flows/' + flow.id,
];
try {
  for (const locale of ['en', 'ar']) {
    const context = await browser.newContext({hasTouch:process.env.BOAT_UI_TOUCH==='true'});
    await context.addInitScript(
      ({ session, locale }) => {
        localStorage.setItem('session', JSON.stringify(session));
        localStorage.setItem('boat-language', locale);
      },
      { session, locale },
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push({ locale, message: e.message }));
    for (const width of (process.env.BOAT_UI_INTERACTION_ONLY ? [] : [320, 360, 390, 768, 1366, 1920])) {
      await page.setViewportSize({ width, height: 936 });
      for (const route of routes) {
        const url = '/dashboard' + (route ? '/' + route : '');
        await page.goto('http://localhost:3000' + url);
        await page.waitForLoadState('networkidle');
        await page.locator('.page-loading').waitFor({ state: 'hidden' });
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          dir: document.documentElement.dir,
          overflow: [...document.querySelectorAll('body *')]
            .filter((e) => {
              const r = e.getBoundingClientRect(),
                s = getComputedStyle(e);
              if (
                s.display === 'none' ||
                r.width === 0 ||
                s.position === 'fixed' ||
                e.closest('.react-flow')
              )
                return false;
              if (r.right <= innerWidth + 1 && r.left >= -1) return false;
              let p = e.parentElement;
              while (p && p !== document.body) {
                const ps = getComputedStyle(p);
                if (['auto', 'hidden', 'scroll', 'clip'].includes(ps.overflowX)) return false;
                p = p.parentElement;
              }
              return true;
            })
            .slice(0, 6)
            .map((e) => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 60) })),
          rawSummaries: [...document.querySelectorAll('summary')].filter(
            (e) => getComputedStyle(e).listStyleType !== 'none',
          ).length,
        }));
        results.push({
          route,
          locale,
          width,
          ...layout,
          pass: layout.scrollWidth <= width + 1 && layout.dir === (locale === 'ar' ? 'rtl' : 'ltr'),
        });
        if (width === 390 || width === 1366) {
          await page.screenshot({
            path: `${out}/${locale}-${width}-${route.replaceAll('/', '-') || 'dashboard'}.jpg`,
            quality: 75,
          });
        }
      }
      console.log('layout', locale, width, 'done');
    }
    await page.setViewportSize({ width: 1366, height: 936 });
    await page.goto('http://localhost:3000/dashboard/departments');
    await page.waitForLoadState('networkidle');
    await page.goto('http://localhost:3000/dashboard/crm/advanced');
    await page.waitForLoadState('networkidle');
    const disclosure = page.locator('summary[class*="disclosure-summary"]:visible').first();
    if (await disclosure.count()) {
      const initial = await disclosure.evaluate((e) => e.parentElement.open);
      await disclosure.focus();
      await disclosure.press('Enter');
      assert.equal(await disclosure.evaluate((e) => e.parentElement.open), !initial);
      await disclosure.press('Space');
      assert.equal(await disclosure.evaluate((e) => e.parentElement.open), initial);
      assert.equal(await disclosure.locator('svg').count(), 1);
      await disclosure.click();
      await page.screenshot({path:out+'/'+locale+'-disclosure-open.jpg',quality:75});
      if(process.env.BOAT_UI_TOUCH==='true') {
        await disclosure.tap();
        assert.equal(await disclosure.evaluate(e=>e.parentElement.open),initial);
        interaction.push({locale,check:'Disclosure touch toggle',pass:true});
      }
      interaction.push({
        locale,
        check: 'Native disclosure Enter/Space and single chevron',
        pass: true,
      });
    } else
      interaction.push({
        locale,
        check: 'Disclosure keyboard',
        pass: false,
        reason: 'No disclosure in advanced route',
      });
    await page.goto('http://localhost:3000/dashboard/flows/' + flow.id);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.product-sidebar').isVisible(), false);
    assert.equal(await page.locator('.fn-stats').count(), 0);
    await page
      .getByRole('button', {
        name: locale === 'ar' ? 'المزيد من الأدوات' : 'More tools',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: locale === 'ar' ? 'عرض الأداء' : 'Show analytics', exact: true })
      .click();
    assert.ok((await page.locator('.fn-stats').count()) > 0);
    interaction.push({ locale, check: 'Single flow dock and analytics toggle', pass: true });
    if(process.env.BOAT_UI_FLOW_ACCEPTANCE==='true') {
      const node=page.locator('.react-flow__node[data-id="start"]');
      await node.dblclick();
      const panel=page.getByRole('dialog').filter({has:page.getByRole('button',{name:locale==='ar'?'إغلاق لوحة الإعدادات':'Close configuration panel',exact:true})});
      await panel.waitFor({state:'visible'});
      await page.keyboard.press('Escape'); await panel.waitFor({state:'hidden'});
      const beforeGraph=await api('/flows/'+flow.id,null,token);
      const rect=await node.boundingBox();
      await page.mouse.move(rect.x+70,rect.y+20); await page.mouse.down();
      await page.mouse.move(rect.x+170,rect.y+70,{steps:10}); await page.mouse.up();
      const saved=page.waitForResponse(r=>r.url().endsWith('/flows/'+flow.id)&&r.request().method()==='PATCH'&&r.ok());
      await page.getByRole('button',{name:locale==='ar'?'حفظ':'Save',exact:true}).click(); await saved;
      const afterGraph=await api('/flows/'+flow.id,null,token);
      assert.equal(afterGraph.draft_graph.nodes.find(n=>n.id==='start').edges.next,'end');
      assert.notDeepEqual(afterGraph.draft_graph.nodes.find(n=>n.id==='start').position,beforeGraph.draft_graph.nodes.find(n=>n.id==='start').position);
      const transform=await page.locator('.react-flow__viewport').getAttribute('style');
      await page.getByRole('button',{name:locale==='ar'?'تكبير':'Zoom in',exact:true}).click();
      await page.waitForFunction(previous=>document.querySelector('.react-flow__viewport').getAttribute('style')!==previous,transform);
      await page.getByRole('button',{name:locale==='ar'?/نشر البوت|نشر التحديث/:/Publish bot|Publish update/}).click();
      const confirm=page.getByRole('button',{name:locale==='ar'?'تأكيد النشر':'Confirm publish',exact:true});
      await confirm.click();
      await page.getByRole('button',{name:locale==='ar'?'نشر التحديث':'Publish update',exact:true}).waitFor();
      assert.equal((await api('/flows/'+flow.id,null,token)).status,'published');
      interaction.push({locale,check:'Node editor, Escape, drag, save, connections, zoom and publish in isolated Webchat',pass:true});
    }
    await page.goto('http://localhost:3000/dashboard/flows');
    await page.waitForLoadState('networkidle');
    assert.equal(
      Math.round(
        await page.locator('.product-sidebar').evaluate((e) => e.getBoundingClientRect().width),
      ),
      90,
    );
    await page
      .getByRole('button', { name: locale === 'ar' ? 'القائمة' : 'Navigation', exact: true })
      .click();
    assert.equal(
      Math.round(
        await page.locator('.product-sidebar').evaluate((e) => e.getBoundingClientRect().width),
      ),
      260,
    );
    interaction.push({ locale, check: 'Manager rail expands from 90 to 260', pass: true });
    if (process.env.BOAT_AXE_PATH) {
      for (const route of ['flows','crm','inbox/settings','settings']) {
        await page.goto('http://localhost:3000/dashboard/'+route); await page.waitForLoadState('networkidle');
        await page.addScriptTag({path:process.env.BOAT_AXE_PATH});
        const audit=await page.evaluate(async()=>{
          const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
          return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
        });
        a11y.push({locale,route,violations:audit});
      }
    }
    await context.close();
  }
} catch (e) {
  errors.push({ fatal: e.stack });
} finally {
  writeFileSync(
    out + '/results.json',
    JSON.stringify(
      {
        engine: 'Local production Next + complete Nest app + PGlite/RLS; synthetic data only',
        results,
        interaction,
        a11y,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(
  JSON.stringify(
    { layouts: results.length, failed: results.filter((r) => !r.pass), interaction, errors },
    null,
    2,
  ),
);
if (errors.length || results.some((r) => !r.pass) || interaction.some((r) => !r.pass) || a11y.some(r=>r.violations.length))
  process.exitCode = 1;
