// Isolated application acceptance: local Nest/PGlite, synthetic data, no external delivery.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const distribution = (await import(process.env.BOAT_CHROMIUM_MODULE || '@sparticuz/chromium'))
  .default;
const out = 'docs/bot-manager-20261107/evidence';
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [],
  visual = [];
const baseline = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', '3001'],
  { cwd: process.env.BOAT_MANAGER_BASELINE_WEB || '../Boat-two-before/apps/web', stdio: 'ignore' },
);
for (let n = 0; n < 100; n++) {
  try {
    if ((await fetch('http://localhost:3001/login')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
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
  email: `manager-${randomUUID()}@example.test`,
  password: `Local-${randomUUID()}`,
  fullName: 'Bot Manager QA Owner',
  workspaceName: 'Manager QA Lab',
});
const token = session.accessToken;
const a = await api('/channels', { type: 'web', name: 'Website QA' }, token),
  b = await api('/channels', { type: 'web', name: 'Second QA Bot' }, token);
await api('/workspace/onboarding/complete', {}, token);
let flow = await api(
  '/flows',
  { name: 'Manager acceptance flow', language: 'en', channelIds: [a.id] },
  token,
);
flow = await api(
  '/flows/' + flow.id,
  {
    graph: {
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          type: 'message',
          position: { x: 100, y: 200 },
          data: { text: 'Hello from isolated Bot Manager QA' },
          edges: { next: 'end' },
        },
        { id: 'end', type: 'end', position: { x: 500, y: 200 }, data: {} },
      ],
      edges: [{ id: 'edge1', source: 'start', target: 'end', sourceHandle: 'next' }],
    },
    expectedUpdatedAt: flow.updated_at,
  },
  token,
  'PATCH',
);
writeFileSync('/tmp/boat-manager-qa-fixture.json', JSON.stringify({ session, a, b, flow }));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BOAT_CHROMIUM_PATH || (await distribution.executablePath()),
  args: distribution.args.filter((a) => a !== '--single-process'),
});
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
  } catch (e) {
    checks.push({ name, pass: false, error: e.message });
    throw e;
  }
}

const comparisons=[];
try {
 for(const locale of ['en','ar']) {
  const context=await browser.newContext({viewport:{width:1366,height:936}});
  await context.addInitScript(({session,locale})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',locale);},{session,locale});
  const before=await context.newPage(),after=await context.newPage();
  for(const route of ['', 'inbox','crm','crm/sales','channels','automations','team','settings','billing','flows/'+flow.id]) {
   const path='/dashboard'+(route?'/'+route:'');
   await before.goto('http://localhost:3001'+path);await before.waitForLoadState('networkidle');
   await after.goto('http://localhost:3000'+path);await after.waitForLoadState('networkidle');
   for(const page of [before,after]) {await page.evaluate(()=>document.fonts.ready);await page.mouse.move(0,0);await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});}
   const name=(route||'dashboard').replaceAll('/','-');
   const oldImage=await before.screenshot({path:out+'/steady-before-'+locale+'-'+name+'.png',animations:'disabled',caret:'hide'});
   const newImage=await after.screenshot({path:out+'/steady-after-'+locale+'-'+name+'.png',animations:'disabled',caret:'hide'});
   comparisons.push({locale,route,identical:oldImage.equals(newImage)});
  }
  await context.close();
 }
}finally{await browser.close();baseline.kill('SIGTERM');writeFileSync(out+'/steady-regression.json',JSON.stringify({method:'Same fixture and viewport, fonts ready, cursor outside controls, transitions and caret suppressed only in tests',comparisons},null,2));}
console.log(JSON.stringify(comparisons,null,2));
