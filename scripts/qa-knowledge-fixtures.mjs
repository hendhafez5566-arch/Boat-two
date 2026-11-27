// Only installed in the loopback full-app acceptance harness.
export function installKnowledgeFixtures(app,local){
 if(process.env.NODE_ENV!=='test'||process.env.BOAT_PREVIEW_ONLY!=='true'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false'||process.env.AI_PROVIDER_CALLS_ENABLED!=='false')throw Error('Isolated knowledge QA required');
 const {DatabaseService}=local('./dist/database/database.service');
 const {KnowledgeService}=local('./dist/ai/knowledge/knowledge.service');
 const {KnowledgeRetention}=local('./dist/ai/knowledge/retention');
 const {PlansService}=local('./dist/plans/plans.service');
 const {EventsService}=local('./dist/events/events.service');
 const {env}=local('./dist/config/env');
 const db=app.get(DatabaseService);
 const vector=Array(1536).fill(0);vector[0]=1;
 let calls=0;
 const worker=new KnowledgeService(db,app.get(PlansService),app.get(EventsService),{configured:true,embed:async(_tenant,texts)=>{calls++;return texts.map(()=>vector);}});
 app.getHttpAdapter().getInstance().post('/__qa/knowledge',async(req,res)=>{
  try{
   const {tenantId,jobId,sourceId,op,runId}=req.body;
   for(const id of [tenantId,jobId,sourceId,runId].filter(Boolean))if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Synthetic ID required');
   if(op==='process'){
    if(req.body.mockEmbeddings===true){env.AI_PROVIDER_CALLS_ENABLED='true';try{await worker.process({tenantId,jobId});}finally{env.AI_PROVIDER_CALLS_ENABLED='false';}}
    else await worker.process({tenantId,jobId});
    res.json({calls});
   }else if(op==='snapshot'){
    const state=await db.withTenant(tenantId,async c=>({source:(await c.query('SELECT id,status,revision,chunk_count,archived_at FROM knowledge_sources WHERE id=$1',[sourceId])).rows[0],chunks:(await c.query('SELECT content FROM knowledge_chunks WHERE source_id=$1 ORDER BY chunk_index',[sourceId])).rows,jobs:(await c.query('SELECT id,status,source_revision FROM knowledge_jobs WHERE source_id=$1 ORDER BY created_at,id',[sourceId])).rows}));
    res.json(state);
   }else if(op==='age'){
    await db.withTenant(tenantId,async c=>{await c.query("UPDATE knowledge_jobs SET updated_at=now()-interval '180 days' WHERE id=$1 AND status IN ('completed','canceled')",[jobId]);await c.query("UPDATE knowledge_extractions SET created_at=now()-interval '180 days' WHERE job_id=$1",[jobId]);});res.json({aged:true});
   }else if(op==='stale'){
    await db.withTenant(tenantId,c=>c.query("UPDATE knowledge_jobs SET status='failed' WHERE id=$1 AND status='canceled'",[jobId]));res.json({fixture:true});
   }else if(op==='retention'){
    await app.get(KnowledgeRetention).process({tenantId,id:runId});res.json({processed:true});
   }else throw Error('Unsupported isolated operation');
  }catch(e){res.status(400).json({error:e.message});}
 });
}
