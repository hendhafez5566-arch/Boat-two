import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID as uuid,randomBytes,createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readRecords,inventory,backup,restore} from './storage/attachment-snapshot.mjs';
for(const name of ['DATABASE_ADMIN_URL','DATABASE_URL'])assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env[name]).hostname));assert.equal(process.env.EXTERNAL_DELIVERY_ENABLED,'false');
const {Pool}=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg'),db=new Pool({connectionString:process.env.DATABASE_ADMIN_URL}),base=await fs.mkdtemp(join(tmpdir(),'boat-storage-pg-')),root=join(base,'live-synthetic'),key=randomBytes(32).toString('hex');await fs.mkdir(root);
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
try{
 // Two synthetic companies created through the actual auth API; no owner data.
 const owners=[];for(let i=0;i<2;i++){const r=await fetch('http://localhost:4000/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Snapshot fixture',workspaceName:'Isolated snapshot '+i})});assert.equal(r.status,201);owners.push(await r.json());}
 for(let i=0;i<4;i++){const name=randomBytes(24).toString('hex')+'.bin',bytes=randomBytes(300000+i),owner=owners[i%2],user=(await db.query('SELECT user_id FROM memberships WHERE tenant_id=$1',[owner.tenantId])).rows[0].user_id;await fs.writeFile(join(root,name),bytes);await db.query("INSERT INTO files(tenant_id,name,original_name,mime,size,created_by,revoked_at,deleted_at) VALUES($1,$2,'Synthetic private title','application/octet-stream',$3,$4,CASE WHEN $5 THEN now() END,CASE WHEN $6 THEN now() END)",[owner.tenantId,name,bytes.length,user,i===1||i===3,i===2||i===3]);}
 const before=await readRecords(process.env.DATABASE_ADMIN_URL);assert.equal(before.length,4,'focused test database must contain only these fixture records');await assert.rejects(readRecords(process.env.DATABASE_URL),/authorized bypass-RLS/);
 const snapshot=await inventory(root,before);assert.equal(snapshot.summary.revokedRecords,2);assert.equal(snapshot.summary.deletedRecords,2);assert.equal(snapshot.summary.snapshotComplete,true);
 const archive=join(base,'encrypted.backup');await backup(root,before,archive,key,{uploadsQuiesced:true,getRecords:()=>readRecords(process.env.DATABASE_ADMIN_URL)});
 // Separate process: authenticated restore survives replacing the tool process.
 const destination=join(base,'restored'),p=spawnSync(process.execPath,['scripts/storage/attachment-snapshot.mjs','restore','--archive',archive,'--destination',destination],{encoding:'utf8',env:{...process.env,BOAT_BACKUP_KEY:key}});assert.equal(p.status,0,p.stderr);const result=JSON.parse(p.stdout);assert.equal(result.verified,true);assert.equal(result.cutoverReady,false);
 const metadata=JSON.parse(await fs.readFile(join(destination,'metadata.json')));assert.deepEqual(metadata.records,before);assert.deepEqual((await inventory(join(destination,'files'),metadata.records)).files,snapshot.files);assert.equal(digest(await readRecords(process.env.DATABASE_ADMIN_URL)),digest(before),'database metadata remains unchanged');
 const missing=before[0].name;await fs.unlink(join(root,missing));const incomplete=await inventory(root,before);assert.equal(incomplete.summary.missingCount,1);assert.equal(incomplete.summary.snapshotComplete,false);assert.equal(digest(await readRecords(process.env.DATABASE_ADMIN_URL)),digest(before),'missing bytes cannot alter records');
 await fs.writeFile('docs/p0-evidence/storage-snapshot-postgres.json',JSON.stringify({status:'PASS',database:'real isolated PostgreSQL',companies:2,records:4,checks:['global read-only metadata inventory including every state','non-bypass RLS role cannot give a false global inventory','encrypted AES-256-GCM archive','separate process restore','full byte/hash/metadata equality','revoked and deleted flags including overlap retained','no database mutation','missing original bytes separately reported'],limitations:['Synthetic fixtures only; no live customer bytes acquired','Operator-declared quiescence is not an automatic upload freeze','No storage resource or API container replacement tested; cutoverReady remains false']},null,2)+'\n');console.log('PASS actual PostgreSQL protected attachment snapshot and separate-process restoration');
}finally{await db.end();await fs.rm(base,{recursive:true,force:true});}
