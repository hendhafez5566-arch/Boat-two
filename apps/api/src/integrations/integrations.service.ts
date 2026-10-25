import {BadRequestException,Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {OnEvent} from '@nestjs/event-emitter';
import {createHmac} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {CryptoService} from '../messaging/crypto.service';
import {DomainEvent} from '../events/events.service';
import {env} from '../config/env';
import {safeHttpRequest} from '../flows/http-safe';
import {connectionSchema} from './contracts';
import {z} from 'zod';
import {providerRequest} from './provider-request';
@Injectable()
export class IntegrationsService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running=false;
 constructor(private db:DatabaseService,private crypto:CryptoService){}
 list(tenant:string){return this.db.withTenant(tenant,async c=>(await c.query('SELECT id,provider,name,config,status,enabled,updated_at FROM integration_connections ORDER BY provider,name')).rows);}
 create(tenant:string,input:z.infer<typeof connectionSchema>){return this.db.withTenant(tenant,async c=>(await c.query("INSERT INTO integration_connections(tenant_id,provider,name,credentials_enc,config) VALUES($1,$2,$3,$4,$5) RETURNING id,provider,name,status,enabled",[tenant,input.provider,input.name,this.crypto.encrypt({value:input.credential}),JSON.stringify(input.config)])).rows[0]);}
 async setEnabled(tenant:string,id:string,enabled:boolean){return this.db.withTenant(tenant,async c=>{const r=await c.query('UPDATE integration_connections SET enabled=$2,updated_at=now() WHERE id=$1 RETURNING id,enabled',[id,enabled]);if(!r.rowCount)throw new BadRequestException('Integration not found');return r.rows[0];});}
 update(tenant:string,id:string,input:{enabled?:boolean;config?:Record<string,unknown>;credential?:string;name?:string}){return this.db.withTenant(tenant,async c=>{const r=await c.query('UPDATE integration_connections SET enabled=COALESCE($2,enabled),config=config||COALESCE($3::jsonb,\'{}\'::jsonb),credentials_enc=COALESCE($4,credentials_enc),name=COALESCE($5,name),updated_at=now() WHERE id=$1 RETURNING id,enabled,config,name',[id,input.enabled??null,input.config?JSON.stringify(input.config):null,input.credential?this.crypto.encrypt({value:input.credential}):null,input.name??null]);if(!r.rowCount)throw new BadRequestException('Integration not found');return r.rows[0];});}
 async disconnect(tenant:string,id:string){return this.db.withTenant(tenant,c=>c.query("UPDATE integration_connections SET enabled=false,status='disconnected',credentials_enc=NULL,updated_at=now() WHERE id=$1",[id]).then(()=>({disconnected:true,remoteRevocation:false})));}
 async execute(tenant:string,id:string,payload:Record<string,unknown>,dryRun=true){
  const row=await this.db.withTenant(tenant,async c=>(await c.query('SELECT * FROM integration_connections WHERE id=$1',[id])).rows[0]);if(!row||!row.credentials_enc)throw new BadRequestException('Integration unavailable');
  if(['google','webhook'].includes(row.provider))throw new BadRequestException('Use the dedicated Google or webhook operation');
  const credential=this.crypto.decrypt<{value:string}>(row.credentials_enc).value;
  if(['mailchimp','brevo','activecampaign','mautic'].includes(row.provider)){
   if(typeof payload.contactId!=='string')throw new BadRequestException('Select a CRM contact with documented marketing consent');
   const contact=await this.db.withTenant(tenant,async c=>(await c.query("SELECT id,email,name FROM contacts WHERE id=$1 AND EXISTS(SELECT 1 FROM contact_consents s WHERE s.contact_id=contacts.id AND s.status='opted_in')",[payload.contactId])).rows[0]);
   if(!contact?.email)throw new BadRequestException('Contact requires email and explicit opted-in consent');payload={...payload,email:contact.email,name:contact.name};
  }
  const request=providerRequest(row.provider,row.config,credential,payload);
  if(dryRun)return{mock:true,delivered:false,request:{...request,headers:Object.fromEntries(Object.keys(request.headers).map(k=>[k,k==='Content-Type'?request.headers[k]:'[REDACTED]']))}};
  if(!row.enabled||env.EXTERNAL_DELIVERY_ENABLED!=='true')throw new BadRequestException('Explicit integration and external access enablement required');
  const result=await safeHttpRequest(request);if(!result.ok){if([401,403].includes(result.status))await this.db.withTenant(tenant,c=>c.query("UPDATE integration_connections SET status='needs_action',updated_at=now() WHERE id=$1",[id]));throw new BadRequestException(`Provider returned ${result.status}`);}await this.db.withTenant(tenant,c=>c.query("UPDATE integration_connections SET status='connected',updated_at=now() WHERE id=$1",[id]));
  const data=result.body as {contact?:{id?:string}};
  if(['activecampaign','mautic'].includes(row.provider)&&row.config.listId){
   const contactId=data.contact?.id;if(!contactId)throw new BadRequestException('Provider returned no contact ID');
   const follow=row.provider==='activecampaign'?{...request,url:String(row.config.url).replace(/\/$/,'')+'/api/3/contactLists',body:JSON.stringify({contactList:{list:String(row.config.listId),contact:contactId,status:1}})}:{...request,url:String(row.config.url).replace(/\/$/,'')+`/api/segments/${encodeURIComponent(String(row.config.listId))}/contact/${encodeURIComponent(contactId)}/add`,body:'{}'};
   const linked=await safeHttpRequest(follow);if(!linked.ok)throw new BadRequestException('Contact synchronized but list attachment failed; reconcile before retrying');
  }
  return{mock:false,delivered:true,data:result.body};
 }
 @OnEvent('domain.event',{suppressErrors:false}) async onEvent(event:DomainEvent){
  await this.db.withTenant(event.tenantId,async c=>{
   const endpoints=(await c.query("SELECT id FROM integration_connections WHERE provider='webhook' AND enabled AND config->'eventTypes' ? $1",[event.type])).rows;
   for(const endpoint of endpoints)await c.query('INSERT INTO integration_deliveries(tenant_id,connection_id,event_key,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[event.tenantId,endpoint.id,event.id,JSON.stringify({id:event.id,type:event.type,occurredAt:new Date().toISOString(),data:event.payload})]);
  });
 }
 onModuleInit(){if(process.env.NODE_ENV!=='test'){this.timer=setInterval(()=>void this.tick().catch(()=>undefined),2000);this.timer.unref();}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async tick(){if(this.running||env.EXTERNAL_DELIVERY_ENABLED!=='true')return;this.running=true;try{
  const due=await this.db.query('SELECT * FROM integration_due(20)');for(const item of due.rows){
   const job=await this.db.withTenant(item.tenant_id,async c=>{
    const row=(await c.query("SELECT j.*,i.config,i.credentials_enc,i.enabled FROM integration_deliveries j JOIN integration_connections i ON i.id=j.connection_id WHERE j.id=$1 FOR UPDATE OF j SKIP LOCKED",[item.id])).rows[0];if(!row)return null;
    if(row.status==='sending'){if(new Date(row.lease_until)>new Date())return null;await c.query("UPDATE integration_deliveries SET status='ambiguous',error='Lease expired after send began; reconcile before retry',updated_at=now() WHERE id=$1",[item.id]);return null;}
    if(row.status!=='pending'||!row.enabled)return null;await c.query("UPDATE integration_deliveries SET status='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=$1",[item.id]);return row;
   });if(!job)continue;
   let status='ambiguous',error:string|null=null;
   try{const secret=this.crypto.decrypt<{value:string}>(job.credentials_enc).value;const body=JSON.stringify(job.payload);const result=await safeHttpRequest({method:'POST',url:job.config.url,headers:{'Content-Type':'application/json','X-Boat-Event-ID':job.event_key,'Idempotency-Key':job.event_key,'X-Boat-Signature':'sha256='+createHmac('sha256',secret).update(body).digest('hex')},body,timeoutMs:15000});status=result.ok?'completed':'failed';if(!result.ok)error=`HTTP ${result.status}`;}catch{error='Outcome unknown; automatic replay refused';}
   await this.db.withTenant(item.tenant_id,c=>c.query('UPDATE integration_deliveries SET status=$2,error=$3,lease_until=NULL,updated_at=now() WHERE id=$1',[item.id,status,error]));
  }
 }finally{this.running=false;}}
 deliveries(tenant:string){return this.db.withTenant(tenant,async c=>(await c.query('SELECT id,connection_id,event_key,status,attempts,error,updated_at FROM integration_deliveries ORDER BY created_at DESC LIMIT 100')).rows);}
 retry(tenant:string,id:string,reconciled:boolean){return this.db.withTenant(tenant,async c=>{const r=await c.query("UPDATE integration_deliveries SET status='pending',error=NULL,available_at=now(),updated_at=now() WHERE id=$1 AND (status='failed' OR(status='ambiguous' AND $2)) RETURNING id",[id,reconciled]);if(!r.rowCount)throw new BadRequestException('Only failed or reconciled ambiguous deliveries may be retried');return{queued:true};});}
}
