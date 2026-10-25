import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sendWithTyping,ChannelAdapter} from './adapters/adapter';
import {TelegramAdapter} from './adapters/telegram.adapter';
import {MetaAdapter} from './adapters/meta.adapter';
test('typing runs before delivery, is bounded, strips internal metadata and skips unsupported channels',async()=>{
 const calls:unknown[]=[];
 const adapter:ChannelAdapter={typing:async()=>{calls.push('typing');},send:async(_c,_r,content)=>{calls.push(content);return{externalId:'sent'};}};
 assert.equal((await sendWithTyping(adapter,{},'id',{text:'Hello',typingSeconds:50},async ms=>{calls.push(ms);})).externalId,'sent');
 assert.deepEqual(calls,['typing',5000,{text:'Hello'}]);calls.length=0;
 await sendWithTyping({send:adapter.send},{},'id',{text:'Hello',typingSeconds:3},async()=>{throw Error('Should not wait');});assert.deepEqual(calls,[{text:'Hello'}]);calls.length=0;
 await sendWithTyping({...adapter,typing:async()=>{throw Error('Provider rejected typing');}},{},'id',{text:'Hello',typingSeconds:3});assert.deepEqual(calls,[{text:'Hello'}]);
});
test('typing adapters use real provider actions via mock transport without sending a message',async()=>{
 const original=globalThis.fetch;const calls:{url:string;body:unknown}[]=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(String(options?.body))});return new Response(JSON.stringify({ok:true,result:true}),{status:200});};
 try{await new TelegramAdapter().typing({botToken:'mock'},'123');await new MetaAdapter().typing({pageAccessToken:'mock'},'456');assert.match(calls[0].url,/sendChatAction$/);assert.deepEqual(calls[0].body,{chat_id:'123',action:'typing'});assert.deepEqual(calls[1].body,{recipient:{id:'456'},sender_action:'typing_on'});}finally{globalThis.fetch=original;}
});

test('WhatsApp typing references the last inbound message and skips without it',async()=>{
 const {WhatsAppAdapter}=await import('./adapters/whatsapp.adapter');const original=globalThis.fetch;let payload:unknown,waited=0;
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(String(options?.body));return new Response('{}');};
 try{const adapter=new WhatsAppAdapter();assert.equal(await adapter.typing({phoneNumberId:'mock',accessToken:'mock'},'123'),false);assert.equal(payload,undefined);await adapter.typing({phoneNumberId:'mock',accessToken:'mock'},'123',{lastInboundMessageId:'wamid.inbound'});assert.deepEqual(payload,{messaging_product:'whatsapp',status:'read',message_id:'wamid.inbound',typing_indicator:{type:'text'}});
 await sendWithTyping({typing:async()=>false,send:async()=>({externalId:'mock'})},{},'123',{text:'Hi',typingSeconds:3},async()=>{waited++;});assert.equal(waited,0);
 }finally{globalThis.fetch=original;}
});
