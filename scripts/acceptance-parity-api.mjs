// Isolated PostgreSQL + API acceptance. Never enable external providers here.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {DatabaseService}=require('./dist/database/database.service.js');
const {InboxPolicyService}=require('./dist/inbox/inbox-policy.service.js');
const base=process.env.SMOKE_API_URL||'http://localhost:4000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)||process.env.BOAT_PREVIEW_ONLY!=='true'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false')throw Error('Isolated local preview with external delivery disabled required');
const db=new DatabaseService(),results=[];
async function req(path,token,method='GET',body,status=200,headers={}){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(d)}`);return d;
}
const post=(path,token,body,status=201,headers)=>req(path,token,'POST',body,status,headers);
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
async function wait(fn){for(let i=0;i<80;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,150));}throw Error('Worker did not reach expected state');}
const register=()=>post('/auth/register',null,{email:`parity-${randomUUID()}@example.test`,password:'local-test-only-12345',fullName:'Parity owner',workspaceName:'شركة سياحة تجريبية'});
try{
 const a=await register(),b=await register(),token=a.accessToken;
 const channel=await post('/channels',token,{type:'web',name:'قناة محاكاة السفر'});
 const list=await post('/contact-lists',token,{name:'مهتمو العمرة'});
 const hook=await post('/integrations',token,{provider:'webhook',name:'Mock webhook',credential:'local-mock-secret',config:{url:'https://example.test/mock',eventTypes:['message.received','message.outbound','message.status','conversation.updated','crm.contacts.insert','crm.contacts.update']}});
 await req('/integrations/'+hook.id,token,'PATCH',{enabled:true});
 const flow=await post('/flows',token,{name:'رحلة العمرة التجريبية'});
 const graph={policy:{initialVars:{source:'web'},startMessage:'مرحبًا بك'},startNodeId:'menu',nodes:[
 {id:'menu',type:'message',data:{text:'اختر الخدمة',buttons:[{id:'umrah',title:'برامج عمرة',actions:[{type:'list',listId:list.id,operation:'add'},{type:'tag',add:['عمرة'],remove:[]}]},{id:'human',title:'موظف',actions:[{type:'assign'}]}]},edges:{'option:umrah':'name','option:human':'end'}},
 {id:'name',type:'question',data:{text:'ما اسمك؟',saveAs:'name',answerType:'text',saveToSystem:'name'},edges:{ok:'count',fail:'end'}},
 {id:'count',type:'question',data:{text:'عدد المسافرين؟',saveAs:'travelers',answerType:'number',saveToContact:true},edges:{ok:'condition',fail:'end'}},
 {id:'condition',type:'condition',data:{rules:[{id:'group',match:'all',conditions:[{source:'variable',key:'travelers',operator:'greater_than',value:'2'}]}]},edges:{'rule:group':'group',else:'single'}},
 {id:'group',type:'message',data:{text:'عرض المجموعة {{name}}'},edges:{next:'end'}},{id:'single',type:'message',data:{text:'عرض فردي'},edges:{next:'end'}},{id:'end',type:'end',data:{},edges:{}}]};
 await check('082/083 flow persistence, conflicts, import/export and reset keep IDs and edges',async()=>{
  await req('/flows/'+flow.id,token,'PATCH',{graph,channelIds:[channel.id],folderName:'سياحة'});
  const saved=await req('/flows/'+flow.id,token);assert.deepEqual(saved.draft_graph.nodes.map(n=>n.id),graph.nodes.map(n=>n.id));
  const exported=await req('/flows/'+flow.id+'/export',token);assert.equal(exported.graph.nodes[0].data.buttons[0].id,'umrah');
  const imported=await post('/flows/import',token,exported);assert.deepEqual(imported.channel_ids,[]);
  await post('/flows/'+imported.id+'/reset-actions',token,{confirm:true,expectedUpdatedAt:imported.updated_at});
  const reset=await req('/flows/'+imported.id,token);assert.deepEqual(reset.draft_graph.nodes[0].edges,graph.nodes[0].edges);assert.equal(reset.draft_graph.nodes[0].data.buttons[0].actions,undefined);
  await post('/flows/'+imported.id+'/reset-actions',token,{confirm:true,expectedUpdatedAt:imported.updated_at},409);
  await req('/flows/'+flow.id,b.accessToken,'GET',undefined,404);
 });
 await post('/flows/'+flow.id+'/publish',token,{});
 const visitor=await post(`/widget/${channel.external_id}/session`,null,{}),headers={'x-visitor-token':visitor.token};
 const path=`/widget/${channel.external_id}/messages?visitorId=${visitor.visitorId}`;
 const send=(content)=>post(path,null,{clientMsgId:randomUUID(),...content},201,headers);
 const messages=()=>req(path,null,'GET',undefined,200,headers);
 await check('published widget journey → button actions → system/custom CRM → all-condition branch',async()=>{
  await send({text:'مرحبًا'});await wait(async()=>(await messages()).messages.some(m=>m.content.text==='اختر الخدمة'));
  await send({reply:{id:'umrah',title:'برامج عمرة'}});await wait(async()=>(await messages()).messages.some(m=>m.content.text==='ما اسمك؟'));
  await send({text:'مريم'});await wait(async()=>(await messages()).messages.some(m=>m.content.text==='عدد المسافرين؟'));
  await send({text:'4'});await wait(async()=>(await messages()).messages.some(m=>m.content.text==='عرض المجموعة مريم'));
  const contacts=await req('/crm/contacts?listId='+list.id+'&channelId='+channel.id,token);assert.equal(contacts.items.length,1);const contact=contacts.items[0];assert.equal(contact.name,'مريم');assert.equal(Number(contact.attributes.travelers),4);assert.ok(contact.tags.includes('عمرة'));assert.equal(contact.consents.length,0);
  const clicks=await req('/flows/'+flow.id+'/button-stats',token);assert.equal(clicks['menu:umrah'].clicks,1);
  const stats=await req('/flows/'+flow.id+'/stats',token);assert.ok(stats.menu.sent>0);assert.equal(stats.menu.delivered,0);
 });
 const conversation=(await req('/conversations',token)).items.find(c=>c.channel_id===channel.id);assert.ok(conversation);
 const contactId=conversation.contact_id;
 await check('085 event webhook queue is durable, deduplicated and isolated without network',async()=>{
  const jobs=await wait(async()=>{const r=await req('/integrations/deliveries',token);return r.length?r:null;});assert.ok(jobs.some(j=>j.connection_id===hook.id));assert.ok(jobs.every(j=>j.status==='pending'&&j.attempts===0));assert.deepEqual(await req('/integrations/deliveries',b.accessToken),[]);
  await req('/integrations/'+hook.id+'/execute',token,'POST',{payload:{},dryRun:true},400);
  await post('/integrations/google/start',token,{purposes:['calendar']},503);
 });
 await check('086 products, selectable catalogs, social drafts and cross-tenant denial',async()=>{
  const product=await post('/commerce/products',token,{sku:'umrah',name:'برنامج العمرة',priceCents:'125000',currency:'EGP'});
  const preview=await post('/commerce/products/'+product.id+'/preview',token);assert.equal(preview.mock,true);assert.match(preview.content.text,/1250.00 EGP/);
  await post('/commerce/products/'+product.id+'/preview',b.accessToken,undefined,404);
  const fake=await post('/channels',token,{type:'facebook',name:'Mock page',credentials:{pageId:randomUUID(),pageAccessToken:'not-a-real-access-token'}});
  const draft=await post('/commerce/social',token,{channelId:fake.id,kind:'carousel',body:'رحلاتنا',mediaUrls:['https://example.test/1.png','https://example.test/2.png']});
  assert.equal((await post('/commerce/social/'+draft.id+'/preview',token)).published,false);
  await post('/commerce/social/'+draft.id+'/queue',token,{confirm:true,scheduledAt:new Date(Date.now()+60000).toISOString()},400);
  assert.equal((await req('/commerce/social',token))[0].status,'draft');assert.deepEqual(await req('/commerce/social',b.accessToken),[]);
 });
 await check('086 concurrent appointments conflict safely, replays deduplicate and cancel releases slot',async()=>{
  const service=await post('/commerce/services',token,{name:'زيارة المكتب',durationMinutes:30,timezone:'UTC'});const start=new Date(Date.now()+86400000).toISOString();
  const body={serviceId:service.id,contactId,start,dryRun:false};
  const calls=await Promise.all([fetch(base+'/commerce/appointments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...body,eventKey:randomUUID()})}),fetch(base+'/commerce/appointments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...body,eventKey:randomUUID()})})]);
  assert.deepEqual(calls.map(r=>r.status).sort(),[201,409]);const booking=await calls.find(r=>r.status===201).json();
  const replay=await post('/commerce/appointments',token,{...body,eventKey:booking.event_key});assert.equal(replay.id,booking.id);
  await post('/commerce/appointments/'+booking.id+'/cancel',token);assert.equal((await post('/commerce/appointments',token,{...body,eventKey:randomUUID(),dryRun:true})).available,true);
 });
 await check('087 signature, human takeover, expiry and delivery-error labels execute against PostgreSQL',async()=>{
  await req('/inbox/settings',token,'PUT',{signature_enabled:true,signature_template:'— {{agent.name}}',human_session_minutes:1,delivery_error_tag:'delivery-failed'});
  await post('/conversations/'+conversation.id+'/takeover',token);
  await post('/conversations/'+conversation.id+'/messages',token,{text:'رد الموظف'});
  assert.ok((await messages()).messages.some(m=>m.content.text==='رد الموظف\n— Parity owner'));
  const before=(await messages()).messages.filter(m=>m.senderType==='bot').length;await send({text:'هل يوجد رد آلي؟'});await new Promise(r=>setTimeout(r,800));assert.equal((await messages()).messages.filter(m=>m.senderType==='bot').length,before);
  await db.withTenant(a.tenantId,c=>c.query("UPDATE conversations SET human_since=now()-interval '2 minutes' WHERE id=$1",[conversation.id]));
  const policy=new InboxPolicyService(db);await policy.tick();assert.equal((await req('/conversations/'+conversation.id,token)).handled_by,'bot');
  const failed=await db.withTenant(a.tenantId,async c=>(await c.query("INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status) VALUES($1,$2,$3,'out','bot','text','{\"text\":\"Mock failure\"}','sent') RETURNING id",[a.tenantId,conversation.id,channel.id])).rows[0]);
  await db.withTenant(a.tenantId,c=>c.query("UPDATE messages SET status='failed' WHERE id=$1",[failed.id]));
  await wait(async()=>{const x=(await req('/crm/contacts?channelId='+channel.id,token)).items.find(c=>c.id===contactId);return x?.tags.includes('delivery-failed');});
 });
 await check('082–087 RLS denies foreign reads, writes and cross-tenant foreign keys',async()=>{
  const tables=['contact_lists','contact_list_members','flow_action_receipts','integration_connections','integration_oauth_states','integration_deliveries','catalog_products','appointment_services','appointments','social_posts'];
  for(const table of tables){assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0,'unscoped '+table);const foreign=await db.withTenant(b.tenantId,async c=>(await c.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n);assert.equal(foreign,0,table);}
  await assert.rejects(db.withTenant(b.tenantId,c=>c.query('INSERT INTO contact_list_members(tenant_id,list_id,contact_id) VALUES($1,$2,$3)',[b.tenantId,list.id,contactId])),/foreign key|row-level/);
  await assert.rejects(db.withTenant(b.tenantId,c=>c.query('INSERT INTO contact_lists(tenant_id,name) VALUES($1,$2)',[a.tenantId,'Forbidden'])),/row-level/);
 });
 await check('catalog selection uses real DB products in the simulator and preserves stable IDs across turns',async()=>{
  const product=await post('/commerce/products',token,{sku:'selectable',name:'رحلة اختبار',priceCents:'199900',currency:'EGP'});
  const bot=await post('/flows',token,{name:'Catalog DB selection'});
  await req('/flows/'+bot.id,token,'PATCH',{graph:{startNodeId:'catalog',nodes:[{id:'catalog',type:'catalog',data:{productIds:[product.id],text:'اختر منتجًا',selectable:true,saveAs:'product'},edges:{next:'done'}},{id:'done',type:'message',data:{text:'Selected {{product}}'},edges:{}}]}});
  const first=await post('/flows/'+bot.id+'/test',token,{text:'hello'});assert.equal(first.status,'waiting');assert.equal(first.state.waiting.catalogOptions[0].id,'product:'+product.id);
  const next=await post('/flows/'+bot.id+'/test',token,{text:'رحلة اختبار',replyId:'product:'+product.id,state:JSON.parse(JSON.stringify(first.state))});assert.equal(next.status,'completed');assert.equal(next.state.vars.product,product.id);
 });
 await check('published off-hours bot keeps its immutable alternate after the alternate is republished',async()=>{
  const alternate=await post('/flows',token,{name:'Off-hours alternate'});const makeGraph=text=>({startNodeId:'message',nodes:[{id:'message',type:'message',data:{text},edges:{}}]});
  await req('/flows/'+alternate.id,token,'PATCH',{graph:makeGraph('Original off-hours')});await post('/flows/'+alternate.id+'/publish',token,{});
  const parent=await post('/flows',token,{name:'Parent frozen off-hours'});await req('/flows/'+parent.id,token,'PATCH',{priority:50,channelIds:[channel.id],graph:{...makeGraph('Normal hours'),policy:{businessHours:{enabled:true,timezone:'UTC',schedule:{[['sun','mon','tue','wed','thu','fri','sat'][(new Date().getUTCDay()+1)%7]]:[['09:00','17:00']]},offHoursFlowId:alternate.id}}}});await post('/flows/'+parent.id+'/publish',token,{});
  await req('/flows/'+alternate.id,token,'PATCH',{graph:makeGraph('Changed off-hours')});await post('/flows/'+alternate.id+'/publish',token,{});
  const version=await db.withTenant(a.tenantId,async c=>(await c.query('SELECT v.graph FROM flows f JOIN flow_versions v ON v.id=f.published_version_id WHERE f.id=$1',[parent.id])).rows[0]);assert.equal(version.graph.policy.businessHours.offHoursGraph.nodes[0].data.text,'Original off-hours');
  const v=await post(`/widget/${channel.external_id}/session`,null,{}),h={'x-visitor-token':v.token},p=`/widget/${channel.external_id}/messages?visitorId=${v.visitorId}`;await post(p,null,{clientMsgId:randomUUID(),text:'After hours'},201,h);await wait(async()=>(await req(p,null,'GET',undefined,200,h)).messages.some(m=>m.content.text==='Original off-hours'));
 });
 await check('087 own sessions show current device and revoked access is rejected immediately',async()=>{
  const sessions=await req('/auth/sessions',token);assert.ok(sessions.some(s=>s.is_current));const current=sessions.find(s=>s.is_current);assert.ok(current.last_seen_at);
  await post('/auth/sessions/'+current.id+'/revoke',b.accessToken,undefined,404);await post('/auth/sessions/'+current.id+'/revoke',token);await req('/workspace',token,'GET',undefined,401);
 });
 await writeFile(process.env.BOAT_PARITY_API_REPORT||'/tmp/boat-parity-api-results.json',JSON.stringify({results,externalDelivery:false},null,2));
 console.log(`PASS parity acceptance: ${results.length} groups with real PostgreSQL/API; no external sends.`);
}finally{await db.onModuleDestroy();}
