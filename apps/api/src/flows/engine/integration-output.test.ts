import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FlowEngine} from './engine';
import {EngineDeps,FlowGraph,newState,OutContent} from './types';

async function run(type:'http_request'|'sheet_fetch',data:Record<string,unknown>,overrides:Partial<EngineDeps>={}) {
 const sent:OutContent[]=[];const state=newState();state.vars.result='STALE_RESULT';
 const graph:FlowGraph={startNodeId:'fetch',nodes:[
  {id:'fetch',type,data,edges:type==='http_request'?{success:'ok',error:'bad'}:{found:'ok',not_found:'bad',error:'bad'}},
  {id:'ok',type:'message',data:{text:'Result {{result}}'},edges:{}},
  {id:'bad',type:'message',data:{text:'Fallback {{result}}'},edges:{}},
 ]};
 const deps:EngineDeps={ai:async()=>({text:'',handoff:false}),send:async c=>{sent.push(c);},http:async()=>({status:200,ok:true,body:{value:'NEW_RESULT'}}),setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{},now:()=>new Date(),random:()=>0,...overrides};
 const result=await new FlowEngine(graph,deps).start({contact:{attributes:{}},channel:{type:'web'},lastMessage:{text:''}},state);
 return {result,sent,state};
}
const request={url:'https://example.test/{{result}}',method:'GET',saveAs:[{path:'value',variable:'result'}]};
const sheet={connectionId:'synthetic',spreadsheetId:'synthetic',range:'A:B',lookupColumn:'code',lookupValue:'{{result}}',saveAs:[{column:'value',variable:'result'}]};

test('non-success HTTP response clears mapped output rather than reusing a previous price',async()=>{
 const {result,sent,state}=await run('http_request',request,{http:async()=>({status:503,ok:false,body:{value:'ERROR_BODY'}})});
 assert.equal(result.status,'completed');assert.equal(state.vars.result,undefined);assert.deepEqual(sent,[{text:'Fallback '}]);
});
test('HTTP transport error clears mapped output',async()=>{
 const {sent,state}=await run('http_request',request,{http:async()=>{throw new Error('Synthetic timeout');}});
 assert.equal(state.vars.result,undefined);assert.deepEqual(sent,[{text:'Fallback '}]);
});
test('successful HTTP mapping resolves input before resetting the same output variable',async()=>{
 let url='';const {sent}=await run('http_request',request,{http:async spec=>{url=spec.url;return {status:200,ok:true,body:{value:'NEW_RESULT'}};}});
 assert.equal(url,'https://example.test/STALE_RESULT');assert.deepEqual(sent,[{text:'Result NEW_RESULT'}]);
});
test('sheet with no matching row clears mapped output',async()=>{
 const {sent,state}=await run('sheet_fetch',sheet,{readGoogleSheet:async()=> 'code,value\nOTHER,WRONG'});
 assert.equal(state.vars.result,undefined);assert.deepEqual(sent,[{text:'Fallback '}]);
});
test('sheet adapter failure clears mapped output',async()=>{
 const {sent,state}=await run('sheet_fetch',sheet,{readGoogleSheet:async()=>{throw new Error('Synthetic account unavailable');}});
 assert.equal(state.vars.result,undefined);assert.deepEqual(sent,[{text:'Fallback '}]);
});
test('invalid public sheet reference also clears mapped output',async()=>{
 const {sent,state}=await run('sheet_fetch',{...sheet,connectionId:undefined,url:'https://example.test/not-a-sheet'});
 assert.equal(state.vars.result,undefined);assert.deepEqual(sent,[{text:'Fallback '}]);
});
test('successful sheet lookup resolves input before resetting the same output variable',async()=>{
 const {sent}=await run('sheet_fetch',sheet,{readGoogleSheet:async()=> 'code,value\nSTALE_RESULT,NEW_RESULT'});
 assert.deepEqual(sent,[{text:'Result NEW_RESULT'}]);
});
