// Only disposable real PostgreSQL: no Railway faults, no provider delivery.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));
assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Pool}=require('pg'),{DatabaseService}=require('./dist/database/database.service.js'),{AssignmentService}=require('./dist/inbox/assignment.service.js'),{AssignmentRecoveryService}=require('./dist/inbox/assignment-recovery.service.js'),{EventEmitter2}=require('@nestjs/event-emitter');
const admin=new Pool({connectionString:process.env.DATABASE_ADMIN_URL}),db=new DatabaseService(),svc=new AssignmentService(db,new EventEmitter2()),worker=new AssignmentRecoveryService(db,svc);
const companies=[];let locked;
async function api(path,token,body){const r=await fetch('http://localhost:4000'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' '+r.status);return r.json();}
try{
 for(let i=0;i<12;i++){
  const s=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Fairness owner',workspaceName:'Isolated fairness '+i}),ch=await api('/channels',s.accessToken,{type:'web',name:'Fairness queue'});
  const member=(await admin.query('SELECT user_id FROM memberships WHERE tenant_id=$1',[s.tenantId])).rows[0].user_id;
  companies.push({tenant:s.tenantId,channel:ch.id,member});
 }
 companies.sort((a,b)=>a.tenant.localeCompare(b.tenant));
 // Policies remain disabled while all queues are seeded. No production test hooks.
 for(let i=0;i<companies.length;i++){
  const f=companies[i];f.size=i===0?105:(i%3)+1;
  for(let j=0;j<f.size;j++){
   const contact=(await admin.query('INSERT INTO contacts(tenant_id,name) VALUES($1,$2) RETURNING id',[f.tenant,'Synthetic fair queue'])).rows[0].id;
   const cv=(await admin.query("INSERT INTO conversations(tenant_id,channel_id,contact_id,handled_by,human_since) VALUES($1,$2,$3,'human',now()) RETURNING id",[f.tenant,f.channel,contact])).rows[0].id;
   await admin.query("INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,is_internal) VALUES($1,$2,$3,'out','system','event','{\"event\":\"assignment_waiting\"}','sent',true)",[f.tenant,cv,f.channel]);
  }
 }
 // Verify keyset bound/order across more tenants than the scanner page size.
 const page=(await db.query('SELECT * FROM assignment_recovery_tenants(NULL,999)')).rows;
 assert.equal(page.length,10);assert.deepEqual(page.map(x=>x.tenant_id),companies.slice(0,10).map(x=>x.tenant));
 const next=(await db.query('SELECT * FROM assignment_recovery_tenants($1,10)',[page.at(-1).tenant_id])).rows;
 assert.deepEqual(next.map(x=>x.tenant_id),companies.slice(10).map(x=>x.tenant));
 for(const f of companies){await admin.query('UPDATE memberships SET available=true WHERE tenant_id=$1',[f.tenant]);await admin.query("UPDATE tenants SET settings=jsonb_set(settings,'{crmAssignment}',$2::jsonb) WHERE id=$1",[f.tenant,JSON.stringify({enabled:true,method:'round_robin',memberIds:[f.member],rules:[],maxOpenPerAgent:500})]);}
 locked=await admin.connect();await locked.query('BEGIN');await locked.query('SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE',[companies[0].tenant]);
 await Promise.race([worker.tick(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Locked tenant blocked other queues')),10000);timer.unref();})]);
 await worker.tick();
 for(const f of companies.slice(1))assert.equal((await admin.query('SELECT count(*)::int n FROM conversations WHERE tenant_id=$1 AND assigned_to=$2',[f.tenant,f.member])).rows[0].n,f.size,'small company cannot starve behind busy large queue');
 assert.equal((await admin.query('SELECT count(*)::int n FROM conversations WHERE tenant_id=$1 AND assigned_to IS NOT NULL',[companies[0].tenant])).rows[0].n,0);
 await locked.query('ROLLBACK');locked.release();locked=null;
 for(let i=0;i<3;i++)await worker.tick();
 const big=companies[0];const n=(await admin.query('SELECT count(*)::int n FROM conversations WHERE tenant_id=$1 AND assigned_to=$2',[big.tenant,big.member])).rows[0].n;assert.equal(n,100,'one tenant pass remains bounded');
 // Concurrent independent worker instances safely finish the final five rows once.
 const other=new AssignmentRecoveryService(db,svc);for(let i=0;i<4;i++)await Promise.all([worker.tick(),other.tick()]);
 for(const f of companies){
  const rows=(await admin.query('SELECT assigned_to,handled_by FROM conversations WHERE tenant_id=$1',[f.tenant])).rows;assert.equal(rows.length,f.size);assert.ok(rows.every(r=>r.assigned_to===f.member&&r.handled_by==='human'));
  assert.equal((await admin.query("SELECT count(*)::int n FROM messages WHERE tenant_id=$1 AND content->>'event'='assigned'",[f.tenant])).rows[0].n,f.size,'exactly one assignment event per conversation');
 }
 writeFileSync('docs/p0-evidence/assignment-fairness.json',JSON.stringify({status:'PASS',database:'real PostgreSQL',companies:12,queueSizes:companies.map(f=>f.size),checks:['10-tenant keyset bound','locked large tenant does not block smaller companies','next scanner page reaches remaining companies','100-conversation drain bound','concurrent independent workers','every queued conversation assigned exactly once','human ownership mode retained'],scope:'Synthetic recovery scheduling fairness, not a weighted commercial priority SLA'},null,2)+'\n');console.log('PASS real PostgreSQL 12-company bounded/locked/concurrent recovery fairness');
}finally{if(locked){await locked.query('ROLLBACK');locked.release();}await db.onModuleDestroy();await admin.end();}
