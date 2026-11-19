import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertLocalAcceptance} from './acceptance-local.mjs';
assertLocalAcceptance();
const base='http://localhost:4000';
async function call(path,token,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();return {status:r.status,data:text?JSON.parse(text):null};}
async function api(path,token,body,method){const r=await call(path,token,body,method);assert.ok(r.status<300,path+' '+r.status+' '+JSON.stringify(r.data));return r.data;}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1sAAAAASUVORK5CYII=','base64');
async function upload(token,name='Synthetic.png',bytes=png,mime='image/png'){const body=new FormData();body.append('file',new Blob([bytes],{type:mime}),name);return fetch(base+'/uploads',{method:'POST',headers:{authorization:'Bearer '+token},body});}
async function company(){return api('/auth/register',null,{email:uuid()+'@example.test',password:'Synthetic-'+uuid(),fullName:'Attachment QA',workspaceName:'Isolated attachment QA'});}
async function conversation(token){const channel=await api('/channels',token,{type:'web',name:'Attachment only'}),visitor=await api('/widget/'+channel.external_id+'/session',null,{});assert.ok((await fetch(base+'/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId,{method:'POST',headers:{'content-type':'application/json','x-visitor-token':visitor.token},body:JSON.stringify({text:'Synthetic attachment question',clientMsgId:uuid()})})).ok);return (await api('/conversations',token)).items[0];}
const a=await company(),b=await company(),token=a.accessToken;
const invite=await api('/team/invitations',token,{email:uuid()+'@example.test',role:'agent',sendEmail:false}),agent=await api('/auth/accept-invitation',null,{token:new URL(invite.inviteUrl).searchParams.get('token'),password:'Synthetic-'+uuid(),fullName:'Attachment agent'});
const uploaded=await upload(token);assert.equal(uploaded.status,201);const file=await uploaded.json();
let download=await fetch(file.url);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
for(const route of ['/uploads/'+file.name,'/uploads/'+file.name+'/content'])assert.equal((await fetch(base+route,{headers:{authorization:'Bearer '+b.accessToken}})).status,404);
assert.equal((await call('/uploads',agent.accessToken)).status,403);assert.equal((await call('/uploads/'+file.name+'/revoke',agent.accessToken,{confirm:true})).status,403);assert.equal((await call('/uploads/'+file.name,agent.accessToken,null,'DELETE')).status,403);
await api('/uploads/'+file.name,token,null,'DELETE');assert.equal((await fetch(file.url)).status,404);assert.ok((await api('/uploads/'+file.name,token)).deleted_at);await api('/uploads/'+file.name+'/restore',token,{});assert.equal((await fetch(file.url)).status,200);
const cv=await conversation(token),other=await conversation(b.accessToken);
await api('/conversations/'+cv.id+'/messages',token,{media:{kind:'image',url:file.url,filename:'Synthetic.png'}});
assert.equal((await call('/conversations/'+other.id+'/messages',b.accessToken,{media:{kind:'image',url:file.url}})).status,400);
for(const url of ['javascript:alert(1)','data:text/html,unsafe','file:///etc/passwd','https://user:password@example.test/f'])assert.equal((await call('/conversations/'+cv.id+'/messages',token,{media:{kind:'file',url}})).status,400);
const linked=await call('/uploads/'+file.name,token,null,'DELETE');assert.equal(linked.status,409);assert.equal(linked.data.code,'ATTACHMENT_IN_USE');
assert.equal((await call('/uploads/'+file.name+'/revoke',token,{confirm:false})).status,400);await api('/uploads/'+file.name+'/revoke',token,{confirm:true});assert.equal((await fetch(file.url)).status,404);
assert.equal((await fetch(base+'/uploads/'+file.name+'/content',{headers:{authorization:'Bearer '+token}})).status,200,'Revoked public sharing does not erase authorized internal access');
assert.equal((await call('/conversations/'+cv.id+'/messages',token,{media:{kind:'image',url:file.url}})).status,400);await api('/uploads/'+file.name+'/restore',token,{});assert.equal((await fetch(file.url)).status,200);
const race=await (await upload(token,'Race.png')).json();const [send,del]=await Promise.all([call('/conversations/'+cv.id+'/messages',token,{media:{kind:'image',url:race.url}}),call('/uploads/'+race.name,token,null,'DELETE')]);assert.ok((send.status===201&&del.status===409)||(send.status===400&&del.status===200),JSON.stringify([send.status,del.status]));
assert.equal((await upload(token,'forged.png',Buffer.from('<html>not a PNG</html>'))).status,400);assert.equal((await upload(token,'too-large.png',Buffer.alloc(10*1024*1024+1))).status,413);
for(const mime of ['audio/mpeg','audio/ogg','audio/aac','audio/mp4','video/mp4','text/plain','text/csv'])assert.equal((await upload(token,'forged-media',Buffer.from([0,1,2,3]),mime)).status,400,mime);
const list=await api('/uploads?limit=1',token);assert.equal(list.items.length,1);assert.ok(list.nextAfter);const next=await api('/uploads?after='+list.nextAfter+'&limit=1',token);assert.notEqual(next.items[0].name,list.items[0].name);
writeFileSync('docs/p0-evidence/attachment-lifecycle.json',JSON.stringify({status:'PASS',database:process.env.BOAT_QA_EXISTING_API==='true'?'PostgreSQL CI':'PGlite local',checks:['actual upload and byte-identical retrieval','private metadata/download tenant denial','manager and agent permissions','recoverable deletion and restore','linked-file deletion conflict','explicit public-sharing revocation and restore','no-store cache policy','foreign/revoked upload cannot be sent','send versus delete race atomicity','forged MIME and oversized upload denial','keyset list pagination'],limitations:['Public provider/visitor links remain unpredictable bearer capabilities for backward compatibility','Downloaded/cached copies cannot be recalled','Persistent production storage and purge retention policy require approval']},null,2)+'\n');
console.log('PASS attachment upload/access/revoke/delete/restore and race');
