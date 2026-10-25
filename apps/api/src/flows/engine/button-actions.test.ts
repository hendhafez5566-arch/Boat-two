import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowEngine } from './engine';
import { ButtonAction, EngineDeps, FlowGraph, newState, FlowContext, OutContent } from './types';
import { graphSchema, buttonActionSchema } from '../flow-schemas';

function setup(actions: ButtonAction[], type: 'buttons'|'list' = 'buttons') {
  const option={id:'stable-option',title:'برامج',actions};
  const graph:FlowGraph={startNodeId:'welcome',nodes:[
    {id:'welcome',type:'interactive',data:{text:'مرحبًا',saveReplyAs:'choice',...(type==='buttons'?{buttons:[option]}:{list:{buttonText:'اختر',sections:[{rows:[option]}]}})},edges:{'option:stable-option':'end'}},
    {id:'end',type:'end',data:{message:'تم'},edges:{}},
  ]};
  const calls:{action:ButtonAction;key:string}[]=[];const sent:OutContent[]=[];
  const deps:EngineDeps={ai:async()=>({text:'',handoff:false}),send:async c=>{sent.push(c);},http:async()=>({ok:true,status:200,body:{}}),setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{},now:()=>new Date(),random:()=>0.5,executeButtonAction:async(action,key)=>{calls.push({action,key});}};
  const ctx:FlowContext={contact:{name:'هند',attributes:{}},channel:{type:'test'},lastMessage:{text:''}};
  return {graph,calls,sent,deps,ctx,engine:new FlowEngine(graph,deps)};
}
test('button and list actions survive API parsing and save/reopen without changing option IDs',()=>{
  for(const type of ['buttons','list'] as const){
    const h=setup([{type:'set_field',key:'interest',value:'{{choice}}'},{type:'tag',add:['عمرة'],remove:[]}],type);
    const parsed=graphSchema.parse(h.graph);
    assert.deepEqual(parsed.nodes[0].data,h.graph.nodes[0].data);
    assert.deepEqual(parsed.nodes[0].edges,h.graph.nodes[0].edges);
  }
  assert.equal(buttonActionSchema.safeParse({type:'calendar'}).success,false);
  assert.equal(buttonActionSchema.safeParse({type:'webhook',url:'http://example.test',body:'{}'}).success,false);
});
test('choice actions run in order with variables before routing and never leak into provider buttons',async()=>{
  const h=setup([{type:'set_field',key:'interest',value:'{{choice}}'},{type:'webhook',url:'https://example.test/hook',body:'{{contact.attributes.interest}}'}]);
  const state=newState();await h.engine.start(h.ctx,state);
  assert.deepEqual(h.sent[0].buttons,[{id:'stable-option',title:'برامج'}]);assert.equal(h.calls.length,0);
  h.ctx.lastMessage={text:'',replyId:'stable-option'};const result=await h.engine.resume(h.ctx,state);
  assert.equal(result.status,'completed');assert.equal(h.calls.length,2);
  assert.deepEqual(h.calls[0],{action:{type:'set_field',key:'interest',value:'برامج'},key:'welcome:option:stable-option:0'});
  assert.equal((h.calls[1].action as {body:string}).body,'برامج');
  await h.engine.resume(h.ctx,state);assert.equal(h.calls.length,2);
});
test('assignment stops the bot; unavailable executor and failed actions do not continue the flow',async()=>{
  const h=setup([{type:'assign'}]);const state=newState();await h.engine.start(h.ctx,state);h.ctx.lastMessage={text:'برامج'};
  assert.equal((await h.engine.resume(h.ctx,state)).status,'handed_off');assert.equal(h.sent.length,1);
  const fail=setup([{type:'tag',add:['a'],remove:[]}]);delete fail.deps.executeButtonAction;
  const s=newState();await fail.engine.start(fail.ctx,s);fail.ctx.lastMessage={text:'برامج'};
  assert.equal((await fail.engine.resume(fail.ctx,s)).status,'error');assert.equal(fail.sent.length,1);
});
test('collection completion actions run only after all validated answers',async()=>{
  const h=setup([]);h.graph.startNodeId='collect';h.graph.nodes=[{id:'collect',type:'user_input',data:{questions:[{id:'name',text:'الاسم؟',kind:'text',saveAs:'name'},{id:'email',text:'البريد؟',kind:'email',saveAs:'email'}],completionActions:[{type:'tag',add:['collected'],remove:[]}]},edges:{}}];
  const engine=new FlowEngine(h.graph,h.deps),s=newState();await engine.start(h.ctx,s);h.ctx.lastMessage={text:'هند'};await engine.resume(h.ctx,s);assert.equal(h.calls.length,0);
  h.ctx.lastMessage={text:'invalid'};await engine.resume(h.ctx,s);assert.equal(h.calls.length,0);
  h.ctx.lastMessage={text:'test@example.test'};assert.equal((await engine.resume(h.ctx,s)).status,'completed');assert.equal(h.calls.length,1);
});
