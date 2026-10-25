import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WhatsAppAdapter} from './adapters/whatsapp.adapter';
import {contentSchema,validateOutbound} from './message-content';
import {FlowEngine} from '../flows/engine/engine';
import {EngineDeps,FlowGraph,newState} from '../flows/engine/types';

test('WhatsApp button and list payloads preserve native header/footer without external delivery',async()=>{
  const original=globalThis.fetch;const payloads:any[]=[];
  globalThis.fetch=async(_url,options)=>{payloads.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({messages:[{id:'mock'}]}),{status:200});};
  try{
    const adapter=new WhatsAppAdapter();
    for(const choice of [{buttons:[{id:'fixed',title:'Trips'}]},{list:{buttonText:'Menu',sections:[{rows:[{id:'fixed',title:'Trips'}]}]}}]){
      const content=contentSchema.parse({text:'Body',header:{type:'text',text:'Travel'},footer:'Terms',...choice});validateOutbound(content);await adapter.send({phoneNumberId:'mock',accessToken:'mock'},'mock',content);
    }
    for(const payload of payloads){assert.deepEqual(payload.interactive.header,{type:'text',text:'Travel'});assert.deepEqual(payload.interactive.footer,{text:'Terms'});assert.deepEqual(payload.interactive.body,{text:'Body'});}
    assert.throws(()=>validateOutbound({text:'x',header:{type:'text',text:'title'}}),/interactive/);
    assert.throws(()=>validateOutbound({text:'x'.repeat(1025),buttons:[{id:'a',title:'A'}]}),/1024/);
  }finally{globalThis.fetch=original;}
});

test('message delivery delay resumes that same node once, then enters its choices',async()=>{
  const sent:any[]=[];
  const deps:EngineDeps={now:()=>new Date('2026-10-25T12:00:00Z'),random:()=>0.5,send:async c=>{sent.push(c);},ai:async()=>({text:'',handoff:false}),http:async()=>({ok:true,status:200,body:{}}),setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{}};
  const graph:FlowGraph={startNodeId:'message',nodes:[{id:'message',type:'interactive',data:{text:'Body',header:{type:'text',text:'Title'},footer:'Footer',delivery:{delaySeconds:90},buttons:[{id:'fixed',title:'Trips'}]},edges:{}}]};
  const ctx={contact:{attributes:{}},channel:{type:'test'},lastMessage:{text:'hi'}};const state=newState();
  let engine=new FlowEngine(graph,deps);let result=await engine.start(ctx,state);assert.equal(result.waitKind,'delay');assert.equal(sent.length,0);assert.equal(result.waitUntil?.toISOString(),'2026-10-25T12:01:30.000Z');
  engine=new FlowEngine(graph,deps);result=await engine.resumeDelay(ctx,JSON.parse(JSON.stringify(state)));assert.equal(result.waitKind,'choice');assert.equal(sent.length,1);assert.equal(sent[0].header.text,'Title');assert.equal(sent[0].footer,'Footer');assert.equal('delivery' in sent[0],false);
});

test('post-formatting validation rejects signature overflow for text and media captions',async()=>{
 const {validateOutbound}=await import('./message-content');
 assert.doesNotThrow(()=>validateOutbound({text:'x'.repeat(4096)}));
 assert.throws(()=>validateOutbound({text:'x'.repeat(4097)}),/4096/);
 assert.throws(()=>validateOutbound({media:{kind:'image',url:'https://example.test/image.png',caption:'x'.repeat(1025)}}),/1024/);
});
