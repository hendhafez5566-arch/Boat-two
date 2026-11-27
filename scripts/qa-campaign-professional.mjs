import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:4000',web='http://localhost:3000',out='docs/p0-evidence/campaign-professional';mkdirSync(out,{recursive:true});
async function api(path,token,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(d));return d;}
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const t=(ar,en)=>language==='ar'?ar:en,session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Campaign QA',workspaceName:'Isolated campaigns'}),token=session.accessToken;
 const channel=await api('/channels',token,{type:'web',name:'Campaign QA website'});
 await api('/workspace/onboarding/complete',token,{});
 const visitor=await api('/widget/'+channel.external_id+'/session',null,{});
 const msg=await fetch(base+'/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Synthetic campaign visitor',clientMsgId:uuid()})});assert.ok(msg.ok);
 const context=await browser.newContext({viewport:{width,height:936},acceptDownloads:true});
 await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto(web+'/dashboard/campaigns?channel=web');const create=page.getByRole('button',{name:/Create Campaign|إنشاء حملة/});await create.click();
 let dialog=page.getByRole('dialog');const name=dialog.getByRole('textbox',{name:t('اسم الحملة','Campaign name'),exact:true});
 await name.fill('Campaign QA draft');await dialog.getByRole('textbox',{name:t('محتوى الرسالة','Message content'),exact:true}).fill('Synthetic draft only');
 const close=dialog.getByRole('button',{name:t('إغلاق لوحة الإعدادات','Close configuration panel'),exact:true});
 let prompted=false;page.once('dialog',d=>{prompted=true;return d.dismiss();});await close.click();assert.ok(prompted);await name.waitFor();
 const save=dialog.getByRole('button',{name:t('حفظ المسودة','Save draft'),exact:true});assert.ok(await save.isDisabled());
 await dialog.getByRole('button',{name:t('مراجعة الجمهور','Review audience'),exact:true}).click();await dialog.getByText(t('المطابقون للتصفية','Matching filters'),{exact:false}).first().waitFor();await save.click();await dialog.waitFor({state:'hidden'});
 const row=page.getByRole('row').filter({hasText:'Campaign QA draft'});await row.waitFor();
 const saved=(await api('/campaigns?channelId='+channel.id,token)).find(x=>x.name==='Campaign QA draft');assert.ok(saved);assert.equal(saved.status,'draft');
 await row.getByRole('button',{name:t('تعديل','Edit'),exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:t('الاسم','Name'),exact:true}).fill('Campaign QA updated');await dialog.getByRole('button',{name:t('حفظ التعديل','Save changes'),exact:true}).click();await dialog.waitFor({state:'hidden'});
 const updated=page.getByRole('row').filter({hasText:'Campaign QA updated'});await updated.waitFor();const search=page.getByRole('searchbox',{name:t('البحث في الحملات','Search campaigns'),exact:true});await search.fill('nonexistent-campaign-qa');await search.press('Enter');await updated.waitFor({state:'hidden'});await page.getByRole('button',{name:t('مسح الفلاتر','Clear filters'),exact:true}).click();await updated.waitFor();
 await updated.getByRole('button',{name:t('جدولة','Schedule'),exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:t('مراجعة أسباب أهلية الجمهور','Review audience eligibility'),exact:true}).click();await dialog.getByText(t('المطابقون للتصفية','Matching filters'),{exact:false}).first().waitFor();assert.ok(await dialog.getByRole('button',{name:t('جدولة','Schedule'),exact:true}).isDisabled(),'no consent or enabled marketing policy must block schedule');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await updated.getByRole('button',{name:t('النتائج','Results'),exact:true}).click();await page.getByText(t('لا يوجد مستلمون يطابقون الفلاتر.','No recipients match these filters.'),{exact:true}).waitFor();await page.getByRole('button',{name:t('مسح فلاتر المستلمين','Clear recipient filters'),exact:true}).click();await page.getByText(t('لا يوجد مستلمون يطابقون الفلاتر.','No recipients match these filters.'),{exact:true}).waitFor();await page.getByRole('button',{name:t('إغلاق النتائج','Close results'),exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'campaign viewport overflow');assert.deepEqual(errors,[]);
 await page.screenshot({path:out+'/campaign-'+language+'-'+width+'.png',fullPage:true});results.push({language,width,status:'PASS'});await context.close();
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS campaign draft, edit, search, protected schedule and recipient journeys',results.length);
