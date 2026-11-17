import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
for(const key of ['DATABASE_URL','DATABASE_ADMIN_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[key]).hostname));
assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));const {Pool}=require('pg');
const db=new Pool({connectionString:process.env.DATABASE_ADMIN_URL});
const {fixtures,companies}=JSON.parse(readFileSync('/tmp/boat-p1-recovery.json','utf8'));
async function api(path,token,body){const r=await fetch('http://localhost:4000'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' HTTP'+r.status);return r.json();}
try{for(let company=0;company<2;company++){
 const token=companies[company].accessToken,cv=(await api('/conversations',token)).items[0];
 await api('/conversations/'+cv.id+'/takeover',token,{});
 await api('/conversations/'+cv.id+'/notes',token,{text:'Internal note is not a reply'});
 await api('/conversations/'+cv.id+'/messages',token,{text:'Synthetic measured human reply'});
 const first=(await db.query("SELECT id FROM messages WHERE conversation_id=$1 AND direction='in' ORDER BY created_at,seq LIMIT 1",[cv.id])).rows[0];
 const start=new Date(Date.now()-3600000),delay=company===0?120000:30000;
 await db.query('UPDATE messages SET created_at=$2 WHERE id=$1',[first.id,start]);
 await db.query("UPDATE messages SET created_at=$2 WHERE conversation_id=$1 AND sender_type='agent' AND NOT is_internal",[cv.id,new Date(start.getTime()+delay)]);
 await db.query("UPDATE messages SET created_at=$2 WHERE conversation_id=$1 AND is_internal",[cv.id,new Date(start.getTime()+1000)]);
 const query='?from='+encodeURIComponent(new Date(start.getTime()-60000).toISOString())+'&to='+encodeURIComponent(new Date(Date.now()+3600000).toISOString());
 const report=await api('/reports'+query,token);assert.deepEqual(report.firstResponse,{answered:1,unanswered:1,average_ms:delay});
 const empty=await api('/reports?from=2000-01-01T00:00:00.000Z&to=2000-01-02T00:00:00.000Z',token);
 assert.deepEqual(empty.firstResponse,{answered:0,unanswered:0,average_ms:null});
}
writeFileSync('docs/p0-evidence/report-response-postgres.json',JSON.stringify({status:'PASS',database:'isolated real PostgreSQL',checks:['known 120-second and 30-second first human replies','tenant isolation','internal notes excluded','unanswered conversations excluded from average','empty averages remain null']},null,2)+'\n');console.log('PASS real PostgreSQL measured response reports');
}finally{await db.end();}
