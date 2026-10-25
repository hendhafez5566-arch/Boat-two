// Durable webhook worker + SLA with PostgreSQL and an injected fake HTTP transport.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {DatabaseService}=require('./dist/database/database.service.js'),{CryptoService}=require('./dist/messaging/crypto.service.js'),{IntegrationsService}=require('./dist/integrations/integrations.service.js'),{InboxPolicyService}=require('./dist/inbox/inbox-policy.service.js'),{env}=require('./dist/config/env.js');
if(process.env.BOAT_PREVIEW_ONLY!=='true'||env.EXTERNAL_DELIVERY_ENABLED!=='false')throw Error('Local preview required');
const db=new DatabaseService(),base=process.env.SMOKE_API_URL||'http://localhost:4000';
async function call(path,token,method='GET',body,status=method==='POST'?201:200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(data)}`);return data;}
const register=()=>call('/auth/register',null,'POST',{email:randomUUID()+'@example.test',password:'local-policies-12345',fullName:'Policy owner',workspaceName:'Policy acceptance'});
try{
 const a=await register(),b=await register(),user=JSON.parse(Buffer.from(a.accessToken.split('.')[1],'base64url')).sub,foreignUser=JSON.parse(Buffer.from(b.accessToken.split('.')[1],'base64url')).sub;
 const channel=await call('/channels',a.accessToken,'POST',{type:'web',name:'Mock policies'}),contact=await call('/crm/contacts',a.accessToken,'POST',{name:'Local contact'});
 const department=await call('/departments',a.accessToken,'POST',{name:'SLA team',slaMinutes:1,members:[user]});
 const conversation=await db.withTenant(a.tenantId,async c=>(await c.query("INSERT INTO conversations(tenant_id,channel_id,contact_id,handled_by,department_id,status,last_inbound_at) VALUES($1,$2,$3,'bot',$4,'open',now()-interval '2 minutes') RETURNING *",[a.tenantId,channel.id,contact.id,department.id])).rows[0]);
 const hook=await call('/integrations',a.accessToken,'POST',{provider:'webhook',name:'Mock receiver',credential:'local-signing-key',config:{url:'https://receiver.example.test/event',eventTypes:['conversation.handoff','conversation.updated']}});await call('/integrations/'+hook.id,a.accessToken,'PATCH',{enabled:true});
 await call('/inbox/settings',a.accessToken,'PUT',{sla_escalation_enabled:true,escalation_user_id:user,human_session_minutes:0,signature_enabled:true,signature_template:'— {{agent.name}}'});
 await call('/inbox/settings',a.accessToken,'PUT',{escalation_user_id:foreignUser},400);assert.equal((await call('/inbox/settings',a.accessToken)).escalation_user_id,user);
 await call('/conversations/'+conversation.id+'/takeover',a.accessToken,'POST');
 const policy=new InboxPolicyService(db);await policy.tick();await policy.tick();
 const events=await db.withTenant(a.tenantId,c=>c.query("SELECT content FROM messages WHERE conversation_id=$1 AND content->>'event'='sla_escalated'",[conversation.id]));assert.equal(events.rowCount,1);
 await call('/conversations/'+conversation.id+'/messages',a.accessToken,'POST',{text:'x'.repeat(4096)},400);
 for(let i=0;i<80;i++){const jobs=await call('/integrations/deliveries',a.accessToken);if(jobs.some(j=>j.connection_id===hook.id)){const payloads=await db.withTenant(a.tenantId,c=>c.query('SELECT payload FROM integration_deliveries WHERE connection_id=$1',[hook.id]));if(payloads.rows.some(x=>x.payload.type==='conversation.handoff'))break;}if(i===79)throw Error('Handoff event not durably delivered to webhook queue');await new Promise(r=>setTimeout(r,150));}
 const scoped={withTenant:db.withTenant.bind(db),query:async()=>db.withTenant(a.tenantId,c=>c.query("SELECT id,tenant_id FROM integration_deliveries WHERE connection_id=$1 AND(status='pending' OR(status='sending' AND lease_until<now()))",[hook.id]))};
 let outcome='ok',calls=0;
 const transport=async request=>{calls++;assert.equal(request.url,'https://receiver.example.test/event');assert.equal(request.headers['X-Boat-Signature'],'sha256='+createHmac('sha256','local-signing-key').update(request.body).digest('hex'));assert.equal(request.headers['Idempotency-Key'],request.headers['X-Boat-Event-ID']);if(outcome==='ambiguous')throw Error('Simulated lost response');return{ok:outcome==='ok',status:outcome==='ok'?200:400,body:{},headers:{}};};
 const integrations=new IntegrationsService(scoped,new CryptoService(),transport);env.EXTERNAL_DELIVERY_ENABLED='true';await integrations.tick();const count=calls;await integrations.tick();assert.equal(calls,count);
 const event={id:randomUUID(),tenantId:a.tenantId,type:'conversation.handoff',payload:{conversationId:conversation.id}};await integrations.onEvent(event);await integrations.onEvent(event);assert.equal((await db.withTenant(a.tenantId,c=>c.query('SELECT * FROM integration_deliveries WHERE event_key=$1',[event.id]))).rowCount,1);
 outcome='ambiguous';await integrations.tick();let job=await db.withTenant(a.tenantId,async c=>(await c.query('SELECT * FROM integration_deliveries WHERE event_key=$1',[event.id])).rows[0]);assert.equal(job.status,'ambiguous');const ambiguousCalls=calls;await integrations.tick();assert.equal(calls,ambiguousCalls);await assert.rejects(integrations.retry(a.tenantId,job.id,false),/reconciled/);await integrations.retry(a.tenantId,job.id,true);outcome='ok';await integrations.tick();job=await db.withTenant(a.tenantId,async c=>(await c.query('SELECT * FROM integration_deliveries WHERE id=$1',[job.id])).rows[0]);assert.equal(job.status,'completed');
 console.log('PASS DB policies/integrations: real SLA escalates exactly once, foreign escalation is 400 with rollback, signature overflow is rejected, durable handoff event, HMAC headers, deduplication, ambiguous delivery never replays without reconciliation; all delivery HTTP injected locally.');
}finally{await db.onModuleDestroy();}
