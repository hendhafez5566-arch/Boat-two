// Disposable real PostgreSQL acceptance only: no Railway, customer or provider access.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));
assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Pool}=require('pg'),{DatabaseService}=require('./dist/database/database.service.js'),{InboxPolicyService}=require('./dist/inbox/inbox-policy.service.js'),{NotificationsService}=require('./dist/business/notifications.service.js');
const adminDb=new Pool({connectionString:process.env.DATABASE_ADMIN_URL}),db=new DatabaseService();
async function request(path,token,body,method=body?'POST':'GET',expected=method==='POST'?201:200){
 const r=await fetch('http://localhost:4000'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(data));return data;
}
const register=()=>request('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'SLA owner',workspaceName:'Isolated SLA roles'});
try {
 const owner=await register(),foreign=await register(),tenant=owner.tenantId;
 const ownerId=(await adminDb.query("SELECT user_id FROM memberships WHERE tenant_id=$1 AND role='owner'",[tenant])).rows[0].user_id;
 async function member(role,name){const i=await request('/team/invitations',owner.accessToken,{email:uuid()+'@example.test',role,sendEmail:false});const session=await request('/auth/accept-invitation',null,{token:new URL(i.inviteUrl).searchParams.get('token'),fullName:name,password:'Synthetic-'+uuid()});const id=(await adminDb.query('SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 AND u.full_name=$2',[tenant,name])).rows[0].id;return {...session,id};}
 const manager=await member('admin','SLA admin'),target=await member('agent','Escalation agent'),previous=await member('agent','Previous agent'),disabled=await member('admin','Disabled SLA admin');
 await adminDb.query('UPDATE users SET disabled_at=now() WHERE id=$1',[disabled.id]);
 const foreignId=(await adminDb.query("SELECT user_id FROM memberships WHERE tenant_id=$1 AND role='owner'",[foreign.tenantId])).rows[0].user_id;
 const channel=await request('/channels',owner.accessToken,{type:'web',name:'SLA matrix'}),department=(await adminDb.query("INSERT INTO departments(tenant_id,name,sla_minutes) VALUES($1,'One minute SLA',1) RETURNING id",[tenant])).rows[0].id;
 await request('/inbox/settings',owner.accessToken,{human_session_minutes:1440,sla_escalation_enabled:true,escalation_user_id:target.id},'PUT');
 await adminDb.query(`UPDATE tenants SET settings=settings||'{"crmNotifications":{"enabled":true,"replyMinutes":1,"targetIds":[]}}'::jsonb WHERE id=$1`,[tenant]);
 async function conversation(status,internal=false,direction='out'){
  const contact=(await adminDb.query("INSERT INTO contacts(tenant_id,name) VALUES($1,'Synthetic SLA contact') RETURNING id",[tenant])).rows[0].id;
  const id=(await adminDb.query("INSERT INTO conversations(tenant_id,channel_id,contact_id,department_id,handled_by,assigned_to,human_since,last_inbound_at,last_message_at) VALUES($1,$2,$3,$4,'human',$5,now(),now()-interval '5 minutes',now()) RETURNING id",[tenant,channel.id,contact,department,previous.id])).rows[0].id;
  await adminDb.query("INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,sender_user_id,type,content,status,is_internal) VALUES($1,$2,$3,$4,'agent',$5,'text','{\"text\":\"Synthetic attempt\"}',$6,$7)",[tenant,id,channel.id,direction,previous.id,status,internal]);return {id,contact};
 }
 const due=[];for(const [status,internal,direction] of [['failed',false,'out'],['queued',false,'out'],['sent',true,'out'],['sent',false,'in']])due.push(await conversation(status,internal,direction));
 const answered=[];for(const status of ['sent','delivered','read'])answered.push(await conversation(status));
 const scanned=(await adminDb.query('SELECT * FROM inbox_policy_due(50)')).rows.map(r=>r.id);
 for(const cv of due)assert.ok(scanned.includes(cv.id));for(const cv of answered)assert.ok(!scanned.includes(cv.id));
 const notifications=new NotificationsService(db);await notifications.refresh(tenant,previous.id);
 for(const cv of due)assert.equal((await adminDb.query("SELECT count(*)::int n FROM crm_notifications WHERE resource_id=$1 AND dedupe_key LIKE 'reply:%'",[cv.id])).rows[0].n,1);
 for(const cv of answered)assert.equal((await adminDb.query('SELECT count(*)::int n FROM crm_notifications WHERE resource_id=$1',[cv.id])).rows[0].n,0);
 const worker=new InboxPolicyService(db);await worker.tick();await new InboxPolicyService(db).tick();
 for(const cv of due){
  const row=(await adminDb.query('SELECT assigned_to,sla_escalated_at FROM conversations WHERE id=$1',[cv.id])).rows[0];assert.equal(row.assigned_to,target.id);assert.ok(row.sla_escalated_at);
  const recipients=(await adminDb.query("SELECT tenant_id,user_id FROM crm_notifications WHERE resource_id=$1 AND dedupe_key LIKE 'sla:%'",[cv.id])).rows;
  assert.deepEqual(new Set(recipients.map(r=>r.user_id)),new Set([ownerId,manager.id,target.id]));assert.ok(recipients.every(r=>r.tenant_id===tenant));
  assert.equal((await adminDb.query("SELECT count(*)::int n FROM messages WHERE conversation_id=$1 AND content->>'event'='sla_escalated'",[cv.id])).rows[0].n,1);
 }
 const cv=due[0];
 for(const id of [disabled.id,foreignId]){
  await request('/conversations/'+cv.id,owner.accessToken,{assignedTo:id},'PATCH',400);
  assert.equal((await adminDb.query('SELECT assigned_to FROM conversations WHERE id=$1',[cv.id])).rows[0].assigned_to,target.id);
  await request('/inbox/settings',owner.accessToken,{escalation_user_id:id},'PUT',400);
 }
 await request('/inbox/settings',previous.accessToken,{sla_escalation_enabled:false},'PUT',403);
 await request('/conversations/'+cv.id,previous.accessToken,{assignedTo:previous.id},'PATCH',409);
 await request('/conversations/'+cv.id,target.accessToken,{assignedTo:previous.id},'PATCH',403);
 await request('/conversations/'+cv.id,manager.accessToken,{assignedTo:previous.id},'PATCH');
 await request('/conversations/'+cv.id,foreign.accessToken,undefined,'GET',404);
 // An old disabled escalation target must not capture conversations or receive alerts.
 await adminDb.query('UPDATE inbox_settings SET escalation_user_id=$2 WHERE tenant_id=$1',[tenant,disabled.id]);
 await request('/inbox/settings',owner.accessToken,{signature_enabled:false},'PUT');
 const stale=await conversation('failed');await worker.tick();
 assert.equal((await adminDb.query('SELECT assigned_to FROM conversations WHERE id=$1',[stale.id])).rows[0].assigned_to,previous.id);
 assert.deepEqual(new Set((await adminDb.query("SELECT user_id FROM crm_notifications WHERE resource_id=$1 AND dedupe_key LIKE 'sla:%'",[stale.id])).rows.map(r=>r.user_id)),new Set([ownerId,manager.id,previous.id]));
 await db.withTenant(tenant,c=>notifications.add(c,tenant,{kind:'new_lead',type:'contact',id:stale.contact,contactId:stale.contact,title:'Synthetic only',key:'disabled:'+uuid(),userId:disabled.id}));
 assert.equal((await adminDb.query('SELECT count(*)::int n FROM crm_notifications WHERE tenant_id=$1 AND user_id=$2',[tenant,disabled.id])).rows[0].n,0);
 mkdirSync('docs/p0-evidence/sla-role-matrix',{recursive:true});writeFileSync('docs/p0-evidence/sla-role-matrix/results.json',JSON.stringify({status:'PASS',database:'real PostgreSQL',roles:['owner','admin','agent'],checks:['failed and queued sends do not suppress SLA or awaiting-reply alerts','internal and inbound events do not count as successful employee replies','sent delivered read suppress escalation','only active tenant managers and current assignee receive SLA alerts','fresh worker deduplicates events and alerts','manual assignment and new escalation target reject disabled or foreign members without mutation','agent assignment restrictions and manager reassignment preserved','stale disabled target falls back to current assignee','generic CRM notifications exclude disabled users'],notClaimed:['full endpoint audit','official provider transport','Production SLA or customer file inventory']},null,2)+'\n');console.log('PASS real PostgreSQL SLA status, recipient and assignment-role matrix');
}finally{await db.onModuleDestroy();await adminDb.end();}
