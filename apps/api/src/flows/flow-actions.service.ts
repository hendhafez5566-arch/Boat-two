import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { ExternalEffects } from '../events/external-effect';
import { SequencesService } from '../sequences/sequences.service';
import { ButtonAction } from './engine/types';
import { buttonActionSchema } from './flow-schemas';
import { safeHttpRequest } from './http-safe';
import {GoogleService} from '../integrations/google.service';
import {IntegrationsService} from '../integrations/integrations.service';
import {googleOperationSchema} from '../integrations/contracts';

export interface ActionScope { tenantId: string; contactId: string; conversationId: string; eventId?: string }

@Injectable()
export class FlowActionsService {
  constructor(private db: DatabaseService, private effects: ExternalEffects, private sequences: SequencesService, private events: EventEmitter2,private google?:GoogleService,private integrations?:IntegrationsService) {}

  async writeSystemField(scope:ActionScope,field:'name'|'email'|'phone',value:string){
    if(!['name','email','phone'].includes(field)||!value.trim()||value.length>200)throw new Error('Invalid system field');
    if(field==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error('Invalid email');
    if(field==='phone'&&!/^\+?[0-9]{7,15}$/.test(value))throw new Error('Invalid phone');
    await this.db.withTenant(scope.tenantId,async c=>{if(field!=='name'&&(await c.query(`SELECT 1 FROM contacts WHERE ${field}=$1 AND id<>$2 AND merged_into_id IS NULL LIMIT 1`,[value,scope.contactId])).rowCount)throw new Error('Another contact already uses this system field value');await c.query(`UPDATE contacts SET ${field}=$2,updated_at=now() WHERE id=$1`,[scope.contactId,value]);});
  }

  async assign(scope: ActionScope, opts: { userId?: string; departmentId?: string }) {
    await this.db.withTenant(scope.tenantId, async c => {
      if (opts.departmentId && !(await c.query('SELECT 1 FROM departments WHERE id=$1 AND archived_at IS NULL FOR SHARE', [opts.departmentId])).rowCount)
        throw new Error('Department unavailable in this workspace');
      if (opts.userId && !(await c.query('SELECT 1 FROM memberships WHERE user_id=$1', [opts.userId])).rowCount)
        throw new Error('Employee unavailable in this workspace');
      if (opts.userId && opts.departmentId && !(await c.query('SELECT 1 FROM department_members WHERE department_id=$1 AND user_id=$2', [opts.departmentId, opts.userId])).rowCount)
        throw new Error('Employee is not a member of the selected department');
      await c.query(`UPDATE conversations SET handled_by='human',status='open',
        assigned_to=CASE WHEN $3::uuid IS NOT NULL THEN $2::uuid ELSE COALESCE($2::uuid,assigned_to) END,
        department_id=COALESCE($3::uuid,department_id) WHERE id=$1`, [scope.conversationId, opts.userId ?? null, opts.departmentId ?? null]);
    });
    this.events.emit('conversation.handoff', { tenantId: scope.tenantId, conversationId: scope.conversationId });
  }

  async execute(scope: ActionScope, raw: ButtonAction, occurrence: string) {
    if (!scope.eventId) throw new Error('Durable button actions require an inbound event ID');
    const action = buttonActionSchema.parse(raw);
    const key = `${scope.conversationId}:${scope.eventId}:${occurrence}`;
    const hash = createHash('sha256').update(JSON.stringify(action)).digest('hex');
    await this.db.withTenant(scope.tenantId, async c => {
      const claim = await c.query('INSERT INTO flow_action_receipts(tenant_id,action_key,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING action_key', [scope.tenantId,key,hash]);
      if (!claim.rowCount) {
        const prior = (await c.query('SELECT request_hash FROM flow_action_receipts WHERE action_key=$1',[key])).rows[0];
        if (prior?.request_hash !== hash) throw new Error('Action replay changed input');
        return;
      }
      switch (action.type) {
        case 'integration': {
          const provider=(await c.query('SELECT provider FROM integration_connections WHERE id=$1 AND enabled',[action.connectionId])).rows[0];
          if(!provider||!this.google||!this.integrations)throw new Error('Enabled integration unavailable');
          const payload=JSON.parse(action.payload);
          await this.db.eventScope(`flow-action:${key}`,()=>this.effects.execute<unknown>(scope.tenantId,action,()=>provider.provider==='google'?this.google!.execute(scope.tenantId,action.connectionId,googleOperationSchema.parse(payload)):this.integrations!.execute(scope.tenantId,action.connectionId,{...payload,contactId:scope.contactId},false)));
          break;
        }
        case 'set_field':
          await c.query('UPDATE contacts SET attributes=attributes || jsonb_build_object($2::text,$3::text),updated_at=now() WHERE id=$1',[scope.contactId,action.key,action.value]); break;
        case 'tag':
          await c.query(`UPDATE contacts SET tags=(SELECT COALESCE(array_agg(DISTINCT t),'{}') FROM unnest(tags || $2::text[]) t WHERE NOT(t=ANY($3::text[]))),updated_at=now() WHERE id=$1`,[scope.contactId,action.add,action.remove]); break;
        case 'list':
          if (!(await c.query('SELECT 1 FROM contact_lists WHERE id=$1',[action.listId])).rowCount) throw new Error('List unavailable in this workspace');
          if (action.operation === 'add') await c.query('INSERT INTO contact_list_members(tenant_id,list_id,contact_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[scope.tenantId,action.listId,scope.contactId]);
          else await c.query('DELETE FROM contact_list_members WHERE list_id=$1 AND contact_id=$2',[action.listId,scope.contactId]);
          break;
        case 'sequence':
          if (action.operation === 'subscribe') await this.sequences.enroll(scope.tenantId,action.sequenceId,scope.contactId);
          else await this.sequences.stopForContact(scope.tenantId,action.sequenceId,scope.contactId,'button_action');
          break;
        case 'assign': await this.assign(scope,action); break;
        case 'webhook': {
          const result = await this.db.eventScope(`flow-action:${key}`, () => this.effects.execute(scope.tenantId,action, () => safeHttpRequest({ method:'POST',url:action.url,headers:{'Content-Type':'application/json','Idempotency-Key':key},body:action.body,timeoutMs:10000 })));
          if (!result.ok) throw new Error(`Button webhook returned ${result.status}`);
          break;
        }
      }
    });
  }
}
