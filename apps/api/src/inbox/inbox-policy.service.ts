import {humanSessionMinutes} from '../messaging/bot-runtime-settings';
import {Injectable,OnModuleInit,OnModuleDestroy,Logger,Optional} from '@nestjs/common';
import {EventEmitter2,OnEvent} from '@nestjs/event-emitter';
import {DatabaseService} from '../database/database.service';
import {DomainEvent} from '../events/events.service';
@Injectable()
export class InboxPolicyService implements OnModuleInit,OnModuleDestroy{
 private timer?:NodeJS.Timeout;private running=false;private readonly log=new Logger(InboxPolicyService.name);constructor(private db:DatabaseService,@Optional() private events?:EventEmitter2){}
 onModuleInit(){if(process.env.NODE_ENV!=='test'){this.timer=setInterval(()=>void this.tick().catch(()=>undefined),30000);this.timer.unref();}}onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 @OnEvent('domain.event',{suppressErrors:false}) async onEvent(e:DomainEvent){if(e.type!=='message.status'||e.payload.status!=='failed'||typeof e.payload.messageId!=='string')return;await this.db.withTenant(e.tenantId,async c=>{const settings=(await c.query('SELECT delivery_error_tag FROM inbox_settings')).rows[0];if(!settings?.delivery_error_tag)return;if(!(await c.query("INSERT INTO flow_action_receipts(tenant_id,action_key,request_hash) VALUES($1,$2,'delivery-error-v1') ON CONFLICT DO NOTHING RETURNING action_key",[e.tenantId,'policy:delivery:'+e.id])).rowCount)return;await c.query("UPDATE contacts SET tags=ARRAY(SELECT DISTINCT unnest(tags||ARRAY[$2::text])),updated_at=now() WHERE id=(SELECT cv.contact_id FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE m.id=$1)",[e.payload.messageId,settings.delivery_error_tag]);});}
 async tick() {
  if(this.running)return;
  this.running=true;
  try {
   const due=await this.db.query('SELECT * FROM inbox_policy_due(50)');
   for(const item of due.rows) {
    try {
     const event=await this.db.conversation(item.tenant_id,item.id,()=>this.db.withTenant(item.tenant_id,async c=>{
      const row=(await c.query("SELECT cv.*,ch.settings AS channel_settings,s.human_session_minutes,s.sla_escalation_enabled,s.escalation_user_id,d.sla_minutes FROM conversations cv JOIN channels ch ON ch.id=cv.channel_id JOIN inbox_settings s ON s.tenant_id=cv.tenant_id LEFT JOIN departments d ON d.id=cv.department_id WHERE cv.id=$1 AND cv.status<>'closed' FOR UPDATE OF cv",[item.id])).rows[0];
      if(!row)return;
      const expiryMinutes=humanSessionMinutes(row.channel_settings,row.human_session_minutes);
      let event:string|undefined;
      let assignedTo:string|null=row.assigned_to;
      if(row.handled_by==='human'&&expiryMinutes>0&&row.human_since&&new Date(row.human_since).getTime()+expiryMinutes*60000<Date.now()) {
       await c.query("UPDATE conversations SET handled_by='bot',assigned_to=NULL WHERE id=$1",[item.id]);
       event='human_session_expired';assignedTo=null;
      } else if(row.handled_by==='human'&&row.sla_escalation_enabled&&row.sla_minutes>0&&row.last_inbound_at&&new Date(row.last_inbound_at).getTime()+row.sla_minutes*60000<Date.now()&&(!row.sla_escalated_at||new Date(row.sla_escalated_at)<new Date(row.last_inbound_at))) {
       if((await c.query("SELECT 1 FROM messages WHERE conversation_id=$1 AND sender_type='agent' AND NOT is_internal AND created_at>=$2 LIMIT 1",[item.id,row.last_inbound_at])).rowCount)return;
       const target=row.escalation_user_id&&(await c.query('SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND u.disabled_at IS NULL',[row.escalation_user_id])).rowCount?row.escalation_user_id:null;
       await c.query("UPDATE conversations SET assigned_to=COALESCE($2::uuid,assigned_to),sla_escalated_at=now() WHERE id=$1",[item.id,target]);
       event='sla_escalated';assignedTo=target??row.assigned_to;
       // Durable, deduplicated internal alerts, atomic with the escalation.
       await c.query(`INSERT INTO crm_notifications(tenant_id,user_id,kind,resource_type,resource_id,contact_id,title,priority,dedupe_key)
        SELECT $1,m.user_id,'awaiting_reply','conversation',$2,$3,'SLA escalation / تجاوز وقت الرد','high',$4
        FROM memberships m JOIN users u ON u.id=m.user_id
        WHERE u.disabled_at IS NULL AND (m.role IN ('owner','admin') OR m.user_id=$5::uuid)
        ON CONFLICT DO NOTHING`,[item.tenant_id,item.id,row.contact_id,'sla:'+item.id+':'+new Date(row.last_inbound_at).toISOString(),assignedTo]);
      }
      if(event)await c.query("INSERT INTO messages(tenant_id,conversation_id,channel_id,direction,sender_type,type,content,status,is_internal) SELECT tenant_id,id,channel_id,'out','system','event',$2::jsonb,'sent',true FROM conversations WHERE id=$1",[item.id,JSON.stringify({event,assignedTo})]);
      return event;
     }));
     if(event)this.events?.emit('conversation.updated',{tenantId:item.tenant_id,conversationId:item.id,reason:event});
    } catch {
     // One bad item must not starve unrelated tenants; its transaction remains retryable.
     this.log.warn('Inbox policy item failed; retained for the next recovery tick');
    }
   }
  } finally {this.running=false;}
 }
}
