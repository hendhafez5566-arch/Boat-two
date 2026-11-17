// CI-only real PostgreSQL acceptance. Never opens Railway or provider connections.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));
assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Pool}=require('pg');
const {DatabaseService}=require('./dist/database/database.service.js');
const {InboxPolicyService}=require('./dist/inbox/inbox-policy.service.js');
const fixture=JSON.parse(readFileSync('/tmp/boat-p0-fixture.json','utf8'));
const admin=new Pool({connectionString:process.env.DATABASE_ADMIN_URL});const db=new DatabaseService();
try{
 const cv=(await admin.query('SELECT * FROM conversations WHERE id=$1',[fixture.conversationId])).rows[0];assert.ok(cv);
 const department=randomUUID();
 await admin.query('INSERT INTO departments(id,tenant_id,name,sla_minutes) VALUES($1,$2,$3,1)',[department,cv.tenant_id,'Isolated SLA']);
 await admin.query(`INSERT INTO inbox_settings(tenant_id,sla_escalation_enabled,human_session_minutes) VALUES($1,true,1440) ON CONFLICT(tenant_id) DO UPDATE SET sla_escalation_enabled=true,human_session_minutes=1440`,[cv.tenant_id]);
 await admin.query(`UPDATE messages SET created_at=now()-interval '2 hours' WHERE conversation_id=$1 AND sender_type='agent' AND NOT is_internal`,[cv.id]);
 await admin.query(`UPDATE conversations SET department_id=$2,handled_by='human',human_since=now(),last_inbound_at=now()-interval '5 minutes',sla_escalated_at=NULL WHERE id=$1`,[cv.id,department]);
 assert.ok((await admin.query('SELECT * FROM inbox_policy_due(50)')).rows.some(r=>r.id===cv.id),'Synthetic conversation must be due');
 const emitted=[];await new InboxPolicyService(db,{emit:(...args)=>emitted.push(args)}).tick();
 assert.ok((await admin.query('SELECT sla_escalated_at FROM conversations WHERE id=$1',[cv.id])).rows[0].sla_escalated_at);
 const notifications=(await admin.query(`SELECT * FROM crm_notifications WHERE resource_id=$1 AND kind='awaiting_reply'`,[cv.id])).rows;
 assert.ok(notifications.length>0);assert.ok(notifications.every(n=>n.tenant_id===cv.tenant_id));
 assert.ok(emitted.some(e=>e[1].conversationId===cv.id));
 // A fresh worker instance models loss of all in-memory state after restart.
 await new InboxPolicyService(db).tick();
 assert.equal((await admin.query(`SELECT count(*)::int n FROM crm_notifications WHERE resource_id=$1 AND kind='awaiting_reply'`,[cv.id])).rows[0].n,notifications.length);
 assert.equal((await admin.query(`SELECT count(*)::int n FROM messages WHERE conversation_id=$1 AND content->>'event'='sla_escalated'`,[cv.id])).rows[0].n,1);
 writeFileSync('docs/p0-evidence/policy-recovery-postgres.json',JSON.stringify({database:'PostgreSQL CI',checks:['SLA persisted','durable tenant-scoped internal notifications','event emitted after commit','fresh worker does not duplicate alerts or events'],status:'PASS',externalDelivery:false},null,2)+'\n');
 console.log('PASS real PostgreSQL SLA alerts and fresh-worker recovery');
}finally{await db.onModuleDestroy();await admin.end();}
