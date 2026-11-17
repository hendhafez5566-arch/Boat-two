// Fault injection is confined to a disposable CI child process; no production fault hooks.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync} from 'node:fs';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),file='/tmp/boat-assignment-crash.json';
if(process.argv.includes('--child')){
 const {DatabaseService}=require('./dist/database/database.service.js'),{AssignmentService}=require('./dist/inbox/assignment.service.js'),{AssignmentRecoveryService}=require('./dist/inbox/assignment-recovery.service.js'),{EventEmitter2}=require('@nestjs/event-emitter'),db=new DatabaseService();
 const f=JSON.parse(readFileSync(file,'utf8')),assignment=new AssignmentService(db,new EventEmitter2());
 if(process.argv.includes('--pause')){
  const original=db.withTenant.bind(db);db.withTenant=(tenant,fn)=>original(tenant,c=>fn({query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.includes('UPDATE conversations SET assigned_to=$2')){process.send('after-uncommitted-assignment');await new Promise(()=>{});}return r;}}));
  await assignment.retryWaiting(f.tenantId);
 }else{const recovery=new AssignmentRecoveryService(db,assignment);for(let i=0;i<6;i++)await recovery.tick();await db.onModuleDestroy();}
}else{
 const {Pool}=require('pg'),admin=new Pool({connectionString:process.env.DATABASE_ADMIN_URL});
 async function api(path,token,body){const r=await fetch('http://localhost:4000'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' '+r.status);return r.json();}
 try{
 const owner=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Crash assignment',workspaceName:'Isolated crash assignment'}),token=owner.accessToken;
 const invite=await api('/team/invitations',token,{email:uuid()+'@example.test',role:'agent',sendEmail:false}),agent=await api('/auth/accept-invitation',null,{token:new URL(invite.inviteUrl).searchParams.get('token'),password:'Synthetic-'+uuid(),fullName:'Recovery staff'}),member=(await api('/crm/workspace/members',agent.accessToken)).currentUserId;
 const channel=await api('/channels',token,{type:'web',name:'Crash recovery'});
 for(let i=0;i<5;i++){const v=await api('/widget/'+channel.external_id+'/session',null,{});assert.ok((await fetch('http://localhost:4000/widget/'+channel.external_id+'/messages?visitorId='+v.visitorId,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':v.token},body:JSON.stringify({text:'Queue fixture '+i,clientMsgId:uuid()})})).ok);}
 const conversations=(await api('/conversations',token)).items,tenantId=conversations[0].tenant_id;
 await admin.query("UPDATE conversations SET handled_by='human',human_since=now() WHERE tenant_id=$1",[tenantId]);
 await admin.query("INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,is_internal) SELECT tenant_id,id,channel_id,'out','system','event','{\"event\":\"assignment_waiting\",\"reason\":\"no_eligible_employee\"}','sent',true FROM conversations WHERE tenant_id=$1",[tenantId]);
 await admin.query('UPDATE memberships SET available=(user_id=$2) WHERE tenant_id=$1',[tenantId,member]);
 await admin.query("UPDATE tenants SET settings=jsonb_set(settings,'{crmAssignment}',$2::jsonb) WHERE id=$1",[tenantId,JSON.stringify({enabled:true,method:'round_robin',memberIds:[member],rules:[],maxOpenPerAgent:100})]);
 writeFileSync(file,JSON.stringify({tenantId}),{mode:0o600});
 const child=fork(new URL(import.meta.url),['--child','--pause'],{stdio:['ignore','inherit','inherit','ipc']});
 const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);const message=await once(child,'message');assert.equal(message[0],'after-uncommitted-assignment');clearTimeout(timeout);
 assert.equal((await admin.query('SELECT count(*)::int n FROM conversations WHERE tenant_id=$1 AND assigned_to IS NOT NULL',[tenantId])).rows[0].n,0,'uncommitted assignment is not externally visible');
 const exited=once(child,'exit');child.kill('SIGKILL');await exited;
 assert.equal((await admin.query("SELECT count(*)::int n FROM messages WHERE tenant_id=$1 AND content->>'event'='assigned'",[tenantId])).rows[0].n,0,'killed transaction has no partial assignment log');
 // Disabled staff must not receive pending conversations during recovery.
 await admin.query('UPDATE users SET disabled_at=now() WHERE id=$1',[member]);
 async function recover(){const p=fork(new URL(import.meta.url),['--child'],{stdio:['ignore','inherit','inherit','ipc']});const [code]=await once(p,'exit');assert.equal(code,0);}
 await recover();assert.equal((await admin.query('SELECT count(*)::int n FROM conversations WHERE tenant_id=$1 AND assigned_to IS NOT NULL',[tenantId])).rows[0].n,0);
 await admin.query('UPDATE users SET disabled_at=NULL WHERE id=$1',[member]);await recover();await recover();
 const rows=(await admin.query('SELECT assigned_to,handled_by FROM conversations WHERE tenant_id=$1',[tenantId])).rows;assert.equal(rows.length,5);assert.ok(rows.every(r=>r.assigned_to===member&&r.handled_by==='human'));
 assert.equal((await admin.query("SELECT count(*)::int n FROM messages WHERE tenant_id=$1 AND content->>'event'='assigned'",[tenantId])).rows[0].n,5,'fresh recovery is idempotent');
 assert.equal((await fetch('http://localhost:4000/conversations/'+conversations[0].id+'/auto-assign',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+agent.accessToken},body:'{}'})).status,403);
 writeFileSync('docs/p0-evidence/assignment-crash-recovery.json',JSON.stringify({status:'PASS',database:'real PostgreSQL CI',checks:['worker killed after actual uncommitted assignment update','rollback preserves queue and audit','fresh process recovers persistent queue','disabled staff excluded','five queued conversations assigned once','human takeover retained','agent cannot force assignment'],faultInjection:'test child process only'},null,2)+'\n');console.log('PASS actual worker kill/rollback/fresh-process assignment recovery');
 }finally{await admin.end();}
}
