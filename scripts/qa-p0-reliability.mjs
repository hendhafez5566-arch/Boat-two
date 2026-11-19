import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const base='http://localhost:4000', checks=[];
async function call(path,token,body,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await response.text();return {status:response.status,data:text?JSON.parse(text):null};
}
async function api(path,token,body,method){const r=await call(path,token,body,method);assert.ok(r.status<300,path+' HTTP '+r.status+' '+JSON.stringify(r.data));return r.data;}
async function check(name,fn){try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',error:e.message});}}
const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'P0 Reliability',workspaceName:'P0 isolated reliability'}), token=owner.accessToken;
const agents=[];
for(let i=0;i<2;i++){
 const inv=await api('/team/invitations',token,{email:uuid()+'@example.test',role:'agent',sendEmail:false});
 const s=await api('/auth/accept-invitation',null,{token:new URL(inv.inviteUrl).searchParams.get('token'),password:'Synthetic-'+uuid(),fullName:'P0 Agent '+i});
 s.id=(await api('/crm/workspace/members',s.accessToken)).currentUserId;agents.push(s);
}
const channel=await api('/channels',token,{type:'web',name:'P0 synthetic only'});
const graph=(text)=>({startNodeId:'m',nodes:[{id:'m',type:'message',position:{x:100,y:100},data:{text},edges:{next:'end'}},{id:'end',type:'end',position:{x:500,y:100},data:{},edges:{}}]});
let flow=await api('/flows',token,{name:'Concurrent draft',channelIds:[channel.id]});
await check('concurrent saves reject the stale editor and concurrent publish is atomic',async()=>{
 const before=flow.updated_at;
 const saves=await Promise.all(['first','second'].map(text=>call('/flows/'+flow.id,token,{graph:graph(text),expectedUpdatedAt:before},'PATCH')));
 assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
 flow=await api('/flows/'+flow.id,token);
 const publications=await Promise.all([0,1].map(()=>call('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at})));
 assert.deepEqual(publications.map(r=>r.status).sort(),[201,409]);
 assert.equal((await api('/flows/'+flow.id+'/versions',token)).length,1);
});
await check('failed publication preserves active version and restoration rejects stale editors',async()=>{
 flow=await api('/flows/'+flow.id,token);const published=flow.published_version_id;
 const version=(await api('/flows/'+flow.id+'/versions',token))[0];
 const saved=await api('/flows/'+flow.id,token,{graph:{startNodeId:'missing',nodes:[]},expectedUpdatedAt:flow.updated_at},'PATCH');
 assert.equal((await call('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:saved.updated_at})).status,400);
 assert.equal((await api('/flows/'+flow.id,token)).published_version_id,published);
 assert.equal((await call('/flows/'+flow.id+'/versions/'+version.id+'/restore',token,{expectedUpdatedAt:flow.updated_at})).status,409);
 await api('/flows/'+flow.id+'/versions/'+version.id+'/restore',token,{expectedUpdatedAt:saved.updated_at});
 assert.equal((await api('/flows/'+flow.id,token)).draft_graph.nodes[0].type,'message');
});
const visitor=await api('/widget/'+channel.external_id+'/session',null,{});
async function visitorCall(text){const r=await fetch(base+'/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId,{method:text?'POST':'GET',headers:{'content-type':'application/json','x-visitor-token':visitor.token},...(text?{body:JSON.stringify({text,clientMsgId:uuid()})}:{})});assert.ok(r.ok);return r.json();}
await visitorCall('Synthetic conversation');
const cv=(await api('/conversations',token)).items[0];
await check('two simultaneous staff claims have one winner; non-owner cannot send, release or steal',async()=>{
 const claims=await Promise.all(agents.map(a=>call('/conversations/'+cv.id+'/takeover',a.accessToken,{})));
 assert.deepEqual(claims.map(r=>r.status).sort(),[201,409]);
 const detail=await api('/conversations/'+cv.id,token),winner=agents.find(a=>a.id===detail.assigned_to),loser=agents.find(a=>a.id!==detail.assigned_to);
 assert.ok(winner&&loser);
 for(const [path,body,method] of [
  ['/messages',{text:'MUST NOT BE SENT'},'POST'],['/takeover',{},'POST'],['/release',{},'POST'],['',{assignedTo:loser.id,handledBy:'human'},'PATCH'],
 ])assert.equal((await call('/conversations/'+cv.id+path,loser.accessToken,body,method)).status,409);
 await api('/conversations/'+cv.id+'/messages',winner.accessToken,{text:'Authorized owner reply'});
 assert.ok(!JSON.stringify(await visitorCall()).includes('MUST NOT BE SENT'));
 await api('/conversations/'+cv.id,token,{assignedTo:loser.id},'PATCH');
 assert.equal((await api('/conversations/'+cv.id,token)).assigned_to,loser.id);
});
await check('Inbox and Webchat drain long history without omission or internal note leakage',async()=>{
 await api('/conversations/'+cv.id+'/takeover',token,{});
 for(let i=0;i<205;i++)await api('/conversations/'+cv.id+'/messages',token,{text:'Backlog '+i});
 await api('/conversations/'+cv.id+'/notes',token,{text:'PRIVATE-BACKLOG-NOTE'});
 const first=await api('/conversations/'+cv.id+'/messages?afterSeq=0&limit=200',token);
 assert.equal(first.items.length,200);assert.equal(first.hasMore,true);
 const second=await api('/conversations/'+cv.id+'/messages?afterSeq='+first.items.at(-1).seq+'&limit=200',token);
 assert.ok(second.items.length>0);assert.equal(second.hasMore,false);
 const seen=new Set();let cursor=0,pages=0;
 while(true){
  const response=await fetch(base+'/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId+'&after='+cursor,{headers:{'x-visitor-token':visitor.token}});
  assert.ok(response.ok);const page=await response.json();pages++;
  for(const m of page.messages){assert.ok(Number(m.seq)>cursor);assert.ok(!seen.has(m.id));seen.add(m.id);}
  assert.ok(!JSON.stringify(page).includes('PRIVATE-BACKLOG-NOTE'));
  if(!page.hasMore)break;
  assert.ok(page.messages.length);cursor=Number(page.messages.at(-1).seq);assert.ok(pages<10);
 }
 assert.ok(pages>=3);assert.ok(seen.size>=207);
});
await check('session ownership, revocation, token rotation and logout reject replay',async()=>{
 const agent=agents[0],sessions=await api('/auth/sessions',agent.accessToken);
 const current=sessions.find(s=>s.is_current);assert.ok(current);
 assert.equal((await call('/auth/sessions/'+current.id+'/revoke',token,{})).status,404);
 await api('/auth/sessions/'+current.id+'/revoke',agent.accessToken,{});
 assert.equal((await call('/auth/sessions',agent.accessToken)).status,401);
 assert.equal((await call('/auth/refresh',null,{refreshToken:agent.refreshToken})).status,401);
 const rotated=await api('/auth/refresh',null,{refreshToken:owner.refreshToken});
 assert.equal((await call('/auth/refresh',null,{refreshToken:owner.refreshToken})).status,401);
 await api('/auth/logout',null,{refreshToken:rotated.refreshToken});
 assert.equal((await call('/auth/sessions',rotated.accessToken)).status,401);
 assert.equal((await call('/auth/refresh',null,{refreshToken:rotated.refreshToken})).status,401);
});
writeFileSync('/tmp/boat-p0-fixture.json',JSON.stringify({conversationId:cv.id,tenantId:cv.tenant_id}),{mode:0o600});
mkdirSync('docs/p0-evidence',{recursive:true});
writeFileSync('docs/p0-evidence/reliability-http.json',JSON.stringify({checks,providerCalls:false},null,2)+'\n');
console.log(JSON.stringify(checks));
if(checks.some(c=>c.status!=='PASS'))process.exitCode=1;
