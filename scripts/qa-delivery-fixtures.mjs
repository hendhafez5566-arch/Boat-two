// Synthetic records only in the loopback, embedded database acceptance harness.
import {randomUUID as uuid} from 'node:crypto';
export function installDeliveryFixtures(app,local){
 if(process.env.NODE_ENV!=='test'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false'||process.env.BOAT_PREVIEW_ONLY!=='true')throw Error('Isolated delivery QA required');
 const {DatabaseService}=local('./dist/database/database.service');
 const {DeliveryBudget}=local('./dist/messaging/delivery-budget');
 const db=app.get(DatabaseService),budget=app.get(DeliveryBudget);
 app.getHttpAdapter().getInstance().post('/__qa/delivery',async(req,res)=>{
 try{
  const {op,tenantId,channelId,conversationId,accountId,jobId,channels}=req.body;
  for(const id of [tenantId,channelId,conversationId,accountId,jobId,...(channels||[])].filter(Boolean))if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Synthetic ID required');
  if(op==='seed'){
   const state=await db.withTenant(tenantId,async c=>{
    const jobs={};
    for(const [name,status] of [['confirmed','failed'],['uncertain','ambiguous'],['notSent','ambiguous'],['blocked','blocked']]){
     const m=(await c.query("INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status) VALUES($1,$2,$3,'out','system','text',$4,$5) RETURNING id",[tenantId,conversationId,channelId,JSON.stringify({text:'Synthetic '+name}),status==='failed'?'failed':'queued'])).rows[0];
     jobs[name]=(await c.query("INSERT INTO outbound_jobs(tenant_id,message_id,status,error,attempts,available_at) VALUES($1,$2,$3,$4,2,now()+interval '1 day') RETURNING id",[tenantId,m.id,status,'QA '+name])).rows[0].id;
    }
    const old=(await c.query("INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload,status,error,available_at,created_at) VALUES($1,'qa.old_failure',$2,$3,'{}','failed','literal_% failure',now()+interval '1 day',now()-interval '1 day') RETURNING id",[tenantId,uuid(),uuid()])).rows[0].id;
    await c.query("INSERT INTO domain_events(tenant_id,type,aggregate_id,dedupe_key,payload,status,available_at) SELECT $1,'qa.newer',n::text,$2||n::text,'{}','completed',now()+interval '1 day' FROM generate_series(1,31) n",[tenantId,uuid()]);
    return {jobs,old};
   });res.json(state);
  }else if(op==='snapshot'){
   const state=await db.withTenant(tenantId,async c=>({job:(await c.query('SELECT j.status,j.attempts,m.status AS message_status,m.external_id FROM outbound_jobs j JOIN messages m ON m.id=j.message_id WHERE j.id=$1',[jobId])).rows[0],audit:(await c.query("SELECT count(*)::int n FROM audit_logs WHERE resource_id=$1 AND action='delivery_reconciled'",[jobId])).rows[0].n}));res.json(state);
  }else if(op==='take'){res.json(await Promise.all(channels.map(id=>budget.take(tenantId,id,true))));}
  else if(op==='reset'){await db.withTenant(tenantId,async c=>{await c.query("UPDATE delivery_accounts SET next_send_at=now()-interval '1 second' WHERE id=$1",[accountId]);await c.query("UPDATE channel_delivery_policy SET next_send_at=now()-interval '1 second' WHERE account_id=$1",[accountId]);});res.json({reset:true});}
  else throw Error('Unsupported fixture');
 }catch(e){res.status(400).json({error:e.message});}
 });
}
