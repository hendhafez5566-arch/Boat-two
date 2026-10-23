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
  const { AutomationService }=require('./dist/business/automation.service.js');
  const service=new AutomationService(db,{getTenantPlan:async()=>({features:{automations:true}})}, {}, {}, {});
  let source,target;
  await db.withTenant(a.user.tenantId,async c=>{
    target=(await c.query("INSERT INTO contacts(tenant_id,name) VALUES($1,'Canonical') RETURNING id",[a.user.tenantId])).rows[0].id;
    source=(await c.query("INSERT INTO contacts(tenant_id,name,merged_into_id,archived_at) VALUES($1,'Merged',$2,now()) RETURNING id",[a.user.tenantId,target])).rows[0].id;
  });
  const event={tenantId:a.user.tenantId,contactId:source,eventId:randomUUID(),actions:[{type:'tag',tag:'Recovered'},{type:'task',title:'Recovered task',delayMinutes:0}]};
  await service.followup(event);
  await db.withTenant(a.user.tenantId,async c=>{
    const rows=(await c.query('SELECT id,tags FROM contacts ORDER BY id')).rows;
    assert.deepEqual(rows.find(x=>x.id===target).tags,['Recovered']);
    assert.deepEqual(rows.find(x=>x.id===source).tags,[]);
    assert.equal((await c.query('SELECT contact_id FROM crm_tasks')).rows[0].contact_id,target);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='automation_followup_retarget'")).rows[0].n,1);
    await c.query('UPDATE contacts SET archived_at=now() WHERE id=$1',[target]);
  });
  await service.followup({...event,eventId:randomUUID()});
  await service.followup({...event,tenantId:b.user.tenantId,eventId:randomUUID()});
  await db.withTenant(a.user.tenantId,async c=>{
    assert.equal((await c.query('SELECT count(*)::int AS n FROM crm_tasks')).rows[0].n,1);
    await c.query('UPDATE contacts SET archived_at=NULL,merged_into_id=$2 WHERE id=$1',[target,source]);
  });
  await assert.rejects(service.followup({...event,eventId:randomUUID()}),/operator review/);
  console.log('Automation merge follow-up: canonical local actions/task, retained source, audit, archive/tenant suppression and cycle refusal passed.');
} finally { await db.onModuleDestroy(); }
