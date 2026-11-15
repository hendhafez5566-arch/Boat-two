/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const web='https://boat-preview-web-preview.up.railway.app';
const apiBase='https://boat-preview-api-preview.up.railway.app';
const out='docs/enterprise-20261115/live-crm-lists';
mkdirSync(out,{recursive:true});
async function api(path,token,body,method=body?'POST':'GET'){
  const r=await fetch(apiBase+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const data=await r.json();assert.ok(r.ok,path+': '+r.status+' '+JSON.stringify(data).slice(0,200));return data;
}
const login=await fetch(web+'/login',{signal:AbortSignal.timeout(60000)});
assert.equal(login.status,200,'actual Preview web login HTTP 200');
const session=await api('/auth/register',null,{email:'qa-live-crm-'+randomUUID()+'@example.test',password:'QA-PreviewOnly-'+randomUUID(),fullName:'Synthetic live CRM QA',workspaceName:'QA isolated CRM lists'});
await api('/channels',session.accessToken,{type:'web',name:'QA isolated web channel'});
await api('/workspace/onboarding/complete',session.accessToken,{});
const contact=await api('/crm/contacts',session.accessToken,{name:'Synthetic Live CRM Contact'});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try{
for(const language of ['ar','en'])for(const width of [390,1366]){
  const t=(ar,en)=>language==='ar'?ar:en;
  const context=await browser.newContext({viewport:{width,height:936}});
  await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
  const page=await context.newPage();page.setDefaultTimeout(25000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(web+'/dashboard/crm/lists',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:t('قوائم المشتركين','Subscriber lists')}).waitFor();
  await page.getByRole('heading',{name:t('أدر أعضاء القائمة','Manage audience members')}).waitFor();
  const name='QA Preview Audience '+language+' '+width;
  await page.getByRole('textbox',{name:t('اسم القائمة الجديدة','New list name')}).fill(name);
  await page.getByRole('button',{name:t('إنشاء القائمة','Create list')}).click();
  await page.getByText(t('تم إنشاء القائمة. يمكنك الآن إضافة العملاء إليها.','List created. You can now add customers.')).waitFor();
  await page.getByRole('searchbox',{name:t('ابحث بالاسم أو بيانات التواصل','Search by name or contact details')}).fill('Synthetic Live CRM Contact');
  await page.getByRole('combobox',{name:t('اختر العميل من النتائج','Choose a customer from results')}).selectOption(contact.id);
  await page.getByRole('button',{name:t('إضافة إلى القائمة','Add to list')}).click();
  await page.getByText(t('تمت إضافة العميل إلى القائمة.','Customer added to the list.')).waitFor();
  await page.locator('ul[class*="memberList"]').getByText('Synthetic Live CRM Contact',{exact:true}).waitFor();
  await page.screenshot({path:out+'/live-crm-'+language+'-'+width+'.png'});
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:t('إزالة','Remove'),exact:true}).click();
  await page.getByText(t('القائمة فارغة','This list is empty'),{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  assert.deepEqual(errors,[]);
  results.push({language,width,realPreview:true,createAddRemove:true,status:'PASS'});
  await context.close();
}
writeFileSync(out+'/results.json',JSON.stringify({syntheticTenant:true,noExternalMessages:true,results},null,2));
console.log(JSON.stringify({status:'PASS',realPreview:true,journeys:results.length}));
}finally{await browser.close();}
