import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {FIRST_RESPONSE_SQL} from './first-response.sql';
test('response average is conversation based, tenant scoped, ignores notes/bots/failed sends and preserves empty null',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
 CREATE TABLE messages(tenant_id text,conversation_id int,created_at timestamptz,seq int,direction text,sender_type text,is_internal boolean,status text);
 ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
 CREATE POLICY tenant_only ON messages USING(tenant_id=current_setting('app.tenant_id'));
 GRANT SELECT ON messages TO app_user;
 INSERT INTO messages VALUES
 ('a',1,'2026-01-01 10:00Z',1,'in','contact',false,'received'),
 ('a',1,'2026-01-01 10:00:01Z',2,'out','agent',true,'sent'),
 ('a',1,'2026-01-01 10:00:02Z',3,'out','bot',false,'sent'),
 ('a',1,'2026-01-01 10:00:03Z',4,'out','agent',false,'failed'),
 ('a',1,'2026-01-01 10:01Z',5,'out','agent',false,'sent'),
 ('a',2,'2026-01-01 10:00Z',6,'in','contact',false,'received'),
 ('a',2,'2026-01-01 10:02Z',7,'out','agent',false,'delivered'),
 ('a',3,'2026-01-01 10:00Z',8,'in','contact',false,'received'),
 ('b',4,'2026-01-01 10:00Z',9,'in','contact',false,'received'),
 ('b',4,'2026-01-01 10:00:01Z',10,'out','agent',false,'sent');`);
 await pg.transaction(async tx=>{
 await tx.exec("SET LOCAL ROLE app_user; SET LOCAL app.tenant_id='a'");
 assert.deepEqual((await tx.query(FIRST_RESPONSE_SQL,['2026-01-01','2026-01-02'])).rows[0],{answered:2,unanswered:1,average_ms:90000});
 assert.deepEqual((await tx.query(FIRST_RESPONSE_SQL,['2000-01-01','2000-01-02'])).rows[0],{answered:0,unanswered:0,average_ms:null});
 });
 }finally{await pg.close();}
});
