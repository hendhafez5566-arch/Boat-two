// Published engine acceptance on isolated real PostgreSQL; no external transports.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';assertLocalAcceptance();
const base='http://localhost:4000';
async function api(path,token,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' HTTP '+r.status);return r.json();
}
const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Bounded runtime',workspaceName:'Isolated bounded runtime'});
const token=owner.accessToken,ch=await api('/channels',token,{type:'web',name:'Bounded regex runtime'});
let flow=await api('/flows',token,{name:'Bounded regex question and routing',channelIds:[ch.id]});
const node=(id,type,data,edges={})=>({id,type,data,edges});
flow=await api('/flows/'+flow.id,token,{expectedUpdatedAt:flow.updated_at,graph:{startNodeId:'ask',nodes:[
 node('ask','question',{text:'Regex safety question',saveAs:'answer',answerType:'regex',pattern:'(a+)+$',retries:0},{ok:'unexpected',fail:'route'}),
 node('route','condition',{rules:[{id:'unsafe',match:'all',conditions:[{source:'last_message',operator:'matches_regex',value:'(a+)+$'}]}]},{'rule:unsafe':'unexpected',else:'safe'}),
 node('unexpected','message',{text:'UNEXPECTED MATCH'},{next:'end'}),node('safe','message',{text:'Safe fallback reached'},{next:'end'}),node('end','end',{})]}},'PATCH');
await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
const v=await api('/widget/'+ch.external_id+'/session',null,{}),path='/widget/'+ch.external_id+'/messages?visitorId='+v.visitorId;
async function send(text){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':v.token},body:JSON.stringify({text,clientMsgId:uuid()})});assert.ok(r.ok);}
async function wait(text){for(let i=0;i<150;i++){const h=await(await fetch(base+path,{headers:{'x-visitor-token':v.token}})).json();if(JSON.stringify(h).includes(text))return h;await new Promise(r=>setTimeout(r,50));}throw Error('Runtime failed to reach '+text);}
await send('Start');await wait('Regex safety question');const start=performance.now();await send('a'.repeat(100)+'!');const history=await wait('Safe fallback reached');assert.ok(performance.now()-start<8000);assert.ok(!JSON.stringify(history).includes('UNEXPECTED MATCH'));assert.equal((await fetch(base+'/health')).status,200);assert.ok(JSON.stringify(await wait('Safe fallback reached')).includes('Safe fallback reached'));
const versionsBefore=await api('/flows/'+flow.id+'/versions',token);
for(const kind of ['question','condition']){
 const current=await api('/flows/'+flow.id,token),graph=structuredClone(current.draft_graph);
 if(kind==='question')graph.nodes.find(n=>n.id==='ask').data.pattern='(';
 else {graph.nodes.find(n=>n.id==='ask').data.pattern='^ok$';graph.nodes.find(n=>n.id==='route').data.rules[0].conditions[0].value='(';}
 const draft=await api('/flows/'+flow.id,token,{expectedUpdatedAt:current.updated_at,graph},'PATCH');
 const rejected=await fetch(base+'/flows/'+flow.id+'/publish',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({expectedUpdatedAt:draft.updated_at})});
 assert.equal(rejected.status,400,'malformed '+kind+' pattern cannot publish');
 assert.deepEqual(await api('/flows/'+flow.id+'/versions',token),versionsBefore,'failed publication preserves accepted version');
}
const fixturePath=process.env.BOAT_ROLE_BROWSER_FIXTURE;if(fixturePath){const fixture=JSON.parse(readFileSync(fixturePath));fixture.regexWidgetId=ch.external_id;fixture.regexFlowId=flow.id;writeFileSync(fixturePath,JSON.stringify(fixture),{mode:0o600});}
writeFileSync('docs/p0-evidence/role-boundaries/regex-runtime.json',JSON.stringify({status:'PASS',database:process.env.BOAT_REAL_POSTGRES==='true'?'real PostgreSQL':'local reproduction only',checks:['published question over-budget regex follows fail output','published condition over-budget regex follows else output','history persists safe fallback','API remains responsive','invalid question and condition regex publication rejected without replacing published version'],notClaimed:['official provider','whole flow matrix']},null,2)+'\n');console.log('PASS published bounded-regex question and condition fallback');
