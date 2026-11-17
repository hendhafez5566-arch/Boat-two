// Explicitly authorized Preview-only synthetic acceptance. No external channel or paid calls.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const web='https://boat-preview-web-preview.up.railway.app',base='https://boat-preview-api-preview.up.railway.app';
const {chromium}=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
async function api(path,token,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});assert.ok(r.ok,path+' HTTP'+r.status);return r.json();}
const session=await api('/auth/register',null,{email:'qa-preview-'+uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Synthetic release QA',workspaceName:'QA isolated P0-P1 release'}),token=session.accessToken;
const channel=await api('/channels',token,{type:'web',name:'QA release webchat'}),visitor=await api('/widget/'+channel.external_id+'/session',null,{});
const route='/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
async function inbound(id){const r=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Synthetic live customer سؤال العميل',clientMsgId:id}),signal:AbortSignal.timeout(60000)});assert.ok(r.ok);return r.json();}
const msgId=uuid();await inbound(msgId);assert.equal((await inbound(msgId)).duplicate,true);
await api('/workspace/onboarding/complete',token,{});
const cv=(await api('/conversations',token)).items[0];await api('/conversations/'+cv.id+'/takeover',token,{});await api('/conversations/'+cv.id+'/notes',token,{text:'PRIVATE LIVE ACCEPTANCE'});
for(let i=0;i<5;i++)await api('/conversations/'+cv.id+'/messages',token,{text:'Live staff reply '+i+' رد الموظف'});
assert.equal((await api('/conversations/'+cv.id+'/messages?afterSeq=0&limit=2',token)).hasMore,true);
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[],out='docs/p0-evidence/live-runtime-browser';mkdirSync(out,{recursive:true});
try{for(const language of ['ar','en'])for(const width of [390,1366]){
 const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(({session,language})=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language',language);},{session,language});
 const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>[new URL(web).hostname,new URL(base).hostname].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto(web+'/dashboard/inbox?conversation='+cv.id);await page.locator('.thread-msgs').getByText('Live staff reply 4 رد الموظف',{exact:true}).waitFor();
 const recovered='Live reconnect '+language+' '+width;await context.setOffline(true);await api('/conversations/'+cv.id+'/messages',token,{text:recovered});await context.setOffline(false);await page.locator('.thread-msgs').getByText(recovered,{exact:true}).waitFor({timeout:30000});
 await page.reload();await page.locator('.thread-msgs').getByText(recovered,{exact:true}).waitFor();assert.equal(await page.locator('.thread-msgs').getByText(recovered,{exact:true}).count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/inbox-${language}-${width}.png`});
 await page.goto(web+'/dashboard/reports');await page.getByRole('button',{name:language==='ar'?'عرض التقارير':'View reports',exact:true}).click();const region=page.getByRole('region',{name:language==='ar'?'وقت أول رد بشري':'First human response time'});await region.waitFor();assert.ok((await region.textContent()).includes(language==='ar'?'ثانية':'seconds'));await region.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/reports-${language}-${width}.png`});
 assert.deepEqual(errors,[]);results.push({language,width,status:'PASS',checks:['deployed Inbox persisted replies','offline reconnect','reload without duplicates','measured response report']});await context.close();
}
const r=await fetch(base+route,{headers:{'x-visitor-token':visitor.token}});const history=await r.json();assert.ok(!JSON.stringify(history).includes('PRIVATE LIVE ACCEPTANCE'));
writeFileSync(out+'/results.json',JSON.stringify({status:'PASS',realPreview:true,syntheticTenant:true,externalMessages:false,deletedRecords:false,results,createdAt:new Date().toISOString()},null,2)+'\n');console.log('PASS live Preview runtime browser',results.length);
}finally{await browser.close();}
