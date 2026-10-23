import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
const restrictedUrl = new URL(process.env.DATABASE_ADMIN_URL);
restrictedUrl.searchParams.set('options', '-c role=boat_platform');
const restricted = new Client({ connectionString: restrictedUrl.toString() });
const app = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await Promise.all([admin.connect(), restricted.connect(), app.connect()]);
  const actor = randomUUID(),
    tenant = randomUUID(),
    action = 'smoke.' + randomUUID();
  for (let i = 0; i < 3; i++)
    await admin.query(
      'INSERT INTO platform_audit_logs(actor_id,tenant_id,action,details) VALUES($1,$2,$3,$4)',
      [actor, tenant, action, JSON.stringify({ fixture: i })],
    );
  const query = 'SELECT platform_audit_page($1,$2,$3,$4,$5,$6,$7) AS data';
  const params = [
    actor,
    tenant,
    action,
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() + 86400000).toISOString(),
    null,
    2,
  ];
  const first = (await restricted.query(query, params)).rows[0].data;
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  const second = (await restricted.query(query, [...params.slice(0, 5), first.nextCursor, 2]))
    .rows[0].data;
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.ok(!first.items.some((row) => row.id === second.items[0].id));
  assert.equal(
    (await restricted.query(query, [randomUUID(), ...params.slice(1)])).rows[0].data.items.length,
    0,
  );
  assert.equal(
    (await restricted.query(query, [...params.slice(0, 2), "' OR 1=1 --", ...params.slice(3)]))
      .rows[0].data.items.length,
    0,
  );
  await assert.rejects(
    () => restricted.query(query, [...params.slice(0, 6), 501]),
    /Invalid audit query/,
  );
  await assert.rejects(() => app.query(query, params), /permission denied/);
  await assert.rejects(
    () => restricted.query('SELECT * FROM platform_audit_logs LIMIT 1'),
    /permission denied/,
  );
  console.log(
    'PASS platform audit: restricted paged reads, stable cursors, exact filters, bounded range/page, application-role denial and no direct table access.',
  );
} finally {
  await Promise.all([admin.end(), restricted.end(), app.end()]);
}
