import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const { DatabaseService } = require('./dist/database/database.service.js');
const db = new DatabaseService();
const base = process.env.SMOKE_API_URL || 'http://localhost:4119';
const url = new URL(process.env.DATABASE_ADMIN_URL);
url.searchParams.set('options', '-c role=boat_platform');
const privileged = new Client({ connectionString: url.toString() });
try {
  await privileged.connect();
  const prefix = randomUUID();
  let token;
  for (let i = 0; i < 3; i++) {
    const response = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `directory-${prefix}-${i}@example.test`,
        password: randomBytes(20).toString('hex'),
        fullName: 'Directory ' + prefix,
        workspaceName: `Directory ${prefix} ${i}`,
      }),
    });
    assert.equal(response.status, 201);
    token = (await response.json()).accessToken;
  }
  await assert.rejects(
    () => db.query("SELECT platform_directory('companies','',1,10)"),
    /permission denied/,
  );
  for (const kind of ['companies', 'users']) {
    const first = (
        await privileged.query('SELECT platform_directory($1,$2,1,2) AS data', [kind, prefix])
      ).rows[0].data,
      second = (
        await privileged.query('SELECT platform_directory($1,$2,2,2) AS data', [kind, prefix])
      ).rows[0].data;
    assert.equal(first.total, 3);
    assert.equal(first.items.length, 2);
    assert.equal(second.items.length, 1);
    assert.ok(!first.items.some((row) => row.id === second.items[0].id));
    assert.ok(!JSON.stringify(first).includes('password_hash'));
  }
  assert.equal(
    (
      await privileged.query('SELECT platform_directory($1,$2,1,10) AS data', [
        'companies',
        "' OR 1=1 --",
      ])
    ).rows[0].data.total,
    0,
  );
  await assert.rejects(
    () => privileged.query('SELECT platform_directory($1,$2,0,1000)', ['users', '']),
    /Invalid directory query/,
  );
  const denied = await fetch(base + '/platform/directory?kind=companies', {
    headers: { Authorization: 'Bearer ' + token },
  });
  assert.equal(denied.status, 403);
  console.log(
    'PASS platform directory: literal search, stable paged company/user results, bounded inputs, no password exposure, app-role SQL denial and tenant-token HTTP denial. Platform administration remains operator-disabled.',
  );
} finally {
  await privileged.end();
  await db.onModuleDestroy();
}
