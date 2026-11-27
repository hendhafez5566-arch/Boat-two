import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000',web='http://localhost:3000',out='docs/p0-evidence/campaign-delivery';mkdirSync(out,{recursive:true});
const { chromium }=createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE||'playwright');
async function call(path, token, body, method=body?'POST':'GET',expected){
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();
 if(expected)assert.equal(r.status,expected,path+' '+JSON.stringify(data));else assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(data));return data;
}
async function poll(fn,label){
 for(let n=0;n<60;n++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,500));}
 throw Error('Timeout: '+label);
}
const session=await call('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Delivery QA',workspaceName:'Isolated delivery'}),token=session.accessToken;
const channel=await call('/channels',token,{type:'web',name:'Isolated retry webchat'});
await call('/workspace/onboarding/complete',token,{});
const visitor=await call('/widget/'+channel.external_id+'/session',null,{});
const widgetPath='/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
const inbound=await fetch(base+widgetPath,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Synthetic visitor',clientMsgId:uuid()})});assert.ok(inbound.ok);
const conv=(await call('/conversations',token)).items[0];assert.ok(conv.contact_id);
await call('/conversations/'+conv.id+'/notes',token,{text:'PRIVATE QA note must never be visible'});
await call('/crm/contacts/'+conv.contact_id+'/consent',token,{channelId:channel.id,status:'opted_in',evidence:'Isolated QA consent'},'PUT');
await call('/delivery/policies/'+channel.id,token,{intervalMs:1000,marketingEnabled:true},'PUT');
const marker='Synthetic campaign retry '+uuid();
const campaign=await call('/campaigns',token,{name:'Retry QA campaign',channelId:channel.id,content:{text:marker}});
const ledger=()=>call('/campaigns/'+campaign.id+'/recipients',token);
const widget=async()=>{const r=await fetch(base+widgetPath,{headers:{'x-visitor-token':visitor.token}});assert.ok(r.ok);return (await r.json()).messages;};
await call('/channels/'+channel.id,token,{status:'disabled'},'PATCH');
await call('/campaigns/'+campaign.id+'/schedule',token,{at:new Date().toISOString()});
const failed=await poll(async()=>{const l=await ledger();return l.items.find(x=>x.status==='failed'&&x.can_retry===true);},'retryable processing failure');
assert.equal(failed.message_id,null);
await call('/channels/'+channel.id,token,{status:'active'},'PATCH');
const browser=await chromium.launch({executablePath:process.env.BOAT_CHROMIUM||'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:936},acceptDownloads:true});
 await context.addInitScript(session=>{localStorage.setItem('session',JSON.stringify(session));localStorage.setItem('boat-language','ar');},session);
 const page=await context.newPage();page.setDefaultTimeout(25000);
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.goto(web+'/dashboard/campaigns?channel=web');
 await page.getByRole('row').filter({hasText:'Retry QA campaign'}).getByRole('button',{name:'النتائج',exact:true}).click();
 const retry=page.getByRole('button',{name:'إعادة المحاولة',exact:true});
 await retry.waitFor();
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/recipients/'+failed.id+'/retry')&&r.ok()),retry.click()]);
 const sent=await poll(async()=>{const l=await ledger();return l.items.find(x=>x.id===failed.id&&x.delivery_status==='sent'&&x.message_id);},'local webchat send after retry');
 assert.equal(sent.can_retry,false);
 await call('/campaigns/'+campaign.id+'/recipients/'+failed.id+'/retry',token,{},'POST',400);
 const messages=await widget();
 assert.equal(messages.filter(m=>m.content?.text===marker).length,1,'campaign must appear exactly once to visitor');
 assert.equal(messages.filter(m=>m.content?.text==='PRIVATE QA note must never be visible').length,0);
 const visitor2=await call('/widget/'+channel.external_id+'/session',null,{});
 const other=await fetch(base+'/widget/'+channel.external_id+'/messages?visitorId='+visitor2.visitorId,{headers:{'x-visitor-token':visitor2.token}});
 assert.ok(other.ok);assert.equal((await other.json()).messages.filter(m=>m.content?.text===marker).length,0,'another visitor must not see campaign message');
 await page.reload();await page.getByRole('row').filter({hasText:'Retry QA campaign'}).getByRole('button',{name:'النتائج',exact:true}).click();
 await page.getByRole('button',{name:'تنزيل الصفحة المحملة',exact:true}).waitFor();assert.equal(await retry.count(),0);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'تنزيل الصفحة المحملة',exact:true}).click();const download=await dl;assert.match(download.suggestedFilename(),/campaign-recipients-page-1\.json/);
 await page.screenshot({path:out+'/ledger.png',fullPage:true});
 writeFileSync(out+'/results.json',JSON.stringify({status:'PASS',checks:['retryable failure','retry through browser','one sent message','duplicate retry rejected','private note hidden','other visitor isolated','ledger download'],externalDelivery:false},null,2));
 console.log('PASS local campaign worker retry, visitor visibility, privacy and duplicate rejection');
}finally{await browser.close();}
