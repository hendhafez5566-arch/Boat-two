import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000';
async function api(path,token,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(data));return data;
}
const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Sequence routing QA',workspaceName:'Isolated sequence fallback'});
const token=owner.accessToken,channel=await api('/channels',token,{type:'web',name:'Sequence routing'});
const node=(id,type,data,edges={})=>({id,type,data,edges,position:{x:0,y:0}});
const graph={startNodeId:'amount',nodes:[
 node('amount','set_variable',{assignments:[{name:'amount',operation:'set',value:'100'}]},{next:'threshold'}),
 node('threshold','condition',{rules:[{id:'higher',conditions:[{source:'variable',key:'amount',operator:'greater_than',value:'{{missing_threshold}}'}]}]},{'rule:higher':'bad',else:'sequence'}),
 node('sequence','sequence',{sequenceId:uuid()},{next:'bad',error:'fallback'}),
 node('bad','message',{text:'MUST-NOT-CLAIM-ENROLLMENT'}),
 node('fallback','message',{text:'Sequence unavailable: contact staff'}),
]};
let flow=await api('/flows',token,{name:'Sequence unavailable fallback',channelIds:[channel.id]});
flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');
const reopened=await api('/flows/'+flow.id,token);
assert.deepEqual(reopened.graph.nodes.find(n=>n.id==='sequence').edges,{next:'bad',error:'fallback'});
await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
const visitor=await api('/widget/'+channel.external_id+'/session',null,{});
const path='/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Start',clientMsgId:uuid()})});assert.ok(r.ok);
let history;
for(let attempt=0;attempt<100;attempt++){
 history=await(await fetch(base+path,{headers:{'x-visitor-token':visitor.token}})).json();
 if(history.messages?.some(m=>m.content?.text==='Sequence unavailable: contact staff'))break;
 await new Promise(resolve=>setTimeout(resolve,50));
}
assert.equal(history.messages.filter(m=>m.content?.text==='Sequence unavailable: contact staff').length,1);
assert.ok(!JSON.stringify(history).includes('MUST-NOT-CLAIM-ENROLLMENT'));
writeFileSync('docs/p0-evidence/sequence-error-runtime.json',JSON.stringify({status:'PASS',checks:['draft save and reopen retain both connectors','published missing sequence triggers actual service failure','exactly one fallback reply','success branch not executed','unresolved numeric threshold takes else rather than fabricated zero'],scope:'isolated API and published Webchat runtime; no provider delivery or sequence worker acceptance'},null,2)+'\n');
console.log('PASS sequence draft/reopen/publish and actual enrollment failure fallback');
