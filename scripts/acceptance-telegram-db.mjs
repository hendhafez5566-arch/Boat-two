// Telegram webhook → durable queue → real PostgreSQL. Media HTTP is mocked locally.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomInt} from 'node:crypto';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {DatabaseService}=require('./dist/database/database.service.js'),{CryptoService}=require('./dist/messaging/crypto.service.js'),{InboxController}=require('./dist/inbox/inbox.controller.js');
if(process.env.BOAT_PREVIEW_ONLY!=='true'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false')throw Error('Isolated preview required');
const db=new DatabaseService(),crypto=new CryptoService(),base=process.env.SMOKE_API_URL||'http://localhost:4000';
async function req(path,token,body,method=body?'POST':'GET',status=method==='POST'?201:200,headers={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value;}
const register=()=>req('/auth/register',null,{email:randomUUID()+'@example.test',password:'local-telegram-12345',fullName:'Telegram mock',workspaceName:'Telegram DB'});
try{
 const a=await register(),b=await register(),bot=String(randomInt(100000000,999999999));
 const ch=await req('/channels',a.accessToken,{type:'telegram',name:'Mock Telegram',credentials:{botToken:bot+':'+('x'.repeat(32))}});
 const credentials=await db.withTenant(a.tenantId,async c=>crypto.decrypt((await c.query('SELECT credentials_enc FROM channels WHERE id=$1',[ch.id])).rows[0].credentials_enc));
 const body={update_id:1,message:{message_id:1,chat:{id:123,type:'private'},from:{id:123,first_name:'Ada'},photo:[{file_id:'mock-photo'}],caption:'Photo'}};
 const webhook=(payload,secret=credentials.webhookSecret,status=200)=>req('/webhooks/telegram/'+bot,null,payload,'POST',status,{'x-telegram-bot-api-secret-token':secret});
 await webhook(body,'wrong',403);await webhook(body);await webhook(body);
 let message;for(let i=0;i<60;i++){message=await db.withTenant(a.tenantId,async c=>(await c.query("SELECT m.*,cv.contact_id FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE m.channel_id=$1 AND m.external_id='tg:1'",[ch.id])).rows[0]);if(message)break;await new Promise(r=>setTimeout(r,150));}
 assert.ok(message);assert.equal(message.content.media.providerMediaId,'mock-photo');assert.equal(JSON.stringify(message.content).includes('https://'),false);
 assert.equal((await db.withTenant(a.tenantId,c=>c.query('SELECT * FROM webhook_jobs WHERE channel_id=$1',[ch.id]))).rowCount,1);
 const group={update_id:2,message:{message_id:2,chat:{id:-456,type:'supergroup',title:'Mock group'},from:{id:123,first_name:'Ada'},text:'Group hello'}};
 await webhook(group);assert.equal((await db.withTenant(a.tenantId,c=>c.query('SELECT * FROM webhook_jobs WHERE channel_id=$1',[ch.id]))).rowCount,1);
 await req('/channels/'+ch.id,a.accessToken,{settings:{telegramAllowGroups:true}},'PATCH');await webhook(group);
 for(let i=0;i<60;i++){const result=await db.withTenant(a.tenantId,c=>c.query("SELECT content FROM messages WHERE channel_id=$1 AND external_id='tg:2'",[ch.id]));if(result.rowCount){assert.equal(result.rows[0].content.telegramSender.id,'123');break;}if(i===59)throw Error('Group update not persisted');await new Promise(r=>setTimeout(r,150));}
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;assert.match(String(url),/^https:\/\/api.telegram.org\//);return String(url).endsWith('/getFile')?new Response(JSON.stringify({ok:true,result:{file_path:'photos/mock.png',file_size:3}})):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});};
 try{
  const controller=new InboxController(db,{}, {},{credentials:()=>credentials},{});let headers,bytes;const res={set:value=>{headers=value;},send:value=>{bytes=value;}};
  await controller.media({user:{tenantId:a.tenantId}},message.conversation_id,message.id,res);assert.equal(headers['Content-Type'],'image/png');assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.deepEqual([...bytes],[1,2,3]);assert.equal(calls,2);
  await assert.rejects(controller.media({user:{tenantId:b.tenantId}},message.conversation_id,message.id,res),/No downloadable/);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
 console.log('PASS Telegram DB: secret verification, durable deduplication, private media storage, group opt-in and sender, authenticated binary route, tenant isolation; Telegram HTTP mocked, no webhook registration.');
}finally{await db.onModuleDestroy();}
