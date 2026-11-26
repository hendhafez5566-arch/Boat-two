import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('order stages reuse one CRM task, enforce eligibility and preserve history', async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'isolated-order-flow-test-secret',
    ENCRYPTION_KEY: '0'.repeat(64),
  });
  const { OrderWorkflowsService } = await import('./order-workflows.service');
  const pg = new PGlite();
  const tenant = '10000000-0000-4000-8000-000000000001';
  const otherTenant = '10000000-0000-4000-8000-000000000002';
  const employee = '20000000-0000-4000-8000-000000000001';
  const backup = '20000000-0000-4000-8000-000000000002';
  const department = '30000000-0000-4000-8000-000000000001';
  const order = '40000000-0000-4000-8000-000000000001';
  try {
    await pg.exec(`
      CREATE ROLE app_user;
      CREATE TABLE tenants (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY, full_name text, disabled_at timestamptz);
      CREATE TABLE memberships (tenant_id uuid,user_id uuid,available boolean,role text);
      CREATE TABLE departments (id uuid,tenant_id uuid,archived_at timestamptz);
      CREATE TABLE department_members (tenant_id uuid,department_id uuid,user_id uuid);
      CREATE TABLE commerce_orders (id uuid,tenant_id uuid,contact_id uuid,status text, UNIQUE(tenant_id,id));
      CREATE TABLE contacts (id uuid,tenant_id uuid,owner_id uuid,lifecycle text,updated_at timestamptz, UNIQUE(tenant_id,id));
      CREATE TABLE conversations (id uuid,contact_id uuid,tenant_id uuid,assigned_to uuid,status text,archived_at timestamptz);
      CREATE TABLE domain_events (tenant_id uuid,type text,aggregate_id text,payload jsonb,dedupe_key text,UNIQUE(tenant_id,dedupe_key));
      CREATE TABLE crm_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,contact_id uuid,
        title text,due_at timestamptz,assigned_to uuid,priority text,status text DEFAULT 'open',updated_at timestamptz DEFAULT now());
      CREATE TABLE crm_notifications (tenant_id uuid,user_id uuid,kind text,resource_type text,resource_id uuid,
        contact_id uuid,title text,priority text,dedupe_key text, UNIQUE(tenant_id,user_id,dedupe_key));
      INSERT INTO tenants VALUES ('${tenant}'),('${otherTenant}');
      INSERT INTO users VALUES ('${employee}','Sales',NULL),('${backup}','Backup',NULL);
      INSERT INTO memberships VALUES ('${tenant}','${employee}',true,'agent'),('${tenant}','${backup}',true,'admin');
      INSERT INTO departments VALUES ('${department}','${tenant}',NULL);
      INSERT INTO department_members VALUES ('${tenant}','${department}','${employee}'),('${tenant}','${department}','${backup}');
      INSERT INTO commerce_orders VALUES ('${order}','${tenant}',gen_random_uuid(),'new');
    `);
    await pg.exec(readFileSync('src/database/migrations/123_order_workflows.sql','utf8'));
    await pg.exec(readFileSync('src/database/migrations/124_workflow_sources.sql','utf8'));
    await pg.exec(readFileSync('src/database/migrations/125_workflow_maintenance.sql','utf8'));
    const context = new AsyncLocalStorage<PGlite>();
    const db = { withTenant: (scope: string, fn: (db: PGlite) => Promise<unknown>) => {
      const tx = context.getStore();
      if (tx) return fn(tx);
      return pg.transaction(async tx => {
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [scope]);
        return context.run(tx as unknown as PGlite, () => fn(tx as unknown as PGlite));
      });
    } };
    const service = new OrderWorkflowsService(db as never);
    const stage = { userId: null, departmentId: department, method: 'rotation', minutes: 30, priority: 'high', autoAdvance: false } as const;
    const { id } = await service.save(tenant, { name: 'Test booking', stages: [
      { ...stage, name: 'Sales' },
      { ...stage, name: 'Documents', autoAdvance: true },
      { ...stage, name: 'Accounting', method: 'least_busy' },
    ] });
    const start = { action: 'start', definitionId: id } as const;
    const first = await service.run(tenant, backup, order, start);
    assert.deepEqual(await service.run(tenant, backup, order, start), first);
    assert.equal((await service.state(tenant, order)).work.assigned_to, employee);
    await assert.rejects(service.run(otherTenant, backup, order, start), /Order unavailable/);
    await pg.query('UPDATE memberships SET available=false WHERE user_id=$1', [employee]);
    await service.run(tenant, backup, order, { action: 'reassign', revision: 1, userId: backup });
    await assert.rejects(service.run(tenant, backup, order, { action: 'advance', revision: 1 }), /Workflow changed/);
    await service.run(tenant, backup, order, { action: 'advance', revision: 2 });
    await assert.rejects(service.run(tenant, employee, order, { action: 'advance', revision: 3 }, true), /assigned employee/);
    await service.archive(tenant, id);
    assert.deepEqual(await service.list(tenant), []);
    await service.run(tenant, backup, order, { action: 'advance', revision: 3 }, true);
    await service.run(tenant, backup, order, { action: 'advance', revision: 4 });
    const { work } = await service.state(tenant, order);
    assert.equal(work.id, first.id);
    assert.equal(work.workflow.finished, true);
    assert.equal(work.status, 'done');
    assert.equal(work.workflow.history.length, 5);
    assert.equal((await pg.query('SELECT * FROM crm_notifications')).rows.length, 4);
    const contact = '50000000-0000-4000-8000-000000000001';
    const conversation = '60000000-0000-4000-8000-000000000001';
    await service.save(tenant, { name: 'Inbox intake', source: 'conversation', start_condition: 'unassigned',
      stages: [{ ...stage, name: 'Intake' }],
    });
    await pg.query("INSERT INTO contacts VALUES ($1,$2,NULL,'lead',now())", [contact, tenant]);
    await pg.query("INSERT INTO conversations VALUES ($1,$2,$3,NULL,'open',NULL)", [conversation, contact, tenant]);
    const { rows: [event] } = await pg.query<{ payload: Record<string, unknown> }>("SELECT payload FROM domain_events WHERE type='workflow.source.created'");
    const delivery = { id: '', tenantId: tenant, type: 'workflow.source.created', payload: event.payload };
    await service.handle(delivery);
    await service.handle(delivery);
    const inbox = (await service.state(tenant, conversation, 'conversation')).work;
    assert.equal(inbox.assigned_to, backup);
    assert.equal((await pg.query<{ assigned_to: string }>('SELECT assigned_to FROM conversations')).rows[0]?.assigned_to, backup);
    assert.equal((await pg.query('SELECT * FROM crm_tasks')).rows.length, 2);
    await pg.query('UPDATE memberships SET available=(user_id=$1)', [employee]);
    await service.handle({ ...delivery, type: 'workflow.maintenance', payload: { id: inbox.id } });
    assert.equal((await service.state(tenant, conversation, 'conversation')).work.assigned_to, employee);

    await pg.query("UPDATE crm_tasks SET due_at=now()-interval '35 minutes' WHERE id=$1", [inbox.id]);
    await pg.query('SELECT workflow_schedule_maintenance(100)');
    const maintenance = { ...delivery, type: 'workflow.maintenance', payload: { id: inbox.id } };
    await service.handle(maintenance);
    await service.handle(maintenance);
    const alerts = await pg.query<{ kind: string }>(
      "SELECT kind FROM crm_notifications WHERE resource_id=$1 AND kind<>'assigned' ORDER BY kind", [inbox.id],
    );
    assert.deepEqual(alerts.rows.map(row => row.kind), ['task_overdue','workflow_escalated']);
    const customerDefinition = await service.save(tenant, { name: 'Customer handover', source: 'contact',
      stages: [{ ...stage, name: 'Customer review' }],
    });
    await service.run(tenant, employee, contact, { action: 'start', definitionId: customerDefinition.id }, false, 'contact');
    assert.equal((await pg.query<{ owner_id: string }>('SELECT owner_id FROM contacts')).rows[0].owner_id, employee);
    const { rows: [originalTask] } = await pg.query<{ id: string }>(
      "INSERT INTO crm_tasks(tenant_id,contact_id,title,due_at) VALUES($1,$2,'Follow-up',now()) RETURNING id", [tenant, contact],
    );
    const taskDefinition = await service.save(tenant, { name: 'Follow-up stages', source: 'task', stages: [{ ...stage, name: 'Check' }] });
    assert.equal((await service.run(tenant, employee, originalTask.id,
      { action: 'start', definitionId: taskDefinition.id }, false, 'task')).id, originalTask.id);
    assert.equal((await pg.query('SELECT * FROM crm_tasks')).rows.length, 4);
  } finally {
    await pg.close();
  }
});
