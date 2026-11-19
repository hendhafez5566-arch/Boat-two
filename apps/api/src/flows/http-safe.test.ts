import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http, { IncomingMessage } from 'node:http';
import { test, TestContext } from 'node:test';
import { safeHttpRequest } from './http-safe';
import { EngineDeps, FlowGraph, HttpRequestSpec, newState, OutContent } from './engine/types';
import { FlowEngine } from './engine/engine';

function transport(t: TestContext, respond: (response: EventEmitter) => void) {
 let calls=0;
 t.mock.method(http,'request',((_url: URL,_options: unknown,callback:(response:IncomingMessage)=>void)=>{
  calls++;
  const response=Object.assign(new EventEmitter(),{statusCode:200,headers:{}});
  const request=Object.assign(new EventEmitter(),{
   write:()=>undefined,
   end:()=>queueMicrotask(()=>{callback(response as unknown as IncomingMessage);respond(response);}),
   destroy:(error:Error)=>queueMicrotask(()=>request.emit('error',error)),
  });
  return request;
 }) as unknown as typeof http.request);
 return ()=>calls;
}
const spec:HttpRequestSpec={method:'GET',url:'http://93.184.216.34/synthetic',headers:{},timeoutMs:1000};

test('aborted HTTP response settles as an error rather than leaving the flow pending',async t=>{
 transport(t,response=>response.emit('aborted'));
 const result=await Promise.race([
  safeHttpRequest(spec).then(()=> 'resolved',error=>(error as Error).message),
  new Promise<string>(resolve=>setTimeout(()=>resolve('STILL_PENDING'),200)),
 ]);
 assert.equal(result,'Response interrupted');
});

test('oversized partial bodies cannot resolve successfully',async t=>{
 transport(t,response=>{response.emit('data',Buffer.alloc(1024*1024+1));response.emit('end');});
 await assert.rejects(safeHttpRequest(spec),/Response too large/);
});

test('HTTP runtime rejects embedded credentials before creating a connection',async t=>{
 const calls=transport(t,response=>response.emit('end'));
 await assert.rejects(safeHttpRequest({...spec,url:'http://user:password@93.184.216.34/synthetic'}),/embedded credentials/);
 assert.equal(calls(),0);
});

test('response error events are consumed',async t=>{
 transport(t,response=>response.emit('error',new Error('Synthetic stream failure')));
 await assert.rejects(safeHttpRequest(spec),/Synthetic stream failure/);
});

test('normal bounded JSON response preserves the HTTP contract',async t=>{
 transport(t,response=>{response.emit('data',Buffer.from('{"value":42}'));response.emit('end');});
 assert.deepEqual(await safeHttpRequest(spec),{status:200,ok:true,body:{value:42},headers:{}});
});


test('interrupted HTTP transport takes the real engine error branch and completes the fallback',async t=>{
 const calls=transport(t,response=>response.emit('aborted'));
 const sent:OutContent[]=[];
 const graph:FlowGraph={startNodeId:'http',nodes:[
  {id:'http',type:'http_request',data:{url:spec.url,method:'GET'},edges:{success:'wrong',error:'fallback'}},
  {id:'fallback',type:'message',data:{text:'Fallback {{http.status}}/{{http.ok}}'},edges:{next:'end'}},
  {id:'wrong',type:'message',data:{text:'MUST NOT RUN'},edges:{next:'end'}},
  {id:'end',type:'end',data:{},edges:{}},
 ]};
 const deps:EngineDeps={send:async c=>{sent.push(c);},http:safeHttpRequest,setContactAttribute:async()=>{},updateTags:async()=>{},addNote:async()=>{},handoff:async()=>{},closeConversation:async()=>{},now:()=>new Date(),random:()=>0.5,ai:async()=>({text:'',handoff:false})};
 const result=await new FlowEngine(graph,deps).start({contact:{attributes:{}},channel:{type:'web'},lastMessage:{text:'Start'}},newState());
 assert.equal(result.status,'completed');assert.equal(calls(),1);
 assert.deepEqual(sent.map(c=>c.text),['Fallback 0/false']);
});
