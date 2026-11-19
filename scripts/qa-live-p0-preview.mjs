// Authorized owner acceptance only: creates synthetic Preview records, never provider traffic.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
if(process.env.RUN_LIVE_P0_QA!=='true') throw Error('Explicit Preview acceptance opt-in required');
const base='https://boat-preview-api-preview.up.railway.app';
const checks=[];
async function api(path,token,body,method=body?'POST':'GET',expected){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const value=await r.json();
 if(expected)assert.equal(r.status,expected,path+' unexpected HTTP status');else assert.ok(r.ok,path+' unexpected HTTP '+r.status);
 return value;
}
async function until(fn,match){for(let n=0;n<40;n++){const v=await fn();if(match(v))return v;await new Promise(r=>setTimeout(r,500));}throw Error('Timed out waiting for synthetic Preview state');}
async function company(){return api('/auth/register',null,{email:'p0-'+randomUUID()+'@example.test',password:'Synthetic-'+randomUUID(),fullName:'P0 Synthetic QA',workspaceName:'P0 QA — synthetic only — 20261117'});}
const session=await company(),token=session.accessToken;
const channel=await api('/channels',token,{type:'web',name:'P0 synthetic Webchat',settings:{title:'P0 test',allowedOrigins:['https://example.test']}});
await api('/workspace/onboarding/complete',token,{});
await api('/channels/'+channel.id,token,{settings:{title:'P0 renamed'}},'PATCH');
const reopened=(await api('/channels',token)).find(c=>c.id===channel.id);
assert.deepEqual(reopened.settings.allowedOrigins,['https://example.test']);
checks.push('Company registration/onboarding; Webchat settings retain allowed origins after partial update');
let flow=await api('/flows',token,{name:'P0 synthetic name and handoff',language:'ar',channelIds:[channel.id]});
const graph={startNodeId:'ask',nodes:[{id:'ask',type:'question',position:{x:100,y:100},data:{text:'P0 synthetic name?',answerType:'text',saveAs:'name',saveToSystem:'name'},edges:{ok:'staff'}},{id:'staff',type:'handoff',position:{x:500,y:100},data:{message:'P0 synthetic handoff'},edges:{}}]};
flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');
await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
const visitor=await api('/widget/'+channel.external_id+'/session',null,{});
const route='/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
async function visitorRequest(text,clientMsgId=randomUUID()){
 const r=await fetch(base+route,{method:text?'POST':'GET',headers:{'Content-Type':'application/json','x-visitor-token':visitor.token},...(text?{body:JSON.stringify({text,clientMsgId})}:{})});
 assert.ok(r.ok,'Synthetic visitor HTTP '+r.status);return r.json();
}
await visitorRequest('P0 synthetic greeting');
await until(()=>visitorRequest(),v=>JSON.stringify(v).includes('P0 synthetic name?'));
await visitorRequest('P0 Synthetic Visitor');
const convo=await until(async()=> (await api('/conversations',token)).items[0],v=>v?.handled_by==='human');
const profile=await api('/crm/contacts/'+convo.contact_id+'/profile',token);
assert.equal(profile.contact.name,'P0 Synthetic Visitor');
checks.push('Published flow asks for name, saves CRM identity and transfers to human');
await api('/conversations/'+convo.id,token,{handledBy:'human'},'PATCH');
await api('/conversations/'+convo.id+'/notes',token,{text:'P0 INTERNAL ONLY'});
await api('/conversations/'+convo.id+'/messages',token,{text:'P0 synthetic staff reply'});
await until(()=>visitorRequest(),v=>JSON.stringify(v).includes('P0 synthetic staff reply'));
assert.ok(!JSON.stringify(await visitorRequest()).includes('P0 INTERNAL ONLY'));
const msgId=randomUUID();await visitorRequest('P0 duplicate fixture',msgId);const repeat=await visitorRequest('P0 duplicate fixture',msgId);assert.equal(repeat.duplicate,true);
assert.equal((await api('/conversations/'+convo.id,token)).handled_by,'human');
checks.push('Human reply arrives in widget; internal note stays private; duplicate visitor delivery is idempotent; takeover remains human');
const other=await company();
await api('/flows/'+flow.id,other.accessToken,null,'GET',404);
await api('/conversations/'+convo.id,other.accessToken,null,'GET',404);
checks.push('Separate synthetic company cannot read the flow or conversation');
const report={status:'PASS',scope:'existing Railway Preview API/Webchat runtime only; not browser or official provider acceptance',createdAt:new Date().toISOString(),tenantId:session.tenantId,flowId:flow.id,channelId:channel.id,checks,realProviderCalls:false,realPayments:false,deletedRecords:false};
mkdirSync('docs/p0-evidence',{recursive:true});writeFileSync('docs/p0-evidence/live-preview-api.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
