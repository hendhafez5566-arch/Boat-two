import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));const {Pool}=require('pg'),db=new Pool({connectionString:process.env.DATABASE_ADMIN_URL}),file='/tmp/boat-delay-restart.json';
async function api(path,token,body,method=body?'POST':'GET'){const r=await fetch('http://localhost:4000'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,path+' HTTP'+r.status+' '+JSON.stringify(d));return d;}
async function until(fn,test){for(let i=0;i<150;i++){const v=await fn();if(test(v))return v;await new Promise(r=>setTimeout(r,100));}throw new Error('Delayed flow restart timed out');}
try{if(process.argv.includes('--prepare')){
 const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Delay restart',workspaceName:'Isolated delay restart'}),token=owner.accessToken;
 const ch=await api('/channels',token,{type:'web',name:'Delay restart'});let flow=await api('/flows',token,{name:'Frozen version recovery',channelIds:[ch.id]});
 const graph={startNodeId:'before',nodes:[{id:'before',type:'message',data:{text:'Before restart'},edges:{next:'delay'}},{id:'delay',type:'delay',data:{amount:1,unit:'hours'},edges:{next:'after'}},{id:'after',type:'message',data:{text:'ORIGINAL VERSION AFTER RESTART'},edges:{next:'end'}},{id:'end',type:'end',data:{},edges:{}}]};
 flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
 const visitor=await api('/widget/'+ch.external_id+'/session',null,{});const route='/widget/'+ch.external_id+'/messages?visitorId='+visitor.visitorId;
 const r=await fetch('http://localhost:4000'+route,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Start',clientMsgId:uuid()})});assert.ok(r.ok);
 const cv=await until(async()=>(await api('/conversations',token)).items[0],v=>v?.id);
 const pending=await until(async()=>(await db.query("SELECT * FROM flow_sessions WHERE conversation_id=$1 AND status='waiting' AND wait_kind='delay'",[cv.id])).rows[0],v=>v?.id);
 flow=await api('/flows/'+flow.id,token);graph.nodes.find(n=>n.id==='after').data.text='NEW VERSION MUST NOT REPLACE PENDING';flow=await api('/flows/'+flow.id,token,{graph,expectedUpdatedAt:flow.updated_at},'PATCH');await api('/flows/'+flow.id+'/publish',token,{expectedUpdatedAt:flow.updated_at});
 assert.notEqual((await api('/flows/'+flow.id,token)).published_version_id,pending.version_id);
 writeFileSync(file,JSON.stringify({sessionId:pending.id,versionId:pending.version_id,conversationId:cv.id,route,visitor}),{mode:0o600});console.log('PASS pending immutable flow prepared before actual process restart');
}else{
 const f=JSON.parse(readFileSync(file,'utf8'));
 // Advance only this isolated test session's clock after the API process has been replaced.
 await db.query("UPDATE flow_sessions SET wait_until=now()-interval '1 second' WHERE id=$1",[f.sessionId]);
 const completed=await until(async()=>(await db.query('SELECT * FROM flow_sessions WHERE id=$1',[f.sessionId])).rows[0],v=>v?.status==='completed');assert.equal(completed.version_id,f.versionId);
 const history=await (await fetch('http://localhost:4000'+f.route,{headers:{'x-visitor-token':f.visitor.token}})).json();assert.ok(JSON.stringify(history).includes('ORIGINAL VERSION AFTER RESTART'));assert.ok(!JSON.stringify(history).includes('NEW VERSION MUST NOT REPLACE PENDING'));
 const count=(await db.query("SELECT count(*)::int n FROM messages WHERE conversation_id=$1 AND content->>'text'='ORIGINAL VERSION AFTER RESTART'",[f.conversationId])).rows[0].n;assert.equal(count,1);
 writeFileSync('docs/p0-evidence/delay-restart-postgres.json',JSON.stringify({status:'PASS',database:'isolated PostgreSQL',checks:['persisted delayed session','republish creates different active version','actual API process replacement','waiting session resumes original immutable version','single resumed client reply']},null,2)+'\n');console.log('PASS delayed flow resumes original version after actual restart');
}}finally{await db.end();}
