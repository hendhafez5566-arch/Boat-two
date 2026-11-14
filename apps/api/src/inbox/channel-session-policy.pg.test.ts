import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { InboxPolicyService } from './inbox-policy.service';
import { humanSessionMinutes } from '../messaging/bot-runtime-settings';

test('channel human expiry uses the real SQL due function and Inbox worker with tenant RLS', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE channels(id uuid PRIMARY KEY,tenant_id uuid,settings jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE inbox_settings(tenant_id uuid PRIMARY KEY,human_session_minutes int,sla_escalation_enabled boolean,escalation_user_id uuid);
      CREATE TABLE departments(id uuid PRIMARY KEY,tenant_id uuid,sla_minutes int);
      CREATE TABLE conversations(id uuid PRIMARY KEY,tenant_id uuid,channel_id uuid,department_id uuid,
        status text,handled_by text,human_since timestamptz,last_inbound_at timestamptz,last_message_at timestamptz,
        assigned_to uuid,sla_escalated_at timestamptz);
      CREATE TABLE messages(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,conversation_id uuid,channel_id uuid,
        direction text,sender_type text,type text,content jsonb,status text,is_internal boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE memberships(tenant_id uuid,user_id uuid);
      GRANT USAGE ON SCHEMA public TO app_user;
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO app_user;`);
    for (const table of ['channels','inbox_settings','departments','conversations','messages','memberships'])
      await pg.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_only ON ${table} USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);`);
    const migration = readFileSync('src/database/migrations/104_channel_human_session_policy.sql','utf8');
    await pg.exec(migration);
    // Applying again is safe and does not change stored conversations/settings.
    await pg.exec(migration);
    const tenants = [randomUUID(), randomUUID()];
    const cvIds: string[] = [];
    for (const tenant of tenants) {
      await pg.query('INSERT INTO inbox_settings VALUES($1,60,false,NULL)',[tenant]);
      for (const settings of [
        {botManagerActive:{sharedInbox:{humanSessionExpiryMinutes:5}}},
        {},
        {botManager:{sharedInbox:{humanSessionExpiryMinutes:1}}},
        {botManagerActive:{sharedInbox:{humanSessionExpiryMinutes:'invalid'}}},
      ]) {
        const channel=randomUUID(), cv=randomUUID();cvIds.push(cv);
        await pg.query('INSERT INTO channels VALUES($1,$2,$3)',[channel,tenant,JSON.stringify(settings)]);
        await pg.query(`INSERT INTO conversations(id,tenant_id,channel_id,status,handled_by,human_since,last_message_at)
          VALUES($1,$2,$3,'open','human',now()-interval '10 minutes',now())`,[cv,tenant,channel]);
      }
    }
    const due=await pg.query<{id:string;tenant_id:string}>('SELECT * FROM inbox_policy_due(50)');
    assert.deepEqual(new Set(due.rows.map(r=>r.id)),new Set([cvIds[0],cvIds[4]]));
    const db = {
      query: (sql:string) => pg.query(sql),
      conversation: async (_tenant:string,_id:string,fn:()=>Promise<unknown>)=>fn(),
      withTenant: async (tenant:string,fn:(c:unknown)=>Promise<unknown>)=>pg.transaction(async tx=>{
        await tx.exec('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
        return fn({query:async(sql:string,args:unknown[]=[])=>{
          const r=await tx.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};
        }});
      }),
    };
    await new InboxPolicyService(db as never).tick();
    const rows=await pg.query<{id:string;handled_by:string}>('SELECT id,handled_by FROM conversations');
    for (const row of rows.rows) assert.equal(row.handled_by,[cvIds[0],cvIds[4]].includes(row.id)?'bot':'human');
    const messages=await pg.query<{tenant_id:string;conversation_id:string;is_internal:boolean;content:{event:string}}>('SELECT * FROM messages');
    assert.equal(messages.rows.length,2);
    for(const row of messages.rows){
      assert.equal(row.content.event,'human_session_expired');assert.equal(row.is_internal,true);
      assert.equal(row.tenant_id,row.conversation_id===cvIds[0]?tenants[0]:tenants[1]);
    }
    await new InboxPolicyService(db as never).tick();
    assert.equal((await pg.query('SELECT * FROM messages')).rows.length,2);
  } finally {await pg.close();}
});

test('runtime expiry fallback rejects unverified zero, malformed and out-of-range overrides',()=>{
  for(const value of [undefined,null,0,-1,525601,1.5,'5'])
    assert.equal(humanSessionMinutes({botManagerActive:{sharedInbox:{humanSessionExpiryMinutes:value}}},60),60);
  assert.equal(humanSessionMinutes({botManagerActive:{sharedInbox:{humanSessionExpiryMinutes:5}}},60),5);
  assert.equal(humanSessionMinutes({botManager:{sharedInbox:{humanSessionExpiryMinutes:5}}},60),60);
});
