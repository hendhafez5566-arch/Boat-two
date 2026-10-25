import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
process.env.DATABASE_URL||='postgres://test:test@localhost/test';
process.env.REDIS_URL||='redis://localhost:6379';
process.env.JWT_SECRET||=randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY||=randomBytes(32).toString('hex');
test('catalog list keeps configured order, exact prices and stable IDs, and refuses missing products',async()=>{
 const {CommerceService}=await import('./commerce.service');
 const rows=[{id:'second',name:'Hotel',price_cents:'23450',currency:'EGP'},{id:'first',name:'Umrah',price_cents:'900719925474099',currency:'EGP'}];
 const db={withTenant:async(tenant:string,fn:(c:unknown)=>Promise<unknown>)=>{assert.equal(tenant,'tenant-a');return fn({query:async()=>({rows})});}};
 const service=new CommerceService(db as never,{} as never,{} as never);
 const content=await service.catalogContent('tenant-a',['first','second'],false,'Choose',true);
 assert.deepEqual(content.list?.sections[0].rows,[{id:'product:first',title:'Umrah',description:'9007199254740.99 EGP'},{id:'product:second',title:'Hotel',description:'234.50 EGP'}]);
 await assert.rejects(service.catalogContent('tenant-a',['first','second','missing'],false,'Choose',true),/unavailable/);
 await assert.rejects(service.catalogContent('tenant-a',['first','second'],true,'Native'),/approved provider catalog/);
});
