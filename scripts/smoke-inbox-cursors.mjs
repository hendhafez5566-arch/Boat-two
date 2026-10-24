import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = require('./dist/database/database.service.js');
const db = new DatabaseService();
const base = process.env.SMOKE_API_URL || 'http://localhost:4122';
async function fixture() {
  const res = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `snapshot-${randomUUID()}@example.test`, password: randomUUID()+randomUUID(), fullName: 'Snapshot fixture', workspaceName: 'Snapshot fixture' }) });
  assert.equal(res.status, 201); const data = await res.json();
  return { user: { tenantId: data.tenantId, userId: JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64url')).sub } };
}
try {
  const a=await fixture(),b=await fixture();
  const { InboxController }=require('./dist/inbox/inbox.controller.js');
  const inbox=new InboxController(db,{}, {}, {}, {});
  await db.withTenant(a.user.tenantId,async c=>{
    const channel=(await c.query("INSERT INTO channels(tenant_id,type,name,external_id,settings) VALUES($1,'web','Cursor fixture',$2,'{}') RETURNING id",[a.user.tenantId,randomUUID()])).rows[0].id;
    for(let i=0;i<9;i++){
      const contact=(await c.query("INSERT INTO contacts(tenant_id,name) VALUES($1,'Cursor contact') RETURNING id",[a.user.tenantId])).rows[0].id;
      await c.query("INSERT INTO conversations(tenant_id,channel_id,contact_id,last_message_at) VALUES($1,$2,$3,$4)",[a.user.tenantId,channel,contact,i<5?'2026-10-23T12:00:00.123456Z':'2026-10-23T12:00:00.123455Z']);
    }
  });
  const ids=[];let cursor;
  do {
    const page=await inbox.list(a,{limit:2,...(cursor?{cursor}:{}),q:'Cursor'});
    ids.push(...page.items.map(x=>x.id));cursor=page.nextCursor;
  } while(cursor);
  assert.equal(ids.length,9);assert.equal(new Set(ids).size,9);
  const first=await inbox.list(a,{limit:2});
  const decoded=JSON.parse(Buffer.from(first.nextCursor,'base64url'));
  assert.ok(decoded.at.endsWith('123456Z'));
  assert.equal((await inbox.list(b,{limit:2,cursor:first.nextCursor})).items.length,0);
  assert.throws(()=>inbox.list(a,{cursor:'not-valid-json'}));
  assert.equal((await inbox.list(a,{limit:2,before:'2026-10-23T13:00:00Z'})).items.length,2);
  console.log('Inbox tuple cursor: equal timestamps, microsecond precision, multi-page uniqueness/completeness, search, malformed cursor, tenant isolation and legacy before passed.');
} finally { await db.onModuleDestroy(); }
