// Targeted role UI regression, not a replacement for connected onboarding acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const fixture=JSON.parse(readFileSync(process.env.BOAT_ROLE_BROWSER_FIXTURE,'utf8'));
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try{
 for(const language of ['ar','en'])for(const width of [390,1366]){
  const t=(ar,en)=>language==='ar'?ar:en;
  const visitor=await browser.newContext({viewport:{width,height:1000}});
  await visitor.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const customer=await visitor.newPage();customer.setDefaultTimeout(25000);
  await customer.goto('http://localhost:3000/widget-demo.html?key='+fixture.regexWidgetId+'&lang='+language);
  await customer.locator('.launcher').click();
  await customer.locator('input[aria-label]').fill('Start');await customer.locator('.send').click();
  await customer.getByText('Regex safety question',{exact:true}).waitFor();
  await customer.locator('input[aria-label]').fill('a'.repeat(100)+'!');await customer.locator('.send').click();
  await customer.getByText('Safe fallback reached',{exact:true}).waitFor();
  await customer.reload();await customer.locator('.launcher').click();await customer.getByText('Safe fallback reached',{exact:true}).waitFor();
  results.push({language,width,status:'PASS',scope:'published configurable regex question fail and condition else through real widget, history after reload'});await visitor.close();
  for(const role of ['agent','owner','admin']){
   const c=await browser.newContext({viewport:{width,height:1000}});
   await c.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session:fixture[role],language});
   await c.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
   const p=await c.newPage();p.setDefaultTimeout(25000);let graphReads=0;
   p.on('request',r=>{if(new URL(r.url()).pathname==='/flows/'+fixture.flowId&&r.method()==='GET')graphReads++;});
   await p.goto('http://localhost:3000/dashboard/flows?channelId='+fixture.channelId);
   const edit=p.getByRole(role==='agent'?'button':'link',{name:t('تعديل','Edit')+': Protected HTTP configuration',exact:true});
   await edit.waitFor();
   if(role==='agent')assert.ok(await edit.isDisabled());else assert.ok(await edit.isEnabled());
   await p.goto('http://localhost:3000/dashboard/flows/'+fixture.flowId+'?channelId='+fixture.channelId);
   if(role==='agent'){
    await p.getByRole('heading',{name:t('هذه الصفحة تحتاج صلاحيات إدارية','This page requires management access'),exact:true}).waitFor();
    assert.equal(graphReads,0,'agent editor must not request private graph');
    assert.equal(await p.locator('.react-flow__node-flowNode').count(),0);
    await p.reload();await p.getByRole('alert').waitFor();assert.equal(graphReads,0);
   }else{
    await p.locator('.react-flow__node-flowNode').first().waitFor();assert.ok(graphReads>0);
    await p.reload();await p.locator('.react-flow__node-flowNode').first().waitFor();
   }
   if(role==='owner'){
    // Separate context prevents the role fixture init script from restoring its
    // own company's session during navigation to this other company's draft.
    const rc=await browser.newContext({viewport:{width,height:1000}});
    await rc.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session:fixture.regexOwner,language});
    await rc.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    const rp=await rc.newPage();rp.setDefaultTimeout(25000);
    await rp.goto('http://localhost:3000/dashboard/flows/'+fixture.regexFlowId);
    await rp.locator('.react-flow__node-flowNode').first().waitFor();
    await rp.getByRole('button',{name:t('المزيد من الأدوات','More tools'),exact:true}).click();
    await rp.getByRole('button',{name:t('فحص التدفق','Validate flow'),exact:true}).click();
    await rp.getByRole('region',{name:t('نتيجة فحص البوت','Bot check result'),exact:true}).getByText(t('نمط المطابقة في الشرط غير صالح. صحّح النمط قبل النشر.','Condition regex pattern is invalid'),{exact:true}).waitFor();
    await rp.screenshot({path:`docs/p0-evidence/role-boundaries/invalid-${language}-${width}.png`});await rc.close();
   }
   // Channel setup is administrative; agents use channel metadata in Inbox.
   if(role==='agent'){
    for(const route of ['/dashboard/channels','/dashboard/channels/connect/web']){
     await p.goto('http://localhost:3000'+route);
     await p.getByRole('heading',{name:t('هذه الصفحة تحتاج صلاحيات إدارية','This page requires management access'),exact:true}).waitFor();
     assert.equal(await p.getByRole('button',{name:t('إنشاء ويدجت محادثة مباشرة','Create Live Chat Widget'),exact:true}).count(),0);
    }
   }
   await p.screenshot({path:`docs/p0-evidence/role-boundaries/${role}-${language}-${width}.png`});
   results.push({role,language,width,status:'PASS',scope:'private editor access, safe list controls, reload and agent channel configuration guard'});await c.close();
  }
 }
}finally{await browser.close();writeFileSync('docs/p0-evidence/role-boundaries/browser.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS role UI combinations',results.length);
