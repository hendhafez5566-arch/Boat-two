import assert from 'node:assert/strict';
import {test} from 'node:test';
import {priceText,socialSchema} from './contracts';
import {isIntervalOpen} from '../flows/engine/hours';
import {WhatsAppAdapter} from '../messaging/adapters/whatsapp.adapter';
test('money is exact and booking intervals cannot cross a closed gap',()=>{
 assert.equal(priceText('900719925474099','EGP'),'9007199254740.99 EGP');
 assert.equal(isIntervalOpen(new Date('2026-10-26T09:30:00Z'),new Date('2026-10-26T11:30:00Z'),'UTC',{mon:[['09:00','10:00'],['11:00','12:00']]}),false);
 assert.equal(socialSchema.safeParse({channelId:'00000000-0000-4000-8000-000000000001',kind:'carousel',body:'x',mediaUrls:['https://example.test/one.png']}).success,false);
});
test('native products, sections and WhatsApp Flows build real provider payloads with mock transport',async()=>{
 const original=globalThis.fetch;const sent:Record<string,any>[]=[];
 globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({messages:[{id:'mock'}]}),{status:200});};
 try{const adapter=new WhatsAppAdapter();await adapter.send({phoneNumberId:'mock',accessToken:'mock'},'mock',{text:'Product',product:{catalogId:'catalog',retailerId:'sku'}});await adapter.send({phoneNumberId:'mock',accessToken:'mock'},'mock',{text:'Products',productList:{catalogId:'catalog',sections:[{title:'Travel',retailerIds:['umrah','hajj']}]}});await adapter.send({phoneNumberId:'mock',accessToken:'mock'},'mock',{text:'Form',whatsappFlow:{flowId:'123',token:'fixed',cta:'Open',screen:'START'}});assert.equal(sent[0].interactive.action.product_retailer_id,'sku');assert.deepEqual(sent[1].interactive.action.sections[0].product_items,[{product_retailer_id:'umrah'},{product_retailer_id:'hajj'}]);assert.equal(sent[2].interactive.action.parameters.flow_token,'fixed');}finally{globalThis.fetch=original;}
});
