import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { assertLocalAcceptance } from './acceptance-local.mjs';

assertLocalAcceptance();
const out = process.env.COMMERCE_QA_OUTPUT;
if (out) mkdirSync(out, { recursive: true });

async function api(path, token, body, status, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch('http://localhost:4000' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (status) assert.equal(res.status, status, path + ': ' + JSON.stringify(data));
  else assert.ok(res.ok, path + ': ' + JSON.stringify(data));
  return data;
}

async function createRace(token, first, second) {
  const results = await Promise.all([first, second].map((body) => fetch('http://localhost:4000/commerce/orders', {
    method: 'POST', headers: { 'content-type':'application/json', authorization:'Bearer ' + token },
    body: JSON.stringify(body),
  })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201,400]);
}
const register = () => api('/auth/register', null, {
  email: randomUUID() + '@example.test', password: 'Strong-test-' + randomUUID(),
  fullName: 'Checkout QA', workspaceName: 'Isolated Checkout QA',
});
const session = await register();
const token = session.accessToken;
const channel = await api('/channels', token, { type: 'web', name: 'QA Channel' });
await api('/workspace/onboarding/complete', token, {});
const contact = await api('/crm/contacts', token, {name: 'Synthetic Buyer'});
const pack = randomUUID();
const otherPack = randomUUID();
const question = randomUUID();
const productInput = {
  sku: 'CHECKOUT-QA', name: 'Checkout fixture', priceCents: '2000',
  options: [{name: 'Extra', priceCents: '200'}],
  checkout: {
    stock: 2, discountBps: 1000, taxBps: 500,
    packages: [{ id: pack, name: 'Plus', priceCents: '3000' }, {id: otherPack, name: 'Basic', priceCents: '2000'}],
    questions: [{id: question, label: 'Travel date', type: 'date', required: true, packageId: pack}],
  }
};
const product = await api('/commerce/products', token, productInput);
const selection = {productId: product.id, packageId: pack, quantity: 1, options: ['Extra']};
const quote = await api('/commerce/checkout/quote', token, selection);
assert.equal(quote.totalCents, '3024');
assert.equal(quote.questions[0].id, question);
assert.equal((await api('/commerce/checkout/quote', token, {...selection, packageId: otherPack})).questions.length, 0);
const order = {...selection, contactId: contact.id, requestId: randomUUID()};
await api('/commerce/orders', token, order, 400);
const readyOrder = { ...order, answers: [{id: question, value: '2027-02-02'}] };
const [first, repeat] = await Promise.all([
  api('/commerce/orders', token, readyOrder), api('/commerce/orders', token, readyOrder),
]);
assert.equal(first.id, repeat.id);
assert.equal(first.snapshot.totalCents, '3024');
await api('/commerce/orders', token, {...readyOrder, quantity: 2}, 409);
await api('/commerce/products/' + product.id, token, {...productInput, checkoutUpdatedAt: '2020-01-01T00:00:00.000Z'}, 409, 'PATCH');
await createRace(token, {...readyOrder, requestId:randomUUID()}, {...readyOrder, requestId:randomUUID()});
await api('/commerce/orders', token, {...readyOrder, requestId: randomUUID()}, 400);
const orders = await api('/commerce/orders', token);
assert.equal(orders.length, 2);
assert.equal(orders[0].contact_id, contact.id);
assert.equal(orders[0].contact_name, 'Synthetic Buyer');

await api('/commerce/orders/' + first.id + '/status', token, {status:'confirmed'}, undefined, 'PATCH');
await api('/commerce/orders/' + first.id + '/status', token, {status:'cancelled'}, undefined, 'PATCH');
await api('/commerce/orders/' + first.id + '/status', token, {status:'cancelled'}, undefined, 'PATCH');
assert.deepEqual((await api('/commerce/orders/' + first.id + '/history', token)).map((event) => event.status), ['new','confirmed','cancelled']);
await api('/commerce/checkout/quote', token, selection);
await api('/commerce/checkout/quote', token, {...selection, quantity:2}, 400);

const foreign = await register();
const foreignToken = foreign.accessToken;
assert.deepEqual(await api('/commerce/orders', foreignToken), []);
await api('/commerce/checkout/quote', foreignToken, selection, 404);
const docProduct = await api('/commerce/products', token, {
  sku:'DOC-QA', name:'Documents fixture', priceCents:'400', checkout:{documents:['Identity proof']},
});
const docOrder = await api('/commerce/orders', token, {
  productId:docProduct.id, contactId:contact.id, requestId:randomUUID(), quantity:1,
});
const docPath = '/commerce/orders/' + docOrder.id + '/documents';
await api('/commerce/orders/' + docOrder.id + '/status', token, { status:'confirmed' }, undefined, 'PATCH');
await api('/commerce/orders/' + docOrder.id + '/status', token, { status:'completed' }, 409, 'PATCH');
const form = new FormData();
const sample = '%PDF-1.4\n% isolated synthetic fixture\n%%EOF';
form.append('file', new Blob([sample], {type:'application/pdf'}), 'fixture.pdf');
const uploaded = await fetch('http://localhost:4000' + docPath + '/0', {
  method:'POST', headers:{authorization:'Bearer ' + token}, body:form,
});
assert.equal(uploaded.status,201);
assert.deepEqual(await api(docPath, token), [{slot:0,filename:'fixture.pdf',mime:'application/pdf'}]);
const bytes = await fetch('http://localhost:4000' + docPath + '/0', { headers:{authorization:'Bearer ' + token} });
assert.equal(await bytes.text(),sample);
assert.equal(bytes.headers.get('cache-control'),'private, no-store');
assert.equal((await fetch('http://localhost:4000' + docPath + '/0', { headers:{authorization:'Bearer ' + foreignToken} })).status,404);
assert.equal((await fetch('http://localhost:4000' + docPath + '/0')).status,401);
await api('/commerce/orders/' + docOrder.id + '/status', token, { status:'completed' }, undefined, 'PATCH');

const service = await api('/commerce/products', token, {sku:'ASSISTANT-QA', name:'Assistant fixture', priceCents:'100', checkout:{kind:'service'}});
const setup = {name:'Isolated setup QA', welcome:'Welcome to QA', fallback:'Choose an item', channelId:channel.id, productIds:[service.id]};
const members = await api('/crm/workspace/members', token);
setup.assigneeId = members.currentUserId;
const invalidAssignee = await api('/catalog-assistant/readiness', token, {...setup, assigneeId:randomUUID()});
assert.ok(invalidAssignee.blockers.some((b) => b.includes('assignee')));
const before = await api('/flows', token);
const invalid = await api('/catalog-assistant/readiness', token, {...setup, channelId:randomUUID()});
assert.ok(invalid.blockers.length);
const check = await api('/catalog-assistant/readiness', token, setup);
assert.deepEqual(check.blockers, []);
assert.ok(check.warnings.length);
assert.deepEqual(check.repairs, [{productId:service.id,name:service.name,field:'category'}]);
await api('/commerce/products/' + service.id, foreignToken, undefined, 404);
await api('/catalog-assistant/draft', token, {setup, revision:'0'.repeat(64)}, 409);
const draft = await api('/catalog-assistant/draft', token, {setup, revision:check.revision});
const stored = await api('/flows/' + draft.id, token);
assert.ok(stored.draft_graph.nodes.some((n) => n.type === 'handoff' && n.data.assignTo === setup.assigneeId));
assert.ok(stored.draft_graph.nodes.some((n) => n.type === 'catalog' && n.data.productIds.includes(service.id)));
assert.equal(stored.published_version_id ?? null, null);
const preview = await api('/flows/' + draft.id + '/test', token, {});
assert.ok(preview.transcript.some((row) => JSON.stringify(row).includes('Welcome to QA')));
const handoff = await api('/flows/' + draft.id + '/test', token, { state: preview.state, replyId: 'staff' });
assert.equal(handoff.status, 'handed_off');
const menu = await api('/flows/' + draft.id + '/test', token, { state: preview.state, replyId: 'browse' });
assert.ok(menu.transcript.some((row) => JSON.stringify(row).includes(service.id)));
const fallback = await api('/flows/' + draft.id + '/test', token, { state: preview.state, text: 'unknown' });
assert.ok(fallback.transcript.some((row) => JSON.stringify(row).includes('Choose an item')));
await api('/catalog-assistant/releases', token, { setup, revision:check.revision, flowId:draft.id, confirm:false }, 400);
const released = await api('/catalog-assistant/releases', token, { setup, revision:check.revision, flowId:draft.id, confirm:true });
assert.equal(released.sent, false);
assert.equal(released.mode, 'demo');
assert.equal((await api('/catalog-assistant/releases', token))[0].id, released.id);
assert.deepEqual(await api('/catalog-assistant/releases', foreignToken), []);
const after = await api('/flows', token);
for (const flow of before) assert.deepEqual(after.find((f) => f.id === flow.id), flow);
await api('/commerce/products/' + service.id, token, {sku:service.sku, name:service.name, priceCents:'301'}, undefined, 'PATCH');
await api('/catalog-assistant/releases', token, { setup, revision:check.revision, flowId:draft.id, confirm:true }, 409);
const restored = await api('/catalog-assistant/releases/' + released.id + '/restore', token, { confirm: true });
assert.equal(restored.restored_from, released.id);
assert.equal(restored.sent, false);
await api('/catalog-assistant/releases/' + released.id + '/restore', foreignToken, { confirm: true }, 404);

const invitation = await api('/team/invitations', token, {
  role: 'agent', email: randomUUID() + '@example.test', sendEmail: false,
});
const staff = await api('/auth/accept-invitation', null, {
  token:new URL(invitation.inviteUrl).searchParams.get('token'), password:'Strong-test-' + randomUUID(), fullName:'Staff QA',
});
await api('/catalog-assistant/releases', staff.accessToken, undefined, 403);
await api('/catalog-assistant/releases', staff.accessToken, { setup, revision:check.revision, flowId:draft.id, confirm:true }, 403);
await api('/commerce/orders', staff.accessToken, undefined, 403);

for (let i = 0; i < 101; i++) await api('/commerce/products', token, {
  sku:'PAGE-' + i, name:'Paged item ' + i, priceCents:'900',
});
const large = {...setup, name:'All active items', productIds:undefined};
const pagedReadiness = await api('/catalog-assistant/readiness', token, large);
assert.deepEqual(pagedReadiness.blockers, []);
assert.ok(pagedReadiness.products.length >= 100);
const pagedDraft = await api('/catalog-assistant/draft', token, {setup:large, revision:pagedReadiness.revision});
const pagedGraph = (await api('/flows/' + pagedDraft.id, token)).draft_graph;
const catalogNodes = pagedGraph.nodes.filter((n) => n.type === 'catalog');
assert.ok(catalogNodes.length > 10);
assert.ok(catalogNodes.every((n) => n.data.productIds.length <= 10));
assert.equal(new Set(catalogNodes.flatMap((n) => n.data.productIds)).size, pagedReadiness.products.length);
console.log('PASS checkout pricing, conditional fields, idempotency, stock, CRM link, tenant isolation, draft, preview, release, and stale readiness');

const visitor = await api('/widget/' + channel.external_id + '/session', null, {});
const inbound = await fetch('http://localhost:4000/widget/' + channel.external_id + '/messages?visitorId=' + visitor.visitorId, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-visitor-token': visitor.token },
  body: JSON.stringify({ text: 'Synthetic checkout inquiry', clientMsgId: randomUUID() }),
});
assert.ok(inbound.ok);
const { items: [conversation] } = await api('/conversations?channelId=' + channel.id, token);
assert.ok(conversation?.contact_id);
const conversationRequest = {
  productId: service.id, quantity: 1, requestId: randomUUID(), channelId: channel.id, conversationId: conversation.id,
};
const orderPath = '/commerce/orders/from-conversation';
await api(orderPath, foreignToken, conversationRequest, 404);
await api(orderPath, staff.accessToken, conversationRequest, 403);
await api(orderPath, token, { ...conversationRequest, channelId: randomUUID() }, 404);
await api(orderPath, token, { ...conversationRequest, contactId: contact.id }, 400);
const [conversationOrder, retriedOrder] = await Promise.all([
  api(orderPath, token, conversationRequest), api(orderPath, token, conversationRequest),
]);
assert.deepEqual(conversationOrder, retriedOrder);
assert.equal(conversationOrder.contact_id, conversation.contact_id);
await api(orderPath, token, { ...conversationRequest, quantity: 2 }, 409);
const recorded = (await api('/commerce/orders', token)).filter((order) => order.id === conversationOrder.id);
assert.equal(recorded.length, 1);
assert.deepEqual(recorded[0].origin, { conversationId: conversation.id, channelId: channel.id });
console.log('PASS conversation order identity, authorization, channel binding, and retry');
const monday = new Date();
monday.setUTCHours(9, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
const serviceInput = {
  name:'Synthetic weekly visit', durationMinutes:60, timezone:'Africa/Cairo',
  schedule:{mon:[['10:00','15:00']]},
};
const appointment = await api('/commerce/services', token, serviceInput);
const appointment2 = await api('/commerce/services', token, {...serviceInput, name:'Separate consultation'});
const booking = {
  serviceId:appointment.id, contactId:contact.id, start:monday.toISOString(), eventKey:randomUUID(), dryRun:false,
};
const previewBooking = await api('/commerce/appointments', token, {...booking, dryRun:true});
assert.equal(previewBooking.persisted,false);
assert.equal((await api('/commerce/appointments',token)).length,0);
await api('/commerce/appointments',token,{...booking,start:new Date(+monday+5*60*60*1000).toISOString()},409);
const [firstBooking, retryBooking] = await Promise.all([
  api('/commerce/appointments',token,booking), api('/commerce/appointments',token,booking),
]);
assert.equal(firstBooking.id,retryBooking.id);
await api('/commerce/appointments',token,{...booking,eventKey:randomUUID()},409);
await api('/commerce/appointments',foreignToken,booking,404);
await api('/commerce/appointments/'+firstBooking.id+'/cancel',token,{});
const retryAfterCancellation = await api('/commerce/appointments',token,{...booking,eventKey:randomUUID()});
assert.notEqual(retryAfterCancellation.id,firstBooking.id);
const sameKey = randomUUID();
const differentServices = await Promise.all([appointment.id,appointment2.id].map((serviceId) =>
  fetch('http://localhost:4000/commerce/appointments',{
    method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({...booking,serviceId,eventKey:sameKey,start:new Date(+monday+60*60*1000).toISOString()}),
  }),
));
assert.deepEqual(differentServices.map((response)=>response.status).sort(),[201,409]);
const slotRace = await Promise.all([randomUUID(),randomUUID()].map((eventKey) =>
  fetch('http://localhost:4000/commerce/appointments',{
    method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({...booking,eventKey,start:new Date(+monday+2*60*60*1000).toISOString()}),
  }),
));
assert.deepEqual(slotRace.map((response)=>response.status).sort(),[201,409]);

const quoteProduct = await api('/commerce/products',token,{
  sku:'QA-QUOTE',name:'Custom quote fixture',priceCents:'0',checkout:{kind:'quote'},
});
const quoteOrder = await api('/commerce/orders',token,{
  productId:quoteProduct.id, contactId:contact.id, requestId:randomUUID(), quantity:1,
});
assert.equal(quoteOrder.snapshot.kind,'quote');
assert.equal(quoteOrder.snapshot.totalCents,null);
const appointmentProduct = await api('/commerce/products',token,{
  sku:'QA-APPOINTMENT',name:'Bookable fixture',priceCents:'100',checkout:{kind:'appointment'},
});
await api('/commerce/orders',token,{
  productId:appointmentProduct.id,contactId:contact.id,requestId:randomUUID(),quantity:1,
},400);
console.log('PASS quote order and explicit separation of appointment booking');
console.log('PASS appointments: Cairo hours, preview, tenant boundary, replay and contention, cancellation and rebooking');
if (process.env.COMMERCE_QA_API_ONLY === 'true') process.exit(0);
const { chromium } = createRequire(import.meta.url)(process.env.BOAT_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.BOAT_CHROMIUM, args: ['--no-sandbox', '--disable-software-rasterizer'],
});
try {
  for (const [language, width] of [['ar',390],['en',1440]]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({width,height:900});
    await page.addInitScript(({session,language}) => {
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('boat-language', language);
    }, { session, language });
    const t = (ar,en) => language === 'ar' ? ar : en;
    await page.goto('http://localhost:3000/dashboard/inbox?conversation=' + conversation.id);
    const createOrder = page.getByRole('link', {name:t('إنشاء طلب','Create order'),exact:true});
    await createOrder.waitFor();
    if (out) await page.screenshot({path:out + '/inbox-order-link-' + width + '.png'});
    await createOrder.click();
    await page.getByRole('button',{name:t('الطلبات','Orders'),exact:true}).waitFor();
    await page.getByRole('link',{name:t('المحادثة الأصلية','Original conversation')}).first().waitFor();
    assert.ok(page.url().includes(conversation.id));
    await page.goto('http://localhost:3000/dashboard/commerce');
    await page.getByRole('button',{name:t('الطلبات','Orders'),exact:true}).click();
    await page.getByRole('link',{name:'Synthetic Buyer'}).first().waitFor();
    assert.match(await page.getByRole('link',{name:'Synthetic Buyer'}).first().getAttribute('href'), new RegExp(contact.id));
    if (out) await page.screenshot({path:out + '/orders-' + width + '.png'});
    if (language === 'en') {
      const card = page.getByRole('article').filter({ has: page.getByRole('heading',{name:'Documents fixture'}) });
      await card.getByRole('button',{name:'Documents',exact:true}).click();
      await card.getByRole('button',{name:'Download · fixture.pdf'}).waitFor();
      await card.getByRole('button',{name:'CRM follow-up'}).click();
      await card.locator('input[name=due]').fill('2030-02-02T13:00');
      await card.getByRole('button',{name:'Create follow-up'}).click();
      await page.getByText('CRM follow-up created.',{exact:true}).waitFor();
    }
    await page.goto('http://localhost:3000/dashboard/commerce/assistant');
    await page.getByRole('heading',{name:t('مساعد إعداد البوت الذكي','Smart bot setup')}).waitFor();
    if (out) await page.screenshot({path:out + '/assistant-' + width + '.png'});
    await page.getByRole('checkbox',{name:t('تحديد المنتجات يدويًا','Select products manually')}).check();
    await page.getByRole('textbox',{name:t('ابحث في الكتالوج','Search the catalog')}).fill('CHECKOUT-QA');
    await page.getByRole('button',{name:'Checkout fixture · CHECKOUT-QA'}).click();
    await page.getByRole('button',{name:t('متابعة','Continue'),exact:true}).click();
    await page.getByRole('textbox',{name:t('اسم المسار','Flow name')}).fill('Browser setup ' + language);
    await page.getByLabel(t('القناة','Channel'),{exact:true}).selectOption(channel.id);
    await page.getByRole('button',{name:t('متابعة','Continue'),exact:true}).click();
    await page.getByRole('button',{name:t('فحص الجاهزية','Check readiness'),exact:true}).click();
    const repair = page.getByRole('link',{name:t('إصلاح','Fix') + ' Checkout fixture · ' + t('التصنيف','Category')});
    const href = await repair.getAttribute('href');
    const editor = await context.newPage();
    await editor.goto('http://localhost:3000' + href);
    const field = editor.locator('dialog select[name=category]');
    await field.waitFor();
    await field.evaluate((el) => {
      if (document.activeElement !== el) throw new Error('Repair did not focus the category field');
    });
    await editor.close();
    await page.getByRole('button',{name:t('إنشاء مسودة في محرر البوت','Create Flow Builder draft')}).click();
    await page.getByRole('button',{name:t('تشغيل المعاينة المعزولة','Run isolated preview')}).click();
    await page.getByText('أهلًا وسهلًا / Welcome',{exact:false}).waitFor();
    await page.getByRole('button',{name:'الكتالوج · Catalog',exact:true}).click();
    await page.getByRole('button',{name:'Checkout fixture',exact:true}).click();
    await page.locator('form select').selectOption(pack);
    await page.locator('form input[type=date]').fill('2027-02-02');
    await page.locator('form input[name=option]').check();
    await page.getByRole('button',{name:t('معاينة السعر','Preview price'),exact:true}).click();
    await page.getByText('30.24 EGP',{exact:true}).waitFor();
    if (out) await page.screenshot({path:out + '/assistant-preview-' + width + '.png'});
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('PASS real Orders and Assistant rendered at 390 RTL and 1440 LTR');
