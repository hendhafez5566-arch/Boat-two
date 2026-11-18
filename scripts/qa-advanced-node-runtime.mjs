import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000';
export async function api(path,token,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' '+r.status+' '+JSON.stringify(d));return d;}
export async function prepareAdvancedFlow(publish=true){
 const session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Advanced media QA',workspaceName:'Isolated advanced node QA'}),token=session.accessToken,channel=await api('/channels',token,{type:'web',name:'Advanced media'});
 await api('/workspace/onboarding/complete',token,{});
 const files=[];for(const f of JSON.parse(readFileSync(new URL('./fixtures/media-acceptance.json',import.meta.url)))){
  const bytes=Buffer.from(f.base64,'base64'),form=new FormData();form.append('file',new Blob([bytes],{type:f.mime}),f.name);
  const r=await fetch(base+'/uploads',{method:'POST',headers:{authorization:'Bearer '+token},body:form});assert.equal(r.status,201);const file=await r.json();assert.deepEqual(Buffer.from(await (await fetch(file.url)).arrayBuffer()),bytes);files.push(file);
 }
 const n=(id,type,data,edges={})=>({id,type,data,position:{x:0,y:0},edges});
 const graph={startNodeId:files[0].kind,nodes:[...files.map((f,i)=>n(f.kind,f.kind,{url:f.url,filename:f.filename}, {next:files[i+1]?.kind||'loc'})),n('loc','location',{lat:'{{missing_latitude}}',lng:'31'},{next:'http'}),n('http','http_request',{method:'GET',url:'http://127.0.0.1:9/no-request',timeoutMs:1000},{error:'sheet',success:'bad'}),n('sheet','sheet_fetch',{connectionId:uuid(),spreadsheetId:'synthetic',range:'A1:B2',url:''},{error:'done',found:'bad',not_found:'bad'}),n('done','message',{text:'Recovery complete {{http.status}}/{{sheet.found}}'},{next:'end'}),n('bad','message',{text:'MUST-NOT-EXECUTE'},{next:'end'}),n('end','end',{})]};
 let flow=await api('/flows',token,{name:'Advanced media/error execution',channelIds:[channel.id]});flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');if(publish)await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
 return {session,token,channel,flow,files,graph};
}
export async function assertRuntime(f){
 const v=await api('/widget/'+f.channel.external_id+'/session',null,{}),path='/widget/'+f.channel.external_id+'/messages?visitorId='+v.visitorId;
 assert.ok((await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':v.token},body:JSON.stringify({text:'Start advanced',clientMsgId:uuid()})})).ok);
 let history;for(let i=0;i<100;i++){history=await(await fetch(base+path,{headers:{'x-visitor-token':v.token}})).json();if(JSON.stringify(history).includes('Recovery complete'))break;await new Promise(r=>setTimeout(r,100));}
 const json=JSON.stringify(history);assert.ok(!json.includes('\"location\"'),'Unresolved coordinates cannot emit a fabricated location');assert.match(json,/Recovery complete 0\/false/);assert.ok(!json.includes('MUST-NOT-EXECUTE'));for(const file of f.files)assert.ok(json.includes(file.url));return v;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const f=await prepareAdvancedFlow();await assertRuntime(f);const before=await api('/flows/'+f.flow.id+'/versions',f.token);
 const bad=structuredClone(f.graph);bad.nodes.find(n=>n.type==='audio').data.url='https://user:password@example.test/audio.mp3';
 const updated=await api('/flows/'+f.flow.id,f.token,{graph:bad,expectedUpdatedAt:(await api('/flows/'+f.flow.id,f.token)).updated_at},'PATCH');
 const rejected=await fetch(base+'/flows/'+f.flow.id+'/publish',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+f.token},body:JSON.stringify({expectedUpdatedAt:updated.updated_at})});assert.equal(rejected.status,400);
 assert.deepEqual(await api('/flows/'+f.flow.id+'/versions',f.token),before,'Rejected publication cannot create or change versions');await assertRuntime(f);
 writeFileSync('docs/p0-evidence/advanced-node-runtime.json',JSON.stringify({status:'PASS',database:process.env.BOAT_QA_EXISTING_API==='true'?'real PostgreSQL':'local PGlite',checks:['actual four-media upload and byte retrieval','published four-media execution','unresolved location variable skips invented coordinate','blocked loopback HTTP takes error route without egress','missing private sheet account takes error route','unsafe publication denied without version changes','previous publication still executes'],scope:'Media, HTTP SSRF error and missing sheet dependency; no official provider acceptance'},null,2)+'\n');console.log('PASS published media/HTTP/sheet error branches and failed-publish preservation');
}
