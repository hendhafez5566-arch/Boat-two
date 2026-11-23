import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { assertLocalAcceptance } from './acceptance-local.mjs';
assertLocalAcceptance();

const base = 'http://localhost:4000';
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, {
    method,
    headers: {'content-type':'application/json', ...(token ? {authorization:'Bearer ' + token} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.ok(response.ok, path + ' ' + JSON.stringify(result));
  return result;
}
const owner = await api('/auth/register', null, {
  email:randomUUID() + '@example.test', password:'Synthetic-' + randomUUID(), fullName:'Runtime checkout QA',
  workspaceName:'Isolated checkout QA',
});
const token = owner.accessToken;
const whatsapp = process.env.CHECKOUT_QA_WHATSAPP === 'true';
const fixtureSecret = 'synthetic-checkout-webhook-fixture';
if (whatsapp) assert.equal(process.env.META_APP_SECRET, fixtureSecret);
const channel = await api('/channels', token, whatsapp
  ? {type:'whatsapp',name:'Synthetic checkout',credentials:{accessToken:'synthetic-fixture-no-access',phoneNumberId:'900000000042'}}
  : {type:'web',name:'Runtime checkout'});
await api('/workspace/onboarding/complete',token,{});
const pack = randomUUID();
const question = randomUUID();
const product = await api('/commerce/products', token, {
  sku:'CHAT-CHECKOUT', name:'Runtime checkout product', priceCents:'3000',
  options:[{name:'Transfer',priceCents:'250'}],
  checkout:{stock:4, packages:[{id:pack,name:'Standard',priceCents:'4000'}],
    questions:[{id:question,label:'Travel date',type:'date',required:true,packageId:pack}]},
});
const setup = {name:'Runtime order',welcome:'Start checkout',fallback:'Choose browse',channelId:channel.id,checkout:true,checkoutFollowup:true};
const readiness = await api('/catalog-assistant/readiness',token,setup);
assert.deepEqual(readiness.blockers,[]);
const draft = await api('/catalog-assistant/draft',token,{setup,revision:readiness.revision});
const configured = await api('/flows/'+draft.id, token, {expectedUpdatedAt:draft.updatedAt, triggers:[{type:'first_message'}]}, 'PATCH');
await api('/flows/'+draft.id+'/publish',token,{expectedUpdatedAt:configured.updated_at});
const visitor = whatsapp ? null : await api('/widget/'+channel.external_id+'/session',null,{});
const route = visitor ? base+'/widget/'+channel.external_id+'/messages?visitorId='+visitor.visitorId : base+'/webhooks/whatsapp';
const headers = {'content-type':'application/json', ...(visitor ? {'x-visitor-token':visitor.token} : {})};
async function send(body, clientMsgId=randomUUID()) {
  const payload = JSON.stringify(whatsapp ? {entry:[{changes:[{field:'messages',value:{
    metadata:{phone_number_id:'900000000042'}, contacts:[{wa_id:'15550100042',profile:{name:'Synthetic customer'}}],
    messages:[{id:'wamid.'+clientMsgId,from:'15550100042',timestamp:String(Math.floor(Date.now()/1000)),
      ...(body.reply ? {type:'interactive',interactive:{type:'list_reply',list_reply:body.reply}} : {type:'text',text:{body:body.text}})}],
  }}]}]} : {...body,clientMsgId});
  const signature = whatsapp ? {'x-hub-signature-256':'sha256='+createHmac('sha256',fixtureSecret).update(payload).digest('hex')} : {};
  const r=await fetch(route,{method:'POST',headers:{...headers,...signature},body:payload});
  assert.ok(r.ok, await r.text());
}
async function wait(text) {
  for(let i=0;i<120;i++) {
    let history;
    if (whatsapp) {
      const { items:[current] } = await api('/conversations?channelId='+channel.id,token);
      history = current ? await api('/conversations/'+current.id+'/messages',token) : [];
    } else history = await (await fetch(route,{headers})).json();
    if(JSON.stringify(history).includes(text)) return;
    await new Promise((resolve)=>setTimeout(resolve,50));
  }
  assert.fail('Runtime did not reach '+text);
}
await send({text:'Start'}); await wait('Start checkout');
await send({reply:{id:'browse',title:'Catalog'}}); await wait('Runtime checkout product');
await send({reply:{id:'product:'+product.id,title:'Runtime checkout product'}}); await wait('Choose a package');
await send({text:'1'}); await wait('Add-on numbers');
await send({text:'1'}); await wait('Quantity');
await send({text:'2'}); await wait('Travel date');
await send({text:'2027-02-30'});
assert.deepEqual(await api('/commerce/orders', token),[]);
await send({text:'2027-02-28'}); await wait('85.00 EGP');
assert.deepEqual(await api('/commerce/orders', token),[]);
const confirmation = randomUUID();
await Promise.all([send({text:'١'},confirmation),send({text:'١'},confirmation)]);
await wait('Order saved:');
const orders = await api('/commerce/orders',token);
assert.equal(orders.length,1);
assert.equal(orders[0].snapshot.totalCents,'8500');
assert.equal(orders[0].snapshot.answers[0].value,'2027-02-28');
const {items:[conversation]} = await api('/conversations?channelId='+channel.id,token);
assert.equal(orders[0].contact_id,conversation.contact_id);
assert.deepEqual(orders[0].origin,{conversationId:conversation.id,channelId:channel.id});
const stored = await api('/commerce/products/'+product.id,token);
assert.equal(stored.checkout.stock,2);
const tasks = await api('/crm/tasks?contactId='+conversation.contact_id,token);
assert.match(JSON.stringify(tasks),new RegExp(orders[0].id));
console.log('PASS published ' + (whatsapp ? 'synthetic signed WhatsApp webhook' : 'Web Chat') + ' runtime: catalog, package, add-on, quantity, conditional date, price, confirmation replay, CRM identity, stock and follow-up');
