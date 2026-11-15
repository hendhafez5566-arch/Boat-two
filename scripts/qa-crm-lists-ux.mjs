/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const apiBase='http://localhost:4000';
const out='docs/enterprise-20261115/crm-lists-ux';
mkdirSync(out,{recursive:true});
async function api(path,token,body,method=body?'POST':'GET') {
  const r=await fetch(apiBase+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();assert.ok(r.ok,path+JSON.stringify(data));return data;
}
const session=await api('/auth/register',null,{email:randomUUID()+'@example.test',password:'Qa-Crm-'+randomUUID(),fullName:'CRM list UX QA',workspaceName:'Isolated CRM list QA'});
await api('/channels',session.accessToken,{type:'web',name:'Isolated CRM channel'});
await api('/workspace/onboarding/complete',session.accessToken,{});
const contact=await api('/crm/contacts',session.accessToken,{name:'Test Contact QA'});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM || '/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try{
for(const language of ['ar','en'])for(const width of [320,390,768,1366,1920]){
  const t=(ar,en)=>language==='ar'?ar:en;
  const context=await browser.newContext({viewport:{width,height:936}});
  await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.goto('http://localhost:3000/dashboard/crm/lists');
  await page.getByRole('heading',{name:t('قوائم المشتركين','Subscriber lists')}).waitFor();
  await page.getByRole('heading',{name:t('أنشئ قائمة','Create an audience list')}).waitFor();
  await page.getByRole('heading',{name:t('أدر أعضاء القائمة','Manage audience members')}).waitFor();
  const name='QA Audiences '+language+' '+width;
  await page.getByRole('textbox',{name:t('اسم القائمة الجديدة','New list name')}).fill(name);
  await page.getByRole('button',{name:t('إنشاء القائمة','Create list')}).click();
  await page.getByText(t('تم إنشاء القائمة. يمكنك الآن إضافة العملاء إليها.','List created. You can now add customers.')).waitFor();
  await page.getByRole('combobox',{name:t('القائمة الحالية','Current audience list')}).waitFor();
  await page.getByRole('searchbox',{name:t('ابحث بالاسم أو بيانات التواصل','Search by name or contact details')}).fill('Test Contact QA');
  await page.getByRole('combobox',{name:t('اختر العميل من النتائج','Choose a customer from results')}).selectOption(contact.id);
  await page.getByRole('button',{name:t('إضافة إلى القائمة','Add to list')}).click();
  await page.getByText(t('تمت إضافة العميل إلى القائمة.','Customer added to the list.')).waitFor();
  assert.equal(await page.locator('ul[class*="memberList"]').getByText('Test Contact QA',{exact:true}).count(),1);
  await page.screenshot({path:out+'/crm-list-'+language+'-'+width+'.png'});
  page.once('dialog',async d=>{assert.equal(d.type(),'confirm');await d.accept();});
  await page.getByRole('button',{name:t('إزالة','Remove'),exact:true}).click();
  await page.getByText(t('تمت إزالة العميل من القائمة.','Customer removed from the list.')).waitFor();
  await page.getByText(t('القائمة فارغة','This list is empty'),{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no horizontal overflow');
  assert.deepEqual(errors,[]);
  results.push({language,width,create:true,add:true,confirmedRemove:true,emptyState:true,overflow:false,status:'PASS'});
  await context.close();
}
writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({status:'PASS',journeys:results.length}));
}finally{await browser.close();}
