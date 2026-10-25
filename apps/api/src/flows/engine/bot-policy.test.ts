import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlowEngine} from './engine';
import {EngineDeps,FlowGraph,FlowContext,newState,OutContent} from './types';
import {nextOpening} from './hours';
import {botPolicySchema} from '../flow-schemas';

function setup() {
  let now=new Date('2026-10-26T08:00:00Z');const sent:OutContent[]=[];
  const deps:EngineDeps={now:()=>now,random:()=>0.5,send:async c=>{sent.push(c);},ai:async()=>({text:'',handoff:false}),http:async()=>({ok:true,status:200,body:{}}),setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{}};
  const graph:FlowGraph={policy:{sessionHours:4,noMatchText:'اختر من القائمة',businessHours:{enabled:true,timezone:'UTC',schedule:{mon:[['09:00','17:00']]},offHoursText:'نعود خلال الدوام'}},startNodeId:'start',nodes:[{id:'start',type:'message',data:{text:'مرحبًا'},edges:{}}]};
  const ctx:FlowContext={contact:{attributes:{}},channel:{type:'test'},lastMessage:{text:'hello'}};
  return{sent,graph,ctx,deps,engine:new FlowEngine(graph,deps),setNow:(date:string)=>{now=new Date(date);}};
}
test('outside-hours starts defer to the next opening and execute the original start rather than its next edge',async()=>{
  const h=setup(),s=newState();const r=await h.engine.start(h.ctx,s);
  assert.equal(r.status,'waiting');assert.equal(r.waitKind,'delay');assert.equal(s.waiting?.startPending,true);assert.equal(r.waitUntil?.toISOString(),'2026-10-26T09:00:00.000Z');assert.equal(h.sent[0].text,'نعود خلال الدوام');
  h.setNow('2026-10-26T09:00:00Z');h.ctx.lastMessage={text:''};assert.equal((await h.engine.resumeDelay(h.ctx,s)).status,'completed');assert.equal(h.sent[1].text,'مرحبًا');
});
test('closed-hours answers remain waiting without saving or running actions',async()=>{
  const h=setup();h.graph.nodes=[{id:'start',type:'question',data:{text:'Email?',saveAs:'email',answerType:'email'},edges:{}}];
  const engine=new FlowEngine(h.graph,h.deps),s=newState();h.setNow('2026-10-26T10:00:00Z');await engine.start(h.ctx,s);h.setNow('2026-10-26T18:00:00Z');h.ctx.lastMessage={text:'test@example.test'};
  assert.equal((await engine.resume(h.ctx,s)).status,'waiting');assert.equal(s.vars.email,undefined);
});
test('opening calculation handles overnight ranges, timezone offsets and invalid policy input',()=>{
  assert.equal(nextOpening(new Date('2026-10-26T20:00:00Z'),'UTC',{mon:[['22:00','02:00']]})?.toISOString(),'2026-10-26T22:00:00.000Z');
  assert.equal(nextOpening(new Date('2026-10-26T08:00:00Z'),'Asia/Riyadh',{mon:[['12:07','14:00']]})?.toISOString(),'2026-10-26T09:07:00.000Z');
  assert.equal(botPolicySchema.safeParse({sessionHours:0}).success,false);
  assert.equal(botPolicySchema.safeParse({businessHours:{enabled:true,timezone:'Mars/Base',schedule:{}}}).success,false);
  assert.equal(botPolicySchema.safeParse({businessHours:{enabled:true,timezone:'UTC',schedule:{}}}).success,false);
});
