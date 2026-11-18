import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {inventory,backup,restore} from './attachment-snapshot.mjs';
async function fixture(){const base=await fs.mkdtemp(join(tmpdir(),'boat-snapshot-test-')),root=join(base,'source');await fs.mkdir(root);const records=[];for(const [i,state]of ['active','revoked','deleted'].entries()){const name=String(i).repeat(48)+'.png',bytes=randomBytes(400000+i);await fs.writeFile(join(root,name),bytes);records.push({id:'synthetic-'+i,tenant_id:'synthetic-tenant-'+i,name,size:bytes.length,mime:'image/png',original_name:'Private synthetic name '+i,revoked_at:state==='revoked'?'2026-11-17T00:00:00.000Z':null,deleted_at:state==='deleted'?'2026-11-17T00:00:00.000Z':null});}return {base,root,records,key:randomBytes(32).toString('hex'),archive:join(base,'protected.backup')};}
async function run(fn){const f=await fixture();try{await fn(f);}finally{await fs.rm(f.base,{recursive:true,force:true});}}
test('encrypted backup restores exact bytes and every tenant/lifecycle/metadata field to a new isolated target',()=>run(async f=>{
 const before=await inventory(f.root,f.records),summary=await backup(f.root,f.records,f.archive,f.key,{uploadsQuiesced:true});assert.equal(summary.snapshotComplete,true);assert.equal(summary.cutoverReady,false);assert.ok((await fs.stat(f.archive)).mode%512===384);const raw=await fs.readFile(f.archive);assert.ok(!raw.includes(Buffer.from('Private synthetic name')));assert.ok(!raw.includes(Buffer.from(f.records[0].name)));
 const destination=join(f.base,'restored'),result=await restore(f.archive,destination,f.key);assert.equal(result.verified,true);assert.equal(result.databaseModified,false);assert.equal(result.metadataDigest,before.metadataDigest);const metadata=JSON.parse(await fs.readFile(join(destination,'metadata.json')));assert.deepEqual(metadata.records,before.records);assert.deepEqual((await inventory(join(destination,'files'),metadata.records)).files,before.files);assert.deepEqual((await inventory(f.root,f.records)).files,before.files);
}));
test('missing historical bytes and size mismatches remain explicit; orphan bytes are retained',()=>run(async f=>{
 await fs.unlink(join(f.root,f.records[0].name));f.records[1].size++;await fs.writeFile(join(f.root,'orphan.bin'),'orphan bytes');const before=await inventory(f.root,f.records);assert.equal(before.summary.missingCount,1);assert.equal(before.summary.sizeMismatchCount,1);assert.equal(before.summary.orphanCount,1);assert.equal(before.summary.snapshotComplete,false);await backup(f.root,f.records,f.archive,f.key,{uploadsQuiesced:true});const d=join(f.base,'restored');const result=await restore(f.archive,d,f.key);assert.equal(result.snapshotComplete,false);assert.equal(result.cutoverReady,false);assert.equal(await fs.readFile(join(d,'files','orphan.bin'),'utf8'),'orphan bytes');assert.deepEqual(JSON.parse(await fs.readFile(join(d,'metadata.json'))).missing,before.missing);
}));
test('wrong key, tamper and truncation fail authentication without exposing restored files',()=>run(async f=>{
 await backup(f.root,f.records,f.archive,f.key,{uploadsQuiesced:true});const bytes=await fs.readFile(f.archive);await assert.rejects(restore(f.archive,join(f.base,'bad-key'),randomBytes(32).toString('hex')));const altered=Buffer.from(bytes);altered[100]^=1;await fs.writeFile(join(f.base,'tampered'),altered);await assert.rejects(restore(join(f.base,'tampered'),join(f.base,'bad-tag'),f.key));await fs.writeFile(join(f.base,'truncated'),bytes.subarray(0,-20));await assert.rejects(restore(join(f.base,'truncated'),join(f.base,'short'),f.key));assert.equal((await fs.readdir(f.base)).filter(n=>n.startsWith('.boat-restore-')||['bad-key','bad-tag','short'].includes(n)).length,0);
}));
test('backup and restore never overwrite existing output or source directories',()=>run(async f=>{
 await fs.writeFile(f.archive,'existing');await assert.rejects(backup(f.root,f.records,f.archive,f.key,{uploadsQuiesced:true}));assert.equal(await fs.readFile(f.archive,'utf8'),'existing');await assert.rejects(restore(f.archive,f.root,f.key));await assert.rejects(backup(f.root,f.records,join(f.root,'..not-outside'),f.key,{uploadsQuiesced:true}));
}));
test('changed lifecycle state aborts backup and removes only newly created partial output',()=>run(async f=>{
 await assert.rejects(backup(f.root,f.records,f.archive,f.key,{uploadsQuiesced:true,getRecords:async()=>f.records.map((r,i)=>i? r:{...r,revoked_at:'2026-11-18T00:00:00Z'})}));await assert.rejects(fs.access(f.archive));assert.equal(f.records[0].revoked_at,null);
}));
test('symlinks, traversal records, duplicate records and unapproved quiescence are refused',()=>run(async f=>{
 await assert.rejects(backup(f.root,f.records,f.archive,f.key));await assert.rejects(inventory(f.root,[{...f.records[0],name:'../escape'}]));await assert.rejects(inventory(f.root,[...f.records,f.records[0]]));await fs.symlink('/etc/passwd',join(f.root,'linked'));await assert.rejects(inventory(f.root,f.records));
}));
