import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowActionsService } from './flow-actions.service';

test('durable action receipts deduplicate events, reject changed replays and isolate tenants', async () => {
  const receipts = new Map<string,string>(); const updates:string[]=[];
  const db={ withTenant:async(tenant:string,fn:any)=>fn({query:async(sql:string,p:any[])=>{
    if(sql.startsWith('INSERT INTO flow_action_receipts')) {const key=tenant+':'+p[1];if(receipts.has(key))return{rowCount:0,rows:[]};receipts.set(key,p[2]);return{rowCount:1,rows:[{}]};}
    if(sql.startsWith('SELECT request_hash'))return{rows:[{request_hash:receipts.get(tenant+':'+p[0])}]};
    if(sql.startsWith('UPDATE contacts'))updates.push(tenant);
    return{rowCount:1,rows:[{}]};
  }}) };
  const service=new FlowActionsService(db as any,{} as any,{} as any,{} as any);
  const scope={tenantId:'tenant-a',conversationId:'conv',contactId:'contact',eventId:'inbound-1'};
  const action={type:'set_field' as const,key:'interest',value:'umrah'};
  await service.execute(scope,action,'node:option:button:0');await service.execute(scope,action,'node:option:button:0');
  assert.deepEqual(updates,['tenant-a']);
  await assert.rejects(service.execute(scope,{...action,value:'changed'},'node:option:button:0'),/replay changed/);
  await service.execute({...scope,tenantId:'tenant-b'},action,'node:option:button:0');assert.deepEqual(updates,['tenant-a','tenant-b']);
  await assert.rejects(service.execute({...scope,eventId:undefined},action,'x'),/event ID/);
});

test('department assignments reject missing tenant membership before changing conversations',async()=>{
  let changed=false;
  const db={withTenant:async(_:string,fn:any)=>fn({query:async(sql:string)=>{if(sql.startsWith('UPDATE'))changed=true;return{rowCount:0,rows:[]};}})};
  const service=new FlowActionsService(db as any,{} as any,{} as any,{emit:()=>{}} as any);
  await assert.rejects(service.assign({tenantId:'a',contactId:'c',conversationId:'cv'},{departmentId:'other-tenant-department'}),/Department unavailable/);
  assert.equal(changed,false);
});
