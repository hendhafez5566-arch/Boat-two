import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TelegramAdapter,telegramWebhookAuthorized} from './adapters/telegram.adapter';
import {parseTelegram} from './webhook-parsers';

test('Telegram inbound private chats and callbacks preserve IDs; groups and invalid updates are ignored',()=>{
  const base={update_id:42,message:{chat:{id:123,type:'private'},from:{id:123,first_name:'Ada'},text:'Hello'}};
  const events=parseTelegram('12345',base);assert.equal(events.length,1);assert.equal(events[0].channelType,'telegram');assert.equal(events[0].externalMessageId,'tg:42');
  assert.deepEqual(parseTelegram('12345',{...base,message:{...base.message,chat:{id:123,type:'group'}}}),[]);
  const callback=parseTelegram('12345',{update_id:43,callback_query:{from:base.message.from,message:base.message,data:'stable-button'}})[0];
  if(callback.kind!=='message')throw new Error('Expected message');assert.deepEqual(callback.content,{reply:{id:'stable-button',title:''}});
  assert.deepEqual(parseTelegram('12345',{...base,update_id:'42'}),[]);
});
test('Telegram webhook secret rejects missing, unequal length and incorrect values',()=>{
  assert.equal(telegramWebhookAuthorized(undefined,undefined),false);assert.equal(telegramWebhookAuthorized('secret','x'),false);assert.equal(telegramWebhookAuthorized('secret','secrex'),false);assert.equal(telegramWebhookAuthorized('secret','secret'),true);
});
test('Telegram outbound mock sends stable callback IDs and rejects truncation or WhatsApp templates',async()=>{
  const original=globalThis.fetch;const bodies:Record<string,unknown>[]=[];
  globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({ok:true,result:{message_id:7}}),{status:200});};
  try {
    const adapter=new TelegramAdapter();const result=await adapter.send({botToken:'mock'},'123',{text:'Hello',buttons:[{id:'stable',title:'Trips'}]});assert.equal(result.externalId,'7');assert.deepEqual(bodies[0].reply_markup,{inline_keyboard:[[{text:'Trips',callback_data:'stable'}]]});
    await assert.rejects(adapter.send({botToken:'mock'},'123',{text:'x',buttons:[{id:'a'.repeat(65),title:'A'}]}),/not truncated/);
    await assert.rejects(adapter.send({botToken:'mock'},'123',{template:{name:'x',language:'en',bodyParams:[]}}),/unavailable/);assert.equal(bodies.length,1);
  }finally{globalThis.fetch=original;}
});
