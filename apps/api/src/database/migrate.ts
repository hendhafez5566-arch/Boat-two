import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error('DATABASE_ADMIN_URL is required');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = await client.query('SELECT name FROM schema_migrations');
  const done = new Set<string>(applied.rows.map((r) => r.name as string));
  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    console.log('Applying', file);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  console.log('Migrations up to date');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
