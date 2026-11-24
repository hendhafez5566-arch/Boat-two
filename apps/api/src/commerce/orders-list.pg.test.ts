import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('order totals are tenant-wide and search and status filter before pagination', async () => {
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'isolated-order-list-test-secret',
    ENCRYPTION_KEY: '0'.repeat(64),
  });
  const { CommerceService } = await import('./commerce.service');
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE ROLE app_user;
      CREATE TABLE users (id uuid PRIMARY KEY, full_name text, disabled_at timestamptz);
      CREATE TABLE memberships (tenant_id text, user_id uuid);
      CREATE TABLE contacts (id int, tenant_id text, name text);
      CREATE TABLE commerce_orders (
        id int, tenant_id text, contact_id int,
        status text CHECK (status IN ('new','confirmed','completed','cancelled')), snapshot jsonb,
        request jsonb, created_at timestamptz DEFAULT now()
      );
      CREATE TABLE commerce_order_events (
        id serial PRIMARY KEY, tenant_id text, order_id int, actor_id text,
        status text CHECK (status IN ('new','confirmed','completed','cancelled')), created_at timestamptz DEFAULT now()
      );
      CREATE TABLE commerce_order_documents (tenant_id text, order_id int);
      INSERT INTO users VALUES ('11111111-1111-4111-8111-111111111111', 'Assignee', NULL),
        ('22222222-2222-4222-8222-222222222222', 'Other tenant', NULL);
      INSERT INTO memberships VALUES ('tenant-a', '11111111-1111-4111-8111-111111111111'),
        ('tenant-b', '22222222-2222-4222-8222-222222222222');
      INSERT INTO contacts VALUES (1, 'tenant-a', 'آية'), (1, 'tenant-b', 'Hidden customer');
      INSERT INTO commerce_orders (id, tenant_id, contact_id, status, snapshot)
      SELECT id, 'tenant-a', 1, 'new', '{"name":"Tour"}' FROM generate_series(1, 55) AS id;
      INSERT INTO commerce_orders (id, tenant_id, contact_id, status, snapshot) VALUES
        (56, 'tenant-a', 1, 'confirmed', '{"name":"Service 100%","documents":[]}'),
        (57, 'tenant-b', 1, 'new', '{"name":"Hidden tour"}');
    `);
    await pg.exec(readFileSync('src/database/migrations/119_commerce_order_workflow.sql', 'utf8'));
    const db = {
      withTenant: (_tenant: string, fn: (db: PGlite) => Promise<unknown>) => pg.transaction((tx) => fn(tx as unknown as PGlite)),
    };
    const service = new CommerceService(db as never, {} as never, {} as never);
    const counts = await service.orderSummary('tenant-a');
    assert.deepEqual(Object.fromEntries(counts.map(({ status, count }) => [status, count])), {
      new: '55', confirmed: '1',
    });
    assert.equal((await service.orders('tenant-a', 1)).length, 51);
    assert.equal((await service.orders('tenant-a', 2, 'tOuR', 'new')).length, 5);
    assert.equal((await service.orders('tenant-a', 1, 'آية', 'confirmed')).length, 1);
    assert.equal((await service.orders('tenant-a', 1, '%')).length, 1);
    assert.deepEqual(await service.orders('tenant-a', 1, 'Hidden'), []);
    await assert.rejects(service.assignOrder('tenant-a', '56', '22222222-2222-4222-8222-222222222222'), /Assignee unavailable/);
    await service.assignOrder('tenant-a', '56', '11111111-1111-4111-8111-111111111111');
    assert.equal((await service.orders('tenant-a', 1, '', 'confirmed'))[0].assignee_name, 'Assignee');
    await service.changeOrderStatus('tenant-a', 'actor', '56', 'documents_required');
    await assert.rejects(service.changeOrderStatus('tenant-a', 'actor', '56', 'completed'), /Invalid order transition/);
    await service.changeOrderStatus('tenant-a', 'actor', '56', 'processing');
    await service.changeOrderStatus('tenant-a', 'actor', '56', 'completed');
    assert.equal((await service.orderHistory('tenant-a', '56')).length, 3);
    await service.assignOrder('tenant-a', '56', null);
    assert.equal((await service.orders('tenant-a', 1, '', 'completed'))[0].assigned_to, null);
  } finally {
    await pg.close();
  }
});
