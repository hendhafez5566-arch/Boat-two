import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000',file='/tmp/boat-p1-recovery.json';
async function api(path,token,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.ok(r.ok,path+' HTTP'+r.status);return text?JSON.parse(text):null;}
async function send(f,index,id=uuid()){const start=performance.now();const r=await fetch(base+'/widget/'+f.key+'/messages?visitorId='+f.visitorId,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':f.token},body:JSON.stringify({text:'Synthetic bounded load '+index,clientMsgId:id})});assert.ok(r.ok,'Synthetic inbound HTTP'+r.status);return performance.now()-start;}
async function history(f){let after=0,ids=new Set(),inbound=0;for(let page=0;page<50;page++){
 const r=await fetch(base+'/widget/'+f.key+'/messages?visitorId='+f.visitorId+'&after='+after,{headers:{'x-visitor-token':f.token}});assert.ok(r.ok);const data=await r.json();
 for(const message of data.messages){assert.ok(!ids.has(message.id));ids.add(message.id);assert.ok(Number(message.seq)>after);if(message.senderType==='contact')inbound++;}
 if(!data.hasMore)return inbound;assert.ok(data.messages.length);after=Number(data.messages.at(-1).seq);
}throw new Error('Unbounded pagination');}
mkdirSync('docs/p0-evidence',{recursive:true});
if(process.argv.includes('--verify-restart')){
 const {fixtures,companies,stages}=JSON.parse(readFileSync(file,'utf8'));
 for(const f of fixtures){assert.equal(await history(f),f.expected);await send(f,'replayed after actual API restart',f.replayId);assert.equal(await history(f),f.expected);}
 for(let i=0;i<companies.length;i++){
  const company=companies[i],from=new Date(Date.now()-3600000).toISOString(),to=new Date(Date.now()+3600000).toISOString();
  const report=await api('/reports?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to),company.accessToken);
  const expected=fixtures.filter(f=>f.company===i).reduce((n,f)=>n+f.expected,0);
  assert.equal(report.daily.reduce((n,d)=>n+d.inbound,0),expected,'Daily report matches actual persisted inbound');
  assert.equal(report.conversations.reduce((n,d)=>n+d.count,0),2);
  assert.equal(report.lifecycle.reduce((n,d)=>n+d.contacts,0),2);
 }
 writeFileSync('docs/p0-evidence/load-recovery-postgres.json',JSON.stringify({database:'isolated CI PostgreSQL',companies:2,conversations:4,concurrency:8,totalUniqueInbound:1004,stages,status:'PASS',checks:['all inbound messages persisted','actual API process restart','duplicate replay after restart suppressed','daily inbound/conversations/new-contact reports match fixtures'],limitations:'CI measurements only; not a Railway capacity or response-time guarantee',providerCalls:false},null,2)+'\n');
 console.log('PASS actual process restart, backlog integrity and report counts');
}else{
 const companies=[],fixtures=[],stages=[];
 for(let company=0;company<2;company++){
  const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'P1 bounded load',workspaceName:'Isolated P1 '+company});companies.push(owner);
  const channel=await api('/channels',owner.accessToken,{type:'web',name:'Load isolated'});
  for(let i=0;i<2;i++){const visitor=await api('/widget/'+channel.external_id+'/session',null,{});const f={...visitor,key:channel.external_id,company,expected:1,replayId:uuid()};await send(f,'initial deduplicated fixture',f.replayId);fixtures.push(f);}
 }
 let total=0;
 for(const count of [100,400,500]){
  const latencies=[],start=performance.now();let next=0;
  await Promise.all(Array.from({length:8},async()=>{while(next<count){const i=next++,f=fixtures[(total+i)%fixtures.length];latencies.push(await send(f,total+i));f.expected++;}}));
  total+=count;latencies.sort((a,b)=>a-b);const durationMs=performance.now()-start;
  stages.push({additionalMessages:count,cumulativeMessages:total,durationMs:Math.round(durationMs),messagesPerSecond:Number((count*1000/durationMs).toFixed(2)),p50Ms:Math.round(latencies[Math.floor(count*.5)]),p95Ms:Math.round(latencies[Math.floor(count*.95)])});
 }
 for(const f of fixtures)assert.equal(await history(f),f.expected);
 const foreign=(await api('/conversations',companies[1].accessToken)).items[0];
 const denied=await fetch(base+'/conversations/'+foreign.id,{headers:{authorization:'Bearer '+companies[0].accessToken}});assert.ok([403,404].includes(denied.status));
 writeFileSync(file,JSON.stringify({fixtures,companies,stages}),{mode:0o600});console.log('PASS bounded multi-tenant 100/500/1000-message stages',JSON.stringify(stages));
}
