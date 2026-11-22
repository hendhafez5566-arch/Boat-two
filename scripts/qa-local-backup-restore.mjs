import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';

const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PGlite } = requireApi('@electric-sql/pglite');
const { pgcrypto } = requireApi('@electric-sql/pglite/contrib/pgcrypto');
const { vector } = requireApi('@electric-sql/pglite-pgvector');
const extensions = { vector, pgcrypto };
const source = new PGlite({ extensions });
const migrations = new URL('../apps/api/src/database/migrations/', import.meta.url);
const tenantIds = [];
let backup;
try {
  await source.exec('CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS');
  for (const name of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    await source.transaction((tx) => tx.exec(readFileSync(new URL(name, migrations), 'utf8')));
  }
  for (const label of ['A', 'B']) {
    const { rows: [tenant] } = await source.query(
      'INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING id',
      ['Synthetic company ' + label, 'restore-test-' + label.toLowerCase()],
    );
    tenantIds.push(tenant.id);
    await source.query('INSERT INTO contacts(tenant_id,name) VALUES($1,$2)', [tenant.id, 'Synthetic customer ' + label]);
  }
  backup = await source.dumpDataDir();
} finally {
  await source.close();
}
const restored = new PGlite({ extensions, loadDataDir: backup });
try {
  assert.equal((await restored.query('SELECT count(*)::int AS total FROM contacts')).rows[0].total, 2);
  for (const [index, id] of tenantIds.entries()) {
    await restored.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE app_user');
      await tx.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
      const { rows } = await tx.query('SELECT name FROM contacts');
      assert.deepEqual(rows, [{ name: 'Synthetic customer ' + ['A', 'B'][index] }]);
    });
  }
  console.log('PASS embedded PostgreSQL backup, separate restore and two-workspace row isolation');
} finally {
  await restored.close();
}
