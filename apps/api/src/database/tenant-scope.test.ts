import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseService} from './database.service';
test('ordinary and detached tenant transactions fail closed before connecting when tenant scope is missing',async()=>{
 const db=new DatabaseService();try{for(const tenant of [undefined,null,'','  ']){
  await assert.rejects(db.withTenant(tenant as never,async()=>{throw new Error('Must not run');}),/Tenant scope required/);
  await assert.rejects(db.detached(tenant as never,async()=>{throw new Error('Must not run');}),/Tenant scope required/);
 }}finally{await db.onModuleDestroy();}
});
