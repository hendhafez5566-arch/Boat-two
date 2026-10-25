import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
// Real Chromium + local API/DB: no mocked routes or customer accounts.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright-core');
const web=process.env.SMOKE_WEB_URL||'http://localhost:3000',base=process.env.SMOKE_API_URL||'http://localhost:4000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)||process.env.BOAT_PREVIEW_ONLY!=='true')throw Error('Local preview required');
const out=process.env.BOAT_SCREENSHOTS||'docs/acceptance/2026-10-25-parity';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(18000);const errors=[],results=[],views=[];
page.on('pageerror',e=>errors.push(e.message));
const shot=name=>page.screenshot({path:`${out}/${name}.png`,fullPage:true});
async function call(path,method='GET',body){const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('session')));const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.accessToken},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,`${path}: ${JSON.stringify(data)}`);return data;}
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
const open=async id=>{await page.getByRole('searchbox',{name:'البحث في عقد البوت',exact:true}).fill(id);await page.locator('.node-finder .card button').first().click();await page.locator('.builder-inspector[data-open="true"]').waitFor();};
try{
 await page.addInitScript(()=>{if(!localStorage.getItem('boat-language'))localStorage.setItem('boat-language','ar');});
 await check('new subscriber registers in Arabic and creates a simulation channel through the UI',async()=>{
  await page.goto(web+'/register');await page.locator('input[name=fullName]').fill('مالك السياحة');await page.locator('input[name=workspaceName]').fill('شركة سياحة قبول Chromium');await page.locator('input[name=email]').fill(`chromium-${randomUUID()}@example.test`);await page.locator('input[name=password]').fill('local-acceptance-only-12345');await page.locator('.auth-submit').click();await page.waitForURL('**/dashboard/onboarding');
  await page.goto(web+'/dashboard/channels');await page.getByLabel('اسم القناة',{exact:true}).fill('موقع السياحة التجريبي');const response=page.waitForResponse(r=>r.url()===base+'/channels'&&r.request().method()==='POST');await page.getByRole('button',{name:'إضافة القناة',exact:true}).click();assert.equal((await response).status(),201);await page.getByText('أُضيفت القناة.',{exact:true}).waitFor();
  assert.equal(await page.locator('.channel-catalog article').count(),6);await shot('channels-ar-desktop');
 });
 let flow;
 await check('seven-step wizard creates buttons, saves, previews and publishes only the local web channel',async()=>{
  await page.goto(web+'/dashboard/flows/new');await page.locator('.goal-card').last().click();await page.getByRole('button',{name:'متابعة',exact:true}).click();await page.locator('.goal-card').first().click();await page.getByRole('button',{name:'متابعة',exact:true}).click();await page.getByLabel('اسم البوت',{exact:true}).fill('بوت السياحة من المعالج');await page.getByLabel('رسالة الترحيب',{exact:true}).fill('أهلًا بكم في رحلة العمرة');await page.getByRole('button',{name:'متابعة',exact:true}).click();
  await page.getByRole('button',{name:'إضافة زر رد',exact:true}).click();await page.getByLabel('عنوان الزر',{exact:true}).last().fill('برامج عمرة');
  const action=page.getByLabel('إجراء الزر',{exact:true}).last();await action.selectOption('message');await page.locator('.wizard-content textarea').last().fill('رحلاتنا متاحة');
  await page.getByRole('button',{name:'متابعة',exact:true}).click();await page.getByRole('button',{name:/موقع السياحة التجريبي/}).click();await page.getByRole('button',{name:'حفظ المسودة وتجربتها',exact:true}).click();await page.getByRole('button',{name:'ابدأ التجربة',exact:true}).click();await page.getByRole('button',{name:'برامج عمرة',exact:true}).click();await page.getByText('رحلاتنا متاحة',{exact:true}).waitFor();
  await shot('wizard-preview-ar');await page.getByRole('button',{name:'متابعة',exact:true}).click();await page.getByRole('button',{name:'التحقق ونشر البوت',exact:true}).click();await page.getByRole('heading',{name:'بوتك منشور',exact:true}).waitFor();flow=(await call('/flows')).find(f=>f.name==='بوت السياحة من المعالج');assert.ok(flow);assert.equal(flow.status,'published');
 });
 await check('live visual builder edits independent button cards and persists content after reopening',async()=>{
  await page.goto(web+`/dashboard/flows/${flow.id}`);await page.locator('.premium-flow-node').first().waitFor();assert.ok(await page.locator('.react-flow__node').count()>2);assert.ok(await page.locator('.react-flow__node-flowButton').count()>0);await open('__boat_wizard_welcome');await page.getByRole('textbox',{name:'نص الرسالة',exact:true}).fill('مرحبًا بعد اختبار الحفظ');await page.locator('.smart-editor-footer').getByRole('button',{name:'تم',exact:true}).click();await page.reload();await open('__boat_wizard_welcome');assert.equal(await page.getByRole('textbox',{name:'نص الرسالة',exact:true}).inputValue(),'مرحبًا بعد اختبار الحفظ');await page.locator('.sheet-close').click();await shot('builder-ar-desktop');
 });
 const nodes=Array.from({length:40},(_,i)=>({id:'step'+i,type:'message',position:{x:(i%5)*450,y:Math.floor(i/5)*400},data:{text:'رسالة '+i},edges:i<39?{next:'step'+(i+1)}:{}}));nodes[0].data.buttons=[{id:'stable-a',title:'عمرة'},{id:'stable-b',title:'موظف'}];nodes[0].edges={'option:stable-a':'step1','option:stable-b':'step2'};
 await check('40-node graph saves and reopens with stable button IDs and connections',async()=>{
  await call('/flows/'+flow.id,'PATCH',{graph:{startNodeId:'step0',nodes}});await page.reload();await page.locator('.premium-flow-node').first().waitFor();await page.locator('.tb-save').click();const stored=await call('/flows/'+flow.id);assert.equal(stored.draft_graph.nodes.length,40);assert.deepEqual(stored.draft_graph.nodes[0].edges,nodes[0].edges);assert.deepEqual(stored.draft_graph.nodes[0].data.buttons.map(b=>b.id),['stable-a','stable-b']);
  await page.getByRole('button',{name:/إضافة خطوة/}).first().click();await page.getByRole('menuitem').first().waitFor();await shot('builder-library-ar-desktop');await page.keyboard.press('Escape');
 });
 await check('Arabic/English real pages at 320/390/768/1440 and 200% text have correct direction and no horizontal page overflow',async()=>{
  const routes=['','/channels','/flows','/crm','/inbox','/inbox/settings','/campaigns','/sequences','/commerce','/integrations','/billing','/sessions','/settings',`/flows/${flow.id}`,'/flows/new','/onboarding'];
  for(const language of ['ar','en']){
   await page.evaluate(l=>localStorage.setItem('boat-language',l),language);
   for(const width of [320,390,768,1440])for(const route of routes){
    await page.setViewportSize({width,height:1000});await page.goto(web+'/dashboard'+route);await page.locator('.page-workspace,.focused-workspace').first().waitFor();await page.waitForTimeout(100);
    const actual=await page.evaluate(()=>({direction:document.documentElement.dir,overflow:document.documentElement.scrollWidth>innerWidth+1}));views.push({language,width,route,...actual});if(language==='ar'&&width===320&&route==='/integrations')await shot('integrations-ar-320-after');if(language==='ar'&&width===768&&route==='/flows')await shot('flows-ar-768-after');assert.equal(actual.direction,language==='ar'?'rtl':'ltr',route);
   }
   await page.setViewportSize({width:1440,height:1000});
   for(const route of routes){await page.goto(web+'/dashboard'+route);await page.locator('.page-workspace,.focused-workspace').first().waitFor();await page.waitForFunction(l=>document.documentElement.dir===(l==='ar'?'rtl':'ltr'),language);await page.waitForTimeout(100);await page.evaluate(()=>{const sizes=[...document.querySelectorAll('body *')].filter(e=>e instanceof HTMLElement&&!['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName)).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),line:parseFloat(getComputedStyle(e).lineHeight)}));for(const {e,size,line} of sizes){e.style.fontSize=(size*2)+'px';if(Number.isFinite(line))e.style.lineHeight=(line*2)+'px';}});views.push({language,width:1440,zoom:'200%',route,direction:await page.locator('html').getAttribute('dir'),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});if(!route)await shot('dashboard-'+language+'-text200');}
  }
  await writeFile(`${out}/layout-results.json`,JSON.stringify(views,null,2));assert.deepEqual(views.filter(v=>v.overflow),[], 'Page overflow after layout survey');
 });
 await page.evaluate(()=>localStorage.setItem('boat-language','en'));await page.setViewportSize({width:674,height:1000});
 await page.goto(web+'/dashboard/billing');await page.getByRole('heading',{name:'A plan that grows with you',exact:true}).waitFor();await shot('billing-en-reference-width');
 await page.goto(web+'/dashboard/commerce');await page.getByRole('button',{name:'Social publishing',exact:true}).click();await shot('social-en-reference-width');
 await page.goto(web+`/dashboard/flows/${flow.id}`);await page.locator('.premium-flow-node').first().waitFor();await page.getByRole('button',{name:/Add step/}).first().click();await page.getByRole('menuitem').first().waitFor();await shot('library-en-reference-width');
 await page.setViewportSize({width:320,height:844});await page.keyboard.press('Escape');await page.evaluate(()=>localStorage.setItem('boat-language','ar'));await page.reload();await open('step0');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await shot('builder-ar-320');
 await check('mobile touch opens the inspector and pans the real canvas',async()=>{
  const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('session')));
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const touch=await context.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.addInitScript(s=>{localStorage.setItem('session',JSON.stringify(s));localStorage.setItem('boat-language','ar');},session);
  await touch.goto(web+`/dashboard/flows/${flow.id}`);await touch.getByRole('searchbox',{name:'البحث في عقد البوت',exact:true}).fill('step0');await touch.locator('.node-finder .card button').first().tap();await touch.locator('.builder-inspector[data-open="true"]').waitFor();await touch.locator('.sheet-close').tap();await touch.waitForTimeout(500);
  const viewport=touch.locator('.react-flow__viewport'),before=await viewport.getAttribute('style'),client=await context.newCDPSession(touch);const point=await touch.evaluate(()=>{const pane=document.querySelector('.react-flow__pane'),box=pane.getBoundingClientRect();for(let y=Math.max(0,box.top)+40;y<Math.min(innerHeight,box.bottom)-40;y+=40)for(let x=12;x<innerWidth-120;x+=30)if(document.elementFromPoint(x,y)===pane)return{x,y};});assert.ok(point,'A visible canvas background is required for panning');const {x,y}=point;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*20,y}]});await touch.waitForTimeout(30);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.waitForFunction(old=>document.querySelector('.react-flow__viewport')?.getAttribute('style')!==old,before);
  await touch.screenshot({path:`${out}/builder-touch-390.png`,fullPage:true});await context.close();
 });
 assert.deepEqual(errors,[]);await writeFile(`${out}/chromium-results.json`,JSON.stringify({results,views,pageErrors:errors,providerCalls:false,references:['1000082294.jpg','1000082295.jpg','1000082310.jpg']},null,2));
 console.log(`PASS Chromium parity acceptance: ${results.length} groups, ${views.length} route/layout views, no page errors.`);
}catch(e){await shot('failure');await writeFile('/tmp/boat-browser-failure.txt',await page.locator('body').innerText());throw e;}finally{await browser.close();}
