// Real HTTP/DB/storage acceptance on disposable Compose only. No Railway/customer access.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
const mode=process.argv[2],state='/tmp/boat-portable-storage-state.json',base='http://localhost:4000';
if(process.env.BOAT_PORTABLE_ACCEPTANCE!=='true')throw Error('Disposable portable acceptance opt-in required');
async function call(path,token,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,path+' '+r.status);return r.json();
}
const hash=b=>createHash('sha256').update(b).digest('hex');
if(mode==='seed'){
 const register=()=>call('/auth/register',null,{email:randomUUID()+'@example.test',password:'Synthetic-'+randomUUID(),fullName:'Portable storage QA',workspaceName:'Disposable portable storage'});
 const owner=await register(),foreign=await register(),bytes=Buffer.from('Synthetic portable attachment '+randomBytes(32).toString('hex')),files=[];
 for(const status of ['active','revoked','deleted']){
  const form=new FormData();form.append('file',new Blob([bytes],{type:'text/plain'}),'synthetic.txt');const r=await fetch(base+'/uploads',{method:'POST',headers:{authorization:'Bearer '+owner.accessToken},body:form});assert.equal(r.status,201);const file=await r.json();
  if(status==='revoked')await call('/uploads/'+file.name+'/revoke',owner.accessToken,{confirm:true});
  if(status==='deleted')await call('/uploads/'+file.name,owner.accessToken,null,'DELETE');
  files.push({...file,status});
 }
 writeFileSync(state,JSON.stringify({owner,foreign,files,hash:hash(bytes)}),{mode:0o600});console.log('PASS portable synthetic files seeded; credentials remain private');
}else if(mode==='verify'){
 const {owner,foreign,files,hash:expected}=JSON.parse(readFileSync(state));
 for(const file of files){
  const pub=await fetch(file.url);assert.equal(pub.status,file.status==='active'?200:404);if(pub.ok){assert.equal(hash(Buffer.from(await pub.arrayBuffer())),expected);assert.match(pub.headers.get('cache-control'),/no-store/);}
  assert.equal((await fetch(base+'/uploads/'+file.name+'/content',{headers:{authorization:'Bearer '+foreign.accessToken}})).status,404);
  const meta=await call('/uploads/'+file.name,owner.accessToken);assert.equal(Boolean(meta.revoked_at),file.status==='revoked');assert.equal(Boolean(meta.deleted_at),file.status==='deleted');
 }
 const revoked=files.find(f=>f.status==='revoked');await call('/uploads/'+revoked.name+'/restore',owner.accessToken,{});const r=await fetch(revoked.url);assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),expected);
 mkdirSync('docs/p0-evidence/portable',{recursive:true});writeFileSync('docs/p0-evidence/portable/storage-'+(process.env.BOAT_STORAGE_CASE||'filesystem')+'.json',JSON.stringify({status:'PASS',scope:'Disposable Docker Compose, real PostgreSQL/Redis/API/Web',checks:['bytes survive API container replacement','revoked and deleted states persist','revoked/deleted public URLs denied','foreign tenant download denied','authorized restoration retains exact bytes','no-store headers retained'],notClaimed:['live customer migration','production acceptance','official cloud storage account']},null,2)+'\n');console.log('PASS portable restart bytes/lifecycle/isolation');
}else throw Error('Use seed or verify');
