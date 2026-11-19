import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowEngine } from './engine';
import { EngineDeps, FlowGraph, newState, OutContent, handlesFor } from './types';
import { validateGraph } from './validate';

async function run(enrollSequence: EngineDeps['enrollSequence'], fallback = true) {
 const sent: OutContent[] = [];
 const graph: FlowGraph = {startNodeId:'sequence',nodes:[
  {id:'sequence',type:'sequence',data:{sequenceId:'4dde68f1-859f-45fd-9f35-3fd3070b659f'},edges:{next:'success',...(fallback?{error:'fallback'}:{})}},
  {id:'success',type:'message',data:{text:'Enrolled'},edges:{}},
  {id:'fallback',type:'message',data:{text:'Ask a member of staff'},edges:{}},
 ]};
 const deps: EngineDeps = {ai:async()=>({text:"",handoff:false}),enrollSequence,send:async content=>{sent.push(content);},http:async()=>({status:200,ok:true,body:{}}),setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{},now:()=>new Date(),random:()=>0.5};
 const result=await new FlowEngine(graph,deps).start({contact:{attributes:{}},channel:{type:'web'},lastMessage:{text:'start'}},newState());
 return {result,sent,graph};
}

test('sequence failure executes its fallback once without success or retry',async()=>{
 let calls=0;
 const {result,sent}=await run(async()=>{calls++;throw new Error('Private provider diagnostic');});
 assert.equal(result.status,'completed');assert.equal(calls,1);
 assert.deepEqual(sent,[{text:'Ask a member of staff'}]);
});
test('missing sequence executor follows the same failure route',async()=>{
 const {result,sent}=await run(undefined);
 assert.equal(result.status,'completed');assert.deepEqual(sent,[{text:'Ask a member of staff'}]);
});
test('unhandled sequence failure is an explicit engine error',async()=>{
 const {result,sent}=await run(async()=>{throw new Error('Enrollment denied');},false);
 assert.equal(result.status,'error');assert.deepEqual(sent,[]);
});
test('new and already active enrollment both continue on the existing next connector',async()=>{
 for(const enrolled of [true,false]){
  let calls=0;const {result,sent}=await run(async()=>{calls++;return {enrolled};});
  assert.equal(result.status,'completed');assert.equal(calls,1);assert.deepEqual(sent,[{text:'Enrolled'}]);
 }
});
test('publication accepts sequence failure connectors and warns when unhandled',async()=>{
 assert.deepEqual(handlesFor({type:'sequence',data:{}}),['next','error']);
 const {graph}=await run(async()=>({enrolled:true}));
 assert.deepEqual(validateGraph(graph).errors,[]);
 delete graph.nodes[0].edges.error;
 assert.ok(validateGraph(graph).warnings.some(issue=>issue.nodeId==='sequence'&&issue.message.includes('error')));
});
