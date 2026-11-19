// Deterministic disposable PostgreSQL contention; no external messages or retries.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
for(const k of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[k]).hostname));
assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {Pool}=require('pg'),admin=new Pool({connectionString:process.env.DATABASE_ADMIN_URL});
async function api(path,token,body){const r=await fetch('http://localhost:4000'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' HTTP '+r.status);return r.json();}
let pending;
try{
 const session=await api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Lock ordering QA',workspaceName:'Isolated lock ordering'}),tid=session.tenantId;
 const channel=await api('/channels',session.accessToken,{type:'web',name:'No external delivery'}),contact=(await admin.query("INSERT INTO contacts(tenant_id,name) VALUES($1,'Synthetic lock contact') RETURNING id",[tid])).rows[0].id;
 const cv=(await admin.query('INSERT INTO conversations(tenant_id,channel_id,contact_id) VALUES($1,$2,$3) RETURNING id',[tid,channel.id,contact])).rows[0].id;
 const worker=await admin.connect(),text='Exactly one reply '+uuid();
 try{
  await worker.query('BEGIN');await worker.query("SET LOCAL lock_timeout='3s'");
  const pid=(await worker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await worker.query('SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE',[tid]);
  pending=fetch('http://localhost:4000/conversations/'+cv+'/messages',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+session.accessToken},body:JSON.stringify({text}),signal:AbortSignal.timeout(12000)});
  let blocked=false;
  for(let i=0;i<100;i++){
   blocked=!!(await admin.query("SELECT 1 FROM pg_stat_activity WHERE state='active' AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%FROM tenants FOR NO KEY UPDATE%'",[pid])).rowCount;
   if(blocked)break;await new Promise(r=>setTimeout(r,25));
  }
  assert.ok(blocked,'actual agent request must be waiting for the controlled tenant lock');
  // Models the assignment/policy worker's next lock. An inverted agent order
  // would already hold this row and form a deadlock cycle here.
  await worker.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[cv]);
  await worker.query('COMMIT');
 }catch(e){await worker.query('ROLLBACK');throw e;}finally{worker.release();}
 const response=await pending;assert.equal(response.status,201,'reply completes once after the worker commits');await response.json();
 assert.equal((await admin.query("SELECT count(*)::int n FROM messages WHERE conversation_id=$1 AND direction='out' AND sender_type='agent' AND content->>'text'=$2",[cv,text])).rows[0].n,1);
 mkdirSync('docs/p0-evidence/conversation-lock-order',{recursive:true});writeFileSync('docs/p0-evidence/conversation-lock-order/results.json',JSON.stringify({status:'PASS',database:'real PostgreSQL',checks:['observed real HTTP request waiting on controlled tenant lock','worker can lock conversation without a deadlock cycle','one HTTP201 after commit and exactly one outbound row','no automatic request replay'],scope:'Deterministic lock-order regression, not Production capacity or provider transport'},null,2)+'\n');console.log('PASS actual PostgreSQL worker versus agent-reply lock ordering');
}finally{if(pending)await pending.catch(()=>undefined);await admin.end();}
