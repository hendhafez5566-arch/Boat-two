// Operational tooling only. Never called by application startup or migrations.
import {constants,createReadStream,createWriteStream} from 'node:fs';
import * as fs from 'node:fs/promises';
import {resolve,join,dirname,relative,sep,isAbsolute,basename} from 'node:path';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const MAGIC=Buffer.from('BOAT-ATTACHMENTS-V1\n'),CHUNK=256*1024;
const safeName=n=>typeof n==='string'&&n.length>0&&n!=='.'&&n!=='..'&&!/[\\/\0]/.test(n);
function recordsSorted(records){const names=new Set();return records.map(r=>{if(!safeName(r.name)||names.has(r.name))throw Error('Invalid or duplicate metadata name');names.add(r.name);if(!Number.isSafeInteger(Number(r.size))||Number(r.size)<0)throw Error('Invalid metadata size');return Object.fromEntries(Object.entries({...r,size:Number(r.size),deleted_at:r.deleted_at??null,revoked_at:r.revoked_at??null}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,v instanceof Date?v.toISOString():v]));}).sort((a,b)=>a.name.localeCompare(b.name));}
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function hashFile(path){const h=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await h.stat();if(!before.isFile())throw Error('Non-regular attachment');const hash=createHash('sha256');for await(const bytes of h.createReadStream({autoClose:false}))hash.update(bytes);const after=await h.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw Error('Attachment changed during inventory');return {size:after.size,sha256:hash.digest('hex')};}finally{await h.close();}}
export async function inventory(root,records){
 root=resolve(root);const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Upload root must be a real directory');
 records=recordsSorted(records);const entries=await fs.readdir(root,{withFileTypes:true});if(entries.some(e=>!e.isFile()||!safeName(e.name)))throw Error('Unsafe/symlink/directory entry requires operator review');
 const files=[];for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name)))files.push({name:entry.name,...await hashFile(join(root,entry.name))});
 const byName=new Map(files.map(f=>[f.name,f])),known=new Set(records.map(r=>r.name));const missing=records.filter(r=>!byName.has(r.name)).map(r=>r.name),sizeMismatch=records.filter(r=>byName.has(r.name)&&byName.get(r.name).size!==r.size).map(r=>r.name);
 return {version:1,records,files,missing,sizeMismatch,metadataDigest:digest(records),summary:{recordCount:records.length,fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.size,0),revokedRecords:records.filter(r=>r.revoked_at).length,deletedRecords:records.filter(r=>r.deleted_at).length,missingCount:missing.length,sizeMismatchCount:sizeMismatch.length,orphanCount:files.filter(f=>!known.has(f.name)).length,snapshotComplete:!missing.length&&!sizeMismatch.length,cutoverReady:false}};
}
async function outsideGit(path){let at=await fs.realpath(dirname(resolve(path)));while(true){try{await fs.lstat(join(at,'.git'));throw Error('Protected byte output cannot be inside a Git checkout');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=dirname(at);if(parent===at)break;at=parent;}}
function keyBytes(key){if(!/^[a-fA-F0-9]{64}$/.test(key||''))throw Error('A protected 32-byte hex backup key is required');return Buffer.from(key,'hex');}
async function writeAll(h,buf){let at=0;while(at<buf.length){const r=await h.write(buf,at,buf.length-at);at+=r.bytesWritten;}}
export async function backup(root,records,archive,key,{getRecords=async()=>records,uploadsQuiesced=false}={}){
 if(!uploadsQuiesced)throw Error('Approved upload quiescence must be declared before backup');root=resolve(root);archive=join(await fs.realpath(dirname(resolve(archive))),basename(archive));const rel=relative(await fs.realpath(root),archive);if(!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('Backup cannot be placed inside upload root');
 await outsideGit(archive);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv),snapshot=await inventory(root,records);let out,created=false;
 try{
  out=await fs.open(archive,'wx',0o600);created=true;await writeAll(out,Buffer.concat([MAGIC,iv]));const line=async x=>writeAll(out,cipher.update(Buffer.from(JSON.stringify(x)+'\n')));
  await line({type:'header',version:1,metadataDigest:snapshot.metadataDigest,summary:snapshot.summary});
  for(const record of snapshot.records)await line({type:'record',record});
  for(const file of snapshot.files){
   await line({type:'file',...file});const h=await fs.open(join(root,file.name),constants.O_RDONLY|constants.O_NOFOLLOW),hash=createHash('sha256');let size=0;
   try{if(!(await h.stat()).isFile())throw Error('Non-regular attachment');for await(const bytes of h.createReadStream({autoClose:false,highWaterMark:CHUNK})){size+=bytes.length;hash.update(bytes);await line({type:'chunk',data:bytes.toString('base64')});}}finally{await h.close();}
   if(size!==file.size||hash.digest('hex')!==file.sha256)throw Error('Attachment changed during backup');await line({type:'endFile'});
  }
  const after=await inventory(root,await getRecords());if(JSON.stringify(after)!==JSON.stringify(snapshot))throw Error('Files or lifecycle metadata changed during backup');
  await line({type:'footer',missing:snapshot.missing,sizeMismatch:snapshot.sizeMismatch});await writeAll(out,cipher.final());await writeAll(out,cipher.getAuthTag());await out.sync();await out.close();out=null;
  return {...snapshot.summary,archiveBytes:(await fs.stat(archive)).size,encrypted:true,metadataDigest:snapshot.metadataDigest,consistency:'caller-declared quiescence; metadata and bytes observed stable'};
 }catch(e){if(out)await out.close().catch(()=>{});if(created)await fs.unlink(archive).catch(()=>{});throw e;}
}
export async function restore(archive,destination,key){
 archive=resolve(archive);destination=resolve(destination);await outsideGit(destination);try{await fs.lstat(destination);throw Error('Restore destination must not exist');}catch(e){if(e.code!=='ENOENT')throw e;}
 const work=await fs.mkdtemp(join(dirname(destination),'.boat-restore-'));await fs.chmod(work,0o700);let committed=false;
 try{
  const handle=await fs.open(archive,'r'),stat=await handle.stat(),header=Buffer.alloc(MAGIC.length+12),tag=Buffer.alloc(16);await handle.read(header,0,header.length,0);await handle.read(tag,0,16,stat.size-16);await handle.close();
  if(stat.size<header.length+16||!header.subarray(0,MAGIC.length).equals(MAGIC))throw Error('Invalid backup header');const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),header.subarray(MAGIC.length));decipher.setAuthTag(tag);
  // Authenticate the complete archive before parsing or exposing restored bytes.
  const plain=join(work,'authenticated.jsonl');await pipeline(createReadStream(archive,{start:header.length,end:stat.size-17}),decipher,createWriteStream(plain,{flags:'wx',mode:0o600}));
  const payload=join(work,'files');await fs.mkdir(payload,{mode:0o700});const records=[],files=[],seen=new Set();let meta,footer,current,out,hash,size=0;
  try{for await(const line of createInterface({input:createReadStream(plain),crlfDelay:Infinity})){
   if(line.length>CHUNK*2)throw Error('Oversized backup record');const x=JSON.parse(line);if(footer)throw Error('Data after backup footer');
   if(x.type==='header'){if(meta||x.version!==1)throw Error('Invalid backup manifest');meta=x;}
   else if(x.type==='record'){if(!meta||current||files.length)throw Error('Invalid metadata order');records.push(x.record);}
   else if(x.type==='file'){if(!meta||current||!safeName(x.name)||seen.has(x.name)||!Number.isSafeInteger(x.size)||x.size<0||!/^[a-f0-9]{64}$/.test(x.sha256))throw Error('Invalid backup filename or size');seen.add(x.name);current=x;hash=createHash('sha256');size=0;out=await fs.open(join(payload,x.name),'wx',0o600);}
   else if(x.type==='chunk'){if(!current||typeof x.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(x.data))throw Error('Unexpected backup chunk');const bytes=Buffer.from(x.data,'base64');size+=bytes.length;if(size>current.size)throw Error('Restored size exceeds manifest');hash.update(bytes);await writeAll(out,bytes);}
   else if(x.type==='endFile'){if(!current||size!==current.size||hash.digest('hex')!==current.sha256)throw Error('Restore checksum mismatch');await out.sync();await out.close();out=null;files.push({name:current.name,size,sha256:current.sha256});current=null;}
   else if(x.type==='footer'){if(current||!meta)throw Error('Incomplete backup payload');footer=x;}
   else throw Error('Unknown backup record');
  }}finally{if(out)await out.close();}
  if(!meta||!footer||current||digest(recordsSorted(records))!==meta.metadataDigest)throw Error('Incomplete or changed metadata');
  const checked=await inventory(payload,records);if(JSON.stringify(checked.files)!==JSON.stringify(files)||JSON.stringify(checked.summary)!==JSON.stringify(meta.summary)||JSON.stringify(checked.missing)!==JSON.stringify(footer.missing)||JSON.stringify(checked.sizeMismatch)!==JSON.stringify(footer.sizeMismatch))throw Error('Restore manifest mismatch');
  await fs.mkdir(destination,{mode:0o700});committed=true;await fs.rename(payload,join(destination,'files'));await fs.writeFile(join(destination,'metadata.json'),JSON.stringify({records:checked.records,missing:checked.missing,sizeMismatch:checked.sizeMismatch,metadataDigest:checked.metadataDigest},null,2),{flag:'wx',mode:0o600});
  return {...checked.summary,verified:true,metadataDigest:checked.metadataDigest,databaseModified:false};
 }catch(e){if(committed)await fs.rm(destination,{recursive:true,force:true});throw e;}finally{await fs.rm(work,{recursive:true,force:true});}
}
export async function readRecords(connectionString){
 if(!connectionString)throw Error('Authorized DATABASE_ADMIN_URL is required; app_user cannot inventory all tenants');const {Pool}=createRequire(process.env.BOAT_API_PACKAGE||new URL('../../apps/api/package.json',import.meta.url))('pg'),db=new Pool({connectionString});
 try{const c=await db.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const role=(await c.query('SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname=current_user')).rows[0];if(!role?.allowed)throw Error('Global inventory needs an authorized bypass-RLS read-only session');const rows=(await c.query('SELECT * FROM files ORDER BY name')).rows;await c.query('COMMIT');return recordsSorted(rows);}finally{await c.release();}}finally{await db.end();}
}
async function cli(){const [mode,...args]=process.argv.slice(2),opts=Object.fromEntries(args.reduce((a,v,i)=>i%2?a:[...a,[v.replace(/^--/,''),args[i+1]]],[]));const root=opts.root||process.env.UPLOAD_DIR||'./uploads',key=process.env.BOAT_BACKUP_KEY;
 if(mode==='restore'){console.log(JSON.stringify(await restore(opts.archive,opts.destination,key)));return;}
 const read=()=>readRecords(process.env.DATABASE_ADMIN_URL),records=await read();if(mode==='inventory')console.log(JSON.stringify((await inventory(root,records)).summary));else if(mode==='backup')console.log(JSON.stringify(await backup(root,records,opts.archive,key,{getRecords:read,uploadsQuiesced:process.env.BOAT_UPLOADS_QUIESCED==='true'})));else throw Error('Use inventory, backup or restore');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(()=>{console.error('Attachment operation failed; protected source remains unchanged. Check authorized access, paths, quiescence and archive integrity.');process.exitCode=1;});
