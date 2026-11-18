import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
if(process.env.BOAT_PORTABLE_ACCEPTANCE!=='true')throw Error('Disposable acceptance opt-in required');
const s3=process.env.BOAT_STORAGE_CASE==='s3',args=['compose','--env-file','deploy/portable/.env','-f','deploy/portable/compose.yml',...(s3?['-f','deploy/portable/compose.s3-test.yml']:[])];
const env=Object.fromEntries(readFileSync('deploy/portable/.env','utf8').trim().split('\n').map(l=>l.split('=')));
const compose=(...a)=>execFileSync('docker',[...args,...a],{maxBuffer:32*1024*1024,encoding:'utf8'});
const node=(...a)=>execFileSync('node',a,{env:process.env,stdio:'inherit'});
async function ready(){for(let i=0;i<180;i++){try{const r=await fetch('http://localhost:4000/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Portable API did not recover');}
await ready();
if(s3){
 const js="const {S3Client,CreateBucketCommand}=require('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});(async()=>{for(let i=0;i<60;i++){try{await c.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET}));return;}catch(e){if(e.name==='BucketAlreadyOwnedByYou')return;if(i===59)throw e;await new Promise(r=>setTimeout(r,500));}}})().catch(()=>process.exit(1));";
 compose('exec','-T','api','node','-e',js);
}
node('scripts/qa-portable-storage.mjs','seed');
const privateDir=mkdtempSync(join(tmpdir(),'boat-portable-backup-'));chmodSync(privateDir,0o700);
if(!s3){
 const key=randomBytes(32).toString('hex'),admin='postgres://postgres:'+env.POSTGRES_PASSWORD+'@postgres:5432/boat';
 const summary=JSON.parse(compose('exec','-T','-e','DATABASE_ADMIN_URL='+admin,'-e','BOAT_BACKUP_KEY='+key,'-e','BOAT_UPLOADS_QUIESCED=true','api','node','/app/scripts/storage/attachment-snapshot.mjs','backup','--root','/data/uploads','--archive','/tmp/attachments.backup'));
 assert.equal(summary.snapshotComplete,true);assert.equal(summary.cutoverReady,false);
 compose('cp','api:/tmp/attachments.backup',join(privateDir,'attachments.backup'));
 const restored=execFileSync('node',['scripts/storage/attachment-snapshot.mjs','restore','--archive',join(privateDir,'attachments.backup'),'--destination',join(privateDir,'restored')],{encoding:'utf8',env:{...process.env,BOAT_BACKUP_KEY:key}});assert.equal(JSON.parse(restored).verified,true);
 // The job is isolated and has no writers during this synthetic backup. No live upload freeze is inferred.
 const dump=execFileSync('docker',[...args,'exec','-T','postgres','pg_dump','-U','postgres','-d','boat','-Fc','--no-owner']);writeFileSync(join(privateDir,'database.dump'),dump,{mode:0o600});
 compose('exec','-T','postgres','createdb','-U','postgres','boat_restore');
 execFileSync('docker',[...args,'exec','-T','postgres','pg_restore','-U','postgres','-d','boat_restore','--no-owner','--exit-on-error'],{input:dump});
 const counts=db=>compose('exec','-T','postgres','psql','-U','postgres','-d',db,'-Atc',"SELECT json_agg(x ORDER BY name)::text FROM (SELECT name,size,deleted_at,revoked_at FROM files) x").trim();assert.equal(counts('boat_restore'),counts('boat'));
 mkdirSync('docs/p0-evidence/portable',{recursive:true});writeFileSync('docs/p0-evidence/portable/backup.json',JSON.stringify({status:'PASS',scope:'Synthetic independent Docker stack only',checks:['encrypted byte snapshot and isolated authenticated restore','full byte and lifecycle manifest verification','real pg_dump/pg_restore clone retains exact file lifecycle rows'],customerBackup:false},null,2)+'\n');
}
// Replace actual application container, then database/cache containers, retaining their named volumes.
compose('up','-d','--no-deps','--force-recreate','api');await ready();
compose('up','-d','--no-deps','--force-recreate','postgres','redis');await ready();
node('scripts/qa-portable-storage.mjs','verify');
console.log('PASS independent '+(s3?'S3-compatible':'filesystem')+' stack replacement and persistence');
