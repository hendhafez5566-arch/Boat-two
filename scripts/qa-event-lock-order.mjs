// Run before the API process starts: use the actual worker and unprivileged DB service.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));
assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Pool}=require('pg'),{DatabaseService}=require('./dist/database/database.service.js'),{EventsService}=require('./dist/events/events.service.js'),{EventEmitter2}=require('@nestjs/event-emitter');
const admin=new Pool({connectionString:process.env.DATABASE_ADMIN_URL}),db=new DatabaseService(),emitter=new EventEmitter2(),worker=new EventsService(db,emitter);
let tick;const request=await admin.connect();
try{
 const tenant=(await admin.query('INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING id',['Synthetic event lock',uuid()])).rows[0].id,aggregate=uuid();
 const event=(await admin.query("INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES($1,'qa.tenant-lock',$2,'{}',$3) RETURNING id",[tenant,aggregate,uuid()])).rows[0].id;
 let delivered=0;
 emitter.on('qa.tenant-lock',async()=>{
  await db.withTenant(tenant,c=>c.query('SELECT id FROM tenants FOR NO KEY UPDATE'));
  delivered++;
 });
 await request.query('BEGIN');await request.query("SET LOCAL lock_timeout='3s'");
 const pid=(await request.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 await request.query('SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE',[tenant]);
 tick=worker.tick();
 let blocked=false;
 for(let i=0;i<100;i++){
  blocked=!!(await admin.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%FROM tenants FOR NO KEY UPDATE%'",[pid])).rowCount;
  if(blocked)break;await new Promise(resolve=>setTimeout(resolve,25));
 }
 assert.ok(blocked,'actual event worker must wait on the held tenant lock');
 // The worker must not hold the aggregate advisory lock while waiting for tenant.
 await request.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[aggregate]);
 await request.query('COMMIT');await tick;
 assert.equal(delivered,1);
 const row=(await admin.query('SELECT status,attempts,error FROM domain_events WHERE id=$1',[event])).rows[0];
 assert.equal(row.status,'completed');assert.equal(row.attempts,0);assert.equal(row.error,null);
 await worker.tick();assert.equal(delivered,1,'completed event cannot repeat');
 writeFileSync('docs/p0-evidence/event-lock-order.json',JSON.stringify({status:'PASS',checks:['actual worker observed waiting on tenant','concurrent transaction can acquire aggregate advisory lock without a cycle','event listener runs once and row completes without retry','second tick cannot repeat completed event'],scope:'real disposable PostgreSQL, unprivileged app role; no API process or external provider'},null,2)+'\n');
 console.log('PASS actual event-worker tenant-first lock contention and no replay');
}catch(error){await request.query('ROLLBACK');if(tick)await tick;throw error;}
finally{request.release();await db.onModuleDestroy();await admin.end();}
