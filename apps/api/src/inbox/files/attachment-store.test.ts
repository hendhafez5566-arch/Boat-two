import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
Object.assign(process.env,{DATABASE_URL:'postgres://app:synthetic@localhost/isolated',REDIS_URL:'redis://localhost:6379',JWT_SECRET:'synthetic-storage-test-secret-at-least-32',ENCRYPTION_KEY:'0'.repeat(64)});
const drivers=import('./attachment-store');
const name='a'.repeat(48)+'.png';
test('filesystem bytes survive a new store instance; exclusive write and path/size/symlink boundaries',async()=>{
 const {FilesystemAttachmentStore,AttachmentMissing}=await drivers;
 const root=await mkdtemp(join(tmpdir(),'boat-store-'));
 try{
  const first=new FilesystemAttachmentStore(root),bytes=Buffer.from('synthetic private bytes');
  await first.put(name,bytes);const next=new FilesystemAttachmentStore(root);
  assert.deepEqual(await next.get(name),bytes);assert.equal(await next.has(name),true);
  await assert.rejects(first.put(name,Buffer.from('overwrite')));
  await assert.rejects(next.get('../secret'));
  await assert.rejects(first.put('b'.repeat(48)+'.png',Buffer.alloc(10*1024*1024+1)));
  await next.removeOrphan(name);assert.equal(await first.has(name),false);await assert.rejects(first.get(name),AttachmentMissing);
  await writeFile(join(root,'private'),'not served');await symlink(join(root,'private'),join(root,name));await assert.rejects(first.get(name));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('object storage refuses insecure/credential/query/path endpoints and traversal prefixes',async()=>{
 const {S3AttachmentStore}=await drivers;
 const options={endpoint:'https://s3.example.test',bucket:'private-files',region:'us-east-1',accessKey:'synthetic',secretKey:'synthetic'};
 for(const endpoint of ['http://s3.example.test','https://user:pass@s3.example.test','https://s3.example.test?secret=x','https://s3.example.test/path'])assert.throws(()=>new S3AttachmentStore({...options,endpoint}));
 assert.throws(()=>new S3AttachmentStore({...options,prefix:'../'}));
 assert.doesNotThrow(()=>new S3AttachmentStore({...options,prefix:'attachments/'}));
});
