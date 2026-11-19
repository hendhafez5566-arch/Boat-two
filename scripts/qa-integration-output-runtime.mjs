import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000';
async function api(path,token,body,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.ok(response.ok,path+' '+response.status+' '+JSON.stringify(data));return data;
}
const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Integration output QA',workspaceName:'Isolated integration outputs'}),token=owner.accessToken;
const channel=await api('/channels',token,{type:'web',name:'Integration output fallback'});
const node=(id,type,data,edges={})=>({id,type,data,edges,position:{x:0,y:0}});
const graph={startNodeId:'seed',nodes:[
 node('seed','set_variable',{assignments:[{name:'api_price',operation:'set',value:'OLD_API_PRICE'},{name:'sheet_price',operation:'set',value:'OLD_SHEET_PRICE'}]},{next:'http'}),
 node('http','http_request',{method:'GET',url:'http://127.0.0.1:9/blocked',saveAs:[{path:'price',variable:'api_price'}]},{success:'bad',error:'sheet'}),
 node('sheet','sheet_fetch',{connectionId:uuid(),spreadsheetId:'synthetic',range:'A:B',url:'',saveAs:[{column:'price',variable:'sheet_price'}]},{found:'bad',not_found:'check',error:'check'}),
 node('check','condition',{rules:[{id:'stale',match:'any',conditions:[{source:'variable',key:'api_price',operator:'is_set'},{source:'variable',key:'sheet_price',operator:'is_set'}]}]},{'rule:stale':'bad',else:'done'}),
 node('done','message',{text:'Integration fallback contains no stale outputs {{http.ok}}/{{sheet.found}}'}),
 node('bad','message',{text:'MUST-NOT-USE-STALE-PRICE'}),
]};
let flow=await api('/flows',token,{name:'Integration output isolation',channelIds:[channel.id]});
flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');
assert.deepEqual((await api('/flows/'+flow.id,token)).draft_graph.nodes.find(n=>n.id==='http').data.saveAs,graph.nodes.find(n=>n.id==='http').data.saveAs);
await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
const visitor=await api('/widget/'+channel.external_id+'/session',null,{}),path='/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId;
const clientMsgId=uuid();async function send(){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Start',clientMsgId})});assert.ok(r.ok);return r.json();}
await send();let history;
for(let n=0;n<100;n++){
 history=await(await fetch(base+path,{headers:{'x-visitor-token':visitor.token}})).json();
 if(JSON.stringify(history).includes('Integration fallback contains no stale outputs'))break;
 await new Promise(resolve=>setTimeout(resolve,50));
}
assert.equal(history.messages.filter(m=>m.content?.text==='Integration fallback contains no stale outputs false/false').length,1);
assert.ok(!JSON.stringify(history).includes('MUST-NOT-USE-STALE-PRICE'));
assert.equal((await send()).duplicate,true);
const after=await(await fetch(base+path,{headers:{'x-visitor-token':visitor.token}})).json();assert.equal(after.messages.length,history.messages.length);
writeFileSync('docs/p0-evidence/integration-output-runtime.json',JSON.stringify({status:'PASS',checks:['save and reopen output mappings','published failed HTTP and missing sheet account','condition observes both stale outputs cleared','fallback executes exactly once','duplicate visitor message does not repeat execution'],scope:'isolated published API runtime, no external egress'},null,2)+'\n');
console.log('PASS published integration failures clear stale mapped outputs and deduplicate fallback');
