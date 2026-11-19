import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlowEngine} from './engine';
import {EngineDeps,FlowGraph,newState,OutContent} from './types';
async function run(bookAppointment:EngineDeps['bookAppointment']){
 const sent:OutContent[]=[];
 const state=newState();state.vars.booking={id:'stale-booking'};state.vars.appointment_error='Previous failure';
 const graph:FlowGraph={startNodeId:'book',nodes:[
  {id:'book',type:'appointment',data:{serviceId:'service',start:'2030-01-01T10:00:00Z',saveAs:'booking'},edges:{success:'ok',unavailable:'busy',error:'error'}},
  {id:'ok',type:'message',data:{text:'Booked {{booking.id}}'},edges:{}},
  {id:'busy',type:'message',data:{text:'Choose another slot'},edges:{}},
  {id:'error',type:'message',data:{text:'Ask staff'},edges:{}},
 ]};
 const deps:EngineDeps={bookAppointment,ai:async()=>({text:'',handoff:false}),send:async c=>{sent.push(c);},http:async()=>({status:200,ok:true,body:{}}),setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{},now:()=>new Date(),random:()=>0};
 const result=await new FlowEngine(graph,deps).start({contact:{attributes:{}},channel:{type:'web'},lastMessage:{text:''}},state);
 return {result,sent,state};
}
test('missing booking adapter uses configured error output and clears stale booking',async()=>{
 const {result,sent,state}=await run(undefined);
 assert.equal(result.status,'completed');assert.deepEqual(sent,[{text:'Ask staff'}]);assert.equal(state.vars.booking,undefined);
});
test('unavailable appointment cannot retain an earlier successful booking',async()=>{
 let calls=0;const {result,sent,state}=await run(async()=>{calls++;throw new Error('Slot unavailable');});
 assert.equal(result.status,'completed');assert.equal(calls,1);assert.deepEqual(sent,[{text:'Choose another slot'}]);assert.equal(state.vars.booking,undefined);
});
test('successful appointment replaces old booking and clears previous failure',async()=>{
 const {result,sent,state}=await run(async()=>({id:'new-booking'}));
 assert.equal(result.status,'completed');assert.deepEqual(sent,[{text:'Booked new-booking'}]);assert.deepEqual(state.vars.booking,{id:'new-booking'});assert.equal(state.vars.appointment_error,undefined);
});
