import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';assertLocalAcceptance();
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:4000',web='http://localhost:3000',out='docs/p0-evidence/flow-version-browser';mkdirSync(out,{recursive:true});
async function api(path,token,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(data));return data;
}
const graph=text=>({startNodeId:'message',nodes:[{id:'message',type:'message',position:{x:200,y:100},data:{text},edges:{}}]});
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const t=(ar,en)=>language==='ar'?ar:en,session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Version UI QA',workspaceName:'Isolated version UI'}),token=session.accessToken;
 const channel=await api('/channels',token,{type:'web',name:'Version UI'});await api('/workspace/onboarding/complete',token,{});
 let flow=await api('/flows',token,{name:'Version authoring',channelIds:[channel.id]});
 for(const text of ['Immutable version one','Immutable version two']){
  flow=await api('/flows/'+flow.id,token,{graph:graph(text),expectedUpdatedAt:(await api('/flows/'+flow.id,token)).updated_at},'PATCH');
  await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
 }
 const published=(await api('/flows/'+flow.id,token)).published_version_id;
 const context=await browser.newContext({viewport:{width,height:936}});await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 async function menu(){await page.getByRole('button',{name:t('المزيد من الأدوات','More tools'),exact:true}).click();}
 async function openMessage(){await menu();await page.getByRole('button',{name:t('البحث في العقد','Find a step'),exact:true}).click();await page.getByRole('searchbox',{name:t('البحث في عقد البوت','Find a bot node'),exact:true}).fill('message');await page.locator('[class*="finder"] .card button').click();return page.getByRole('dialog');}
 await page.goto(web+'/dashboard/flows/'+flow.id);let dialog=await openMessage();await dialog.getByRole('textbox',{name:t('رسالة الرد','Reply Message'),exact:true}).fill('Unpublished version three');await dialog.getByRole('button',{name:t('حفظ التغييرات','Save Changes'),exact:true}).click();
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/flows/'+flow.id)&&r.request().method()==='PATCH'&&r.ok()),page.getByRole('button',{name:t('حفظ','Save'),exact:true}).click()]);
 assert.equal((await api('/flows/'+flow.id,token)).draft_graph.nodes[0].data.text,'Unpublished version three');
 await menu();await page.getByRole('button',{name:t('الإصدارات المنشورة','Published versions'),exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByText(t('الاستعادة لا تغيّر الإصدار المنشور حتى تضغط نشر.','Restoring changes the draft; publish to replace the live version.'),{exact:true}).waitFor();await page.screenshot({path:`${out}/versions-${language}-${width}.png`});
 await Promise.all([page.waitForEvent('load'),page.waitForResponse(r=>r.url().includes('/versions/')&&r.url().endsWith('/restore')&&r.ok()),dialog.getByRole('button',{name:new RegExp('^'+t('استعادة v1 إلى المسودة','Restore v1 to draft'))}).click()]);
 const restored=await api('/flows/'+flow.id,token);assert.equal(restored.draft_graph.nodes[0].data.text,'Immutable version one');assert.equal(restored.published_version_id,published);assert.equal((await api('/flows/'+flow.id+'/versions',token)).length,2);
 dialog=await openMessage();assert.equal(await dialog.getByRole('textbox',{name:t('رسالة الرد','Reply Message'),exact:true}).inputValue(),'Immutable version one');await dialog.getByRole('button',{name:t('حفظ التغييرات','Save Changes'),exact:true}).click();
 async function liveReply(expected){
  const visitorContext=await browser.newContext({viewport:{width,height:936}}),visitorPage=await visitorContext.newPage();visitorPage.setDefaultTimeout(25000);
  await visitorPage.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await visitorPage.route(base+'/version-client',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><body><script src="${base}/widget.js" data-key="${channel.external_id}"></script></body></html>`}));await visitorPage.goto(base+'/version-client');await visitorPage.locator('.launcher').click();await visitorPage.locator('input[aria-label]').fill('Start');await visitorPage.locator('.send').click();await visitorPage.getByText(expected,{exact:true}).waitFor();assert.equal(await visitorPage.getByText('Unpublished version three',{exact:true}).count(),0);await visitorPage.screenshot({path:`${out}/live-${expected.endsWith('two')?'before':'after'}-${language}-${width}.png`});await visitorContext.close();
 }
 await liveReply('Immutable version two');
 await menu();await page.getByRole('button',{name:t('نشر التحديث','Publish update'),exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/publish')&&r.ok()),page.getByRole('button',{name:t('تأكيد النشر','Confirm publish'),exact:true}).click()]);
 assert.equal((await api('/flows/'+flow.id+'/versions',token)).length,3);assert.notEqual((await api('/flows/'+flow.id,token)).published_version_id,published);
 await liveReply('Immutable version one');assert.deepEqual(errors,[]);results.push({language,width,status:'PASS',checks:['edit and save unpublished draft through inspector','restore v1 from actual versions dialog','reload/reopen shows restored v1','restore preserves v2 live reply and version count','UI republish creates v3 and changes a fresh visitor reply to v1','unpublished draft never sent'],scope:'isolated browser/API/PGlite; PostgreSQL lifecycle and roles separately tested'});await context.close();
}}finally{await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');}
console.log('PASS actual draft/version restore and live publication UI journeys',results.length);
