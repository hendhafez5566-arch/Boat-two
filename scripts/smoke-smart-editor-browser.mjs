// Real local app UI, isolated in-memory HTTP fixture. No remote services or sends.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BOAT_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core');
const output = process.env.SMOKE_SCREENSHOT_DIR || '/tmp/smart-editor-evidence';
mkdirSync(output,{recursive:true});
const graph = {startNodeId:'welcome',nodes:[
{id:'welcome',type:'message',position:{x:0,y:0},data:{text:'أهلًا بيك في شركتنا 👋\nاختار الخدمة اللي محتاجها:',saveReplyAs:'service',buttons:[{id:'booking',title:'حجز عمرة'},{id:'staff',title:'التحدث مع موظف'},{id:'faq',title:'الأسئلة الشائعة'}]},edges:{'option:staff':'staff','option:faq':'check'}},
{id:'staff',type:'handoff',position:{x:600,y:0},data:{message:'هنوصلك بموظف يساعدك'},edges:{}},
{id:'check',type:'condition',position:{x:600,y:500},data:{rules:[{id:'book-rule',match:'all',conditions:[{source:'variable',key:'service_id',operator:'equals',value:'booking'}]}]},edges:{'rule:book-rule':'question',else:'staff'}},
{id:'question',type:'question',position:{x:1200,y:500},data:{text:'تحب تسافر إمتى؟',answerType:'text',saveAs:'departure_preference',retries:2},edges:{ok:'staff',fail:'staff'}}]};
let saved = {id:'smart-test',name:'بوت استقبال شركة سياحة',draft_graph:graph,priority:0,triggers:[],channel_ids:[],status:'draft',published_version:0,updated_at:'2026-10-24T00:00:00.000Z'};
let writes=0;
const browser = await chromium.launch({executablePath:process.env.BOAT_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(15000);
page.on('console',m=>{ if(m.type()==='error') console.error('BROWSER',m.text()); });
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('session',JSON.stringify({accessToken:'local-fixture',refreshToken:'fixture'}));localStorage.setItem('boat-language','ar');});
await page.route('http://localhost:4000/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 let body=[];
 if(path==='/auth/me')body={workspaces:[{tenant_id:'fixture',name:'شركة السياحة',role:'owner'}]};
 else if(path==='/workspace')body={tenant:{id:'fixture',name:'شركة السياحة'},role:'owner'};
 else if(path==='/workspace/branding')body={enabled:false};
 else if(path==='/flows/smart-test'){
  if(req.method()==='PATCH'){const patch=req.postDataJSON();saved={...saved,name:patch.name,draft_graph:patch.graph,updated_at:new Date().toISOString()};writes++;}
  body=saved;
 } else if(path.endsWith('/stats') || path.endsWith('/button-stats')) body={};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
});
const open=async id=>{await page.locator(`.react-flow__node[data-id="${id}"]`).click({force:true});await page.locator('.builder-inspector[data-open="true"]').waitFor();await page.locator('.builder-inspector').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));};
const shot=async name=>page.screenshot({path:`${output}/${name}.png`,fullPage:true});
try {
 await page.goto('http://localhost:3000/dashboard/flows/smart-test');
 await page.locator('.premium-flow-node').first().waitFor();
 await open('welcome');
 await page.getByRole('textbox',{name:'نص الرسالة',exact:true}).fill(graph.nodes[0].data.text+'\nجاهزين نساعدك');
 await assert.doesNotReject(()=>page.locator('.smart-bubble').getByText(/جاهزين نساعدك/).waitFor());
 await shot('desktop-message');
 await page.locator('.smart-choice-main').first().click();
 await page.locator('.smart-drill').getByText('لا يوجد إجراء بعد',{exact:true}).waitFor();
 await shot('desktop-action');
 await page.locator('.smart-drill').getByRole('button',{name:'إرسال رسالة جديدة',exact:true}).click();
 await page.getByRole('textbox',{name:'نص الرسالة',exact:true}).fill('تحب تسافر إمتى؟');
 await page.locator('.smart-editor-footer').getByRole('button',{name:'تم',exact:true}).click();
 assert.ok(saved.draft_graph.nodes.find(n=>n.id==='welcome').edges['option:booking']);
 assert.equal(saved.draft_graph.nodes.find(n=>n.id==='welcome').edges['option:staff'],'staff');
 await open('welcome');
 await page.getByRole('button',{name:'قائمة',exact:true}).click();
 page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'أزرار',exact:true}).click();
 await page.locator('.smart-editor-footer').getByRole('button',{name:'تم',exact:true}).click();
 assert.deepEqual(saved.draft_graph.nodes.find(n=>n.id==='welcome').data.buttons.map(b=>b.id),['booking','staff','faq']);
 await open('check'); await page.locator('.flow-inspector-content select').first().selectOption('any'); await shot('desktop-condition');
 await page.locator('.smart-editor-footer').getByRole('button',{name:'تم',exact:true}).click();
 assert.equal(saved.draft_graph.nodes.find(n=>n.id==='check').data.rules[0].match,'any');
 await shot('desktop-canvas');
 await page.setViewportSize({width:390,height:844});
 await open('welcome');
 const box=await page.locator('.builder-inspector').boundingBox();assert.equal(box.x,0);assert.equal(box.width,390);assert.ok(Math.abs(box.height-844)<1); assert.ok(Math.abs(box.y)<1);
 assert.equal(await page.locator('.builder-inspector input,.builder-inspector textarea').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await shot('phone-message');
 await page.locator('.builder-inspector .smart-choice').first().scrollIntoViewIfNeeded(); await shot('phone-choices');
 await page.locator('.smart-choice-main').first().click();await shot('phone-action');
 await page.locator('.sheet-close').click();
 await shot('phone-canvas');
 await open('check');await shot('phone-condition');
 await page.locator('.sheet-close').click();
 await page.setViewportSize({width:768,height:1024});await open('welcome');await shot('tablet-message');
 await page.setViewportSize({width:1440,height:900});
 await page.reload();await page.locator('.premium-flow-node').first().waitFor();await open('welcome');
 assert.match(await page.getByRole('textbox',{name:'نص الرسالة',exact:true}).inputValue(),/جاهزين نساعدك/);
 const transform=await page.locator('.react-flow__viewport').getAttribute('style');
 await page.locator('.smart-editor-footer').getByRole('button',{name:'تجربة',exact:true}).click();
 await page.getByRole('button',{name:'رجوع للتحرير',exact:true}).click();
 await page.locator('.builder-inspector[data-open="true"]').waitFor();
 assert.equal(await page.locator('.react-flow__viewport').getAttribute('style'),transform);
 assert.equal(saved.draft_graph.nodes.find(n=>n.id==='check').data.rules[0].match,'any');
 assert.ok(writes>0);assert.deepEqual(errors,[]);
 writeFileSync(`${output}/result.json`,JSON.stringify({fixture:'in-memory HTTP; actual production UI; no DB, delivery or external APIs',writes,savedGraph:saved.draft_graph,errors},null,2));
 console.log('PASS: actual message editing, live preview, action creates connected node, stable branches, reversible conversion, save/reopen, desktop/mobile/tablet, no browser errors');
} catch (e) { await shot('failure'); console.error(errors); console.error(await page.locator('body').innerText()); throw e; } finally {await browser.close();}
