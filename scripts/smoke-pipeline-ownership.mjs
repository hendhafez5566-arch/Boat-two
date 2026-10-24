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
  const a = await fixture(), b = await fixture();
  const { CrmController } = require('./dist/business/crm.controller.js');
  const crm = new CrmController({ db });
  const pipeline = await crm.pipeline(a, { name: 'Ownership fixture', stages: ['New','Done'] });
  let contact;
  await db.withTenant(a.user.tenantId, async c => {
    contact = (await c.query("INSERT INTO contacts(tenant_id,name) VALUES($1,'Ownership contact') RETURNING id", [a.user.tenantId])).rows[0].id;
    await c.query("INSERT INTO crm_deals(tenant_id,contact_id,pipeline_id,title,stage,value_cents,owner_id,status) VALUES($1,$2,$3,'Open','New',100,NULL,'open'),($1,$2,$3,'Closed','Done',100,NULL,'won')", [a.user.tenantId,contact,pipeline.id]);
  });
  const assigned = await crm.reassignPipeline(a,pipeline.id,{ ownerId:a.user.userId,revision:1,transferOpenDeals:true });
  assert.equal(assigned.transferred,1);
  await assert.rejects(crm.reassignPipeline(a,pipeline.id,{ ownerId:null,revision:1 }));
  await assert.rejects(crm.reassignPipeline(a,pipeline.id,{ ownerId:b.user.userId,revision:2 }));
  await assert.rejects(crm.reassignPipeline(b,pipeline.id,{ ownerId:null,revision:2 }));
  const unassigned = await crm.reassignPipeline(a,pipeline.id,{ ownerId:null,revision:2 });
  assert.equal(unassigned.transferred,0);
  await db.withTenant(a.user.tenantId, async c => {
    const rows = (await c.query('SELECT title,owner_id FROM crm_deals WHERE pipeline_id=$1 ORDER BY title',[pipeline.id])).rows;
    assert.equal(rows[0].owner_id,null); assert.equal(rows[1].owner_id,a.user.userId);
    assert.ok((await c.query("SELECT 1 FROM audit_logs WHERE resource_type='crm_pipelines' AND resource_id=$1",[pipeline.id])).rowCount);
  });
  console.log('Pipeline ownership: explicit open-deal transfer, closed-deal preservation, no implicit transfer, revision/member/tenant denial and audit passed.');
} finally { await db.onModuleDestroy(); }
