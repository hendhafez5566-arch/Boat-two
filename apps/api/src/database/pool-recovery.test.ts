import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgres://app:synthetic@localhost/isolated',REDIS_URL:'redis://localhost:6379',JWT_SECRET:'synthetic-recovery-test-secret-at-least-32',ENCRYPTION_KEY:'0'.repeat(64)});
test('both PostgreSQL pools handle idle connection loss without replaying queries or crashing',async()=>{
 const {DatabaseService}=await import('./database.service');const service=new DatabaseService();
 try{
  let queries=0;
  for(const pool of [(service as any).pool,(service as any).effectPool]){
   pool.query=()=>{queries++;throw Error('No replay allowed');};
   assert.doesNotThrow(()=>pool.emit('error',new Error('Synthetic idle socket interruption')));
   assert.equal(pool.options.connectionTimeoutMillis,5000);
  }
  assert.equal(queries,0);
 }finally{await service.onModuleDestroy();}
});
