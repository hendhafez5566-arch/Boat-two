import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('only successful outbound employee replies stop SLA escalation', async () => {
 const pg=new PGlite();
 try {
  await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
   CREATE TABLE channels(id uuid PRIMARY KEY,tenant_id uuid,settings jsonb DEFAULT '{}');
   CREATE TABLE inbox_settings(tenant_id uuid,human_session_minutes int,sla_escalation_enabled boolean);
   CREATE TABLE departments(id uuid PRIMARY KEY,sla_minutes int);
   CREATE TABLE conversations(id uuid PRIMARY KEY,tenant_id uuid,channel_id uuid,department_id uuid,status text,handled_by text,human_since timestamptz,last_inbound_at timestamptz,last_message_at timestamptz,sla_escalated_at timestamptz);
   CREATE TABLE messages(conversation_id uuid,sender_type text,direction text,status text,is_internal boolean,created_at timestamptz);`);
  const tenant=randomUUID(),channel=randomUUID(),department=randomUUID(),expected:string[]=[];
  await pg.query("INSERT INTO channels VALUES($1,$2,'{}')",[channel,tenant]);
  await pg.query('INSERT INTO inbox_settings VALUES($1,1440,true)',[tenant]);
  await pg.query('INSERT INTO departments VALUES($1,1)',[department]);
  for(const [status,internal,direction] of [['failed',false,'out'],['queued',false,'out'],['sent',true,'out'],['sent',false,'in'],['sent',false,'out'],['delivered',false,'out'],['read',false,'out']] as const){
   const id=randomUUID();
   await pg.query("INSERT INTO conversations VALUES($1,$2,$3,$4,'open','human',now(),now()-interval '5 minutes',now(),NULL)",[id,tenant,channel,department]);
   await pg.query("INSERT INTO messages VALUES($1,'agent',$2,$3,$4,now())",[id,direction,status,internal]);
   if(status==='failed'||status==='queued'||internal||direction==='in')expected.push(id);
  }
  await pg.exec(readFileSync('src/database/migrations/104_channel_human_session_policy.sql','utf8'));
  assert.ok(!(await pg.query<{id:string}>('SELECT id FROM inbox_policy_due(50)')).rows.some(r=>r.id===expected[0]),'reproduces old failed-send suppression');
  const migration=readFileSync('src/database/migrations/111_sla_successful_reply.sql','utf8');
  await pg.exec(migration);await pg.exec(migration);
  assert.deepEqual(new Set((await pg.query<{id:string}>('SELECT id FROM inbox_policy_due(50)')).rows.map(r=>r.id)),new Set(expected));
  await pg.query('UPDATE conversations SET sla_escalated_at=now() WHERE id=$1',[expected[0]]);
  assert.ok(!(await pg.query<{id:string}>('SELECT id FROM inbox_policy_due(50)')).rows.some(r=>r.id===expected[0]));
 }finally{await pg.close();}
});
