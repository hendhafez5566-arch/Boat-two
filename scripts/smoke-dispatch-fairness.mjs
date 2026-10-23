import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const local = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { DatabaseService } = local('./dist/database/database.service.js');
const db = new DatabaseService();
const fixtureTenants = [];
// Run against an isolated migrated fixture DB with no active API/worker.
try {
  assert.equal(
    Number((await db.query('SELECT count(*) n FROM event_due(100)')).rows[0].n),
    0,
    'Use an isolated fixture DB without due events',
  );
  const a = randomUUID(),
    b = randomUUID();
  fixtureTenants.push(a, b);
  for (const tenant of [a, b])
    await db.withTenant(tenant, (c) =>
      c.query('INSERT INTO tenants(id,name,slug) VALUES($1::uuid,$2,$3)', [
        tenant,
        'Dispatch fairness fixture',
        tenant,
      ]),
    );
  await db.withTenant(a, (c) =>
    c.query(
      "INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) SELECT $1,'fixture.bulk',gen_random_uuid()::text,'{}',gen_random_uuid()::text FROM generate_series(1,1000)",
      [a],
    ),
  );
  const late = await db.withTenant(
    b,
    async (c) =>
      (
        await c.query(
          "INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES($1,'fixture.urgent','urgent','{}','urgent') RETURNING id",
          [b],
        )
      ).rows[0].id,
  );
  const due = (await db.query('SELECT * FROM event_due(2)')).rows;
  assert.equal(due.length, 2);
  assert.ok(
    due.some((x) => x.id === late),
    'Late tenant must appear in first two discoveries despite 1000 older bulk events',
  );
  assert.equal(due.filter((x) => x.tenant_id === a).length, 1);
  await db.withTenant(b, async (c) => {
    await c.query("UPDATE domain_events SET status='failed' WHERE id=$1", [late]);
    await c.query(
      "INSERT INTO domain_events(tenant_id,type,aggregate_id,payload,dedupe_key) VALUES($1,'fixture.must_wait','urgent','{}','later'),($1,'fixture.independent','other','{}','other')",
      [b],
    );
  });
  const second = (await db.query('SELECT * FROM event_due(2)')).rows;
  const types = await db.withTenant(b, async (c) =>
    (
      await c.query('SELECT type FROM domain_events WHERE id=ANY($1::uuid[])', [
        second.map((x) => x.id),
      ])
    ).rows.map((x) => x.type),
  );
  assert.deepEqual(types, ['fixture.independent']);
  console.log(
    'Dispatch fairness: 1000 earlier events cannot starve a later tenant in batch 2; failed aggregate predecessor still blocks its successor while independent work runs.',
  );
} finally {
  for (const tenant of fixtureTenants)
    await db.withTenant(tenant, (c) =>
      c.query("UPDATE domain_events SET status='completed' WHERE tenant_id=$1", [tenant]),
    );
  await db.onModuleDestroy();
}
