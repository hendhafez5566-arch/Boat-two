// Loopback-only fixture installed by qa-full-api, never by production AppModule.
import {randomUUID} from 'node:crypto';
export function installSequenceWorkerFixtures(app,local){
 if(process.env.NODE_ENV!=='test'||process.env.EXTERNAL_DELIVERY_ENABLED!=='false'||process.env.BOAT_PREVIEW_ONLY!=='true')throw Error('Isolated sequence QA required');
 const {DatabaseService}=local('./dist/database/database.service');
 const {MessagingService}=local('./dist/messaging/messaging.service');
 const {SequencesService}=local('./dist/sequences/sequences.service');
 const db=app.get(DatabaseService);
 app.getHttpAdapter().getInstance().post('/__qa/sequence-worker',async(req,res)=>{
  try{
   const {tenantId,channelId,sequenceId,contactId,op}=req.body;
   for(const id of [tenantId,channelId,sequenceId,contactId].filter(Boolean))if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Synthetic IDs required');
   if(op==='receive'){
    const ch=await db.withTenant(tenantId,async c=>(await c.query("SELECT * FROM channels WHERE id=$1 AND type='facebook'",[channelId])).rows[0]);
    if(!ch)throw Error('Synthetic Facebook channel not found');
    const external= req.body.externalId||randomUUID();
    await app.get(MessagingService).receive(ch,{contactExternalId:external,contactName:'Synthetic sequence visitor',externalMessageId:randomUUID(),content:{text:'Synthetic reply'}});
    const linked=await db.withTenant(tenantId,async c=>(await c.query('SELECT contact_id FROM contact_channels WHERE channel_id=$1 AND external_id=$2',[channelId,external])).rows[0]);
    res.json({contactId:linked.contact_id,externalId:external});
   }else if(op==='tick'){
    await app.get(SequencesService).tick();res.json({processed:true});
   }else if(op==='snapshot'){
    const snapshot=await db.withTenant(tenantId,async c=>({
      enrollment:(await c.query('SELECT status,step_index,next_run_at,stop_reason,last_error FROM sequence_enrollments WHERE sequence_id=$1 AND contact_id=$2',[sequenceId,contactId])).rows[0]||null,
      messages:(await c.query("SELECT m.content,m.status,m.flow_node_id FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE m.flow_id=$1 AND cv.contact_id=$2 AND m.direction='out' ORDER BY m.seq",[sequenceId,contactId])).rows
    }));
    res.json(snapshot);
   }else throw Error('Unknown isolated operation');
  }catch(e){res.status(400).json({error:e.message});}
 });
}
