/**
 * Provision the least-privileged database login for an isolated Railway preview.
 * Never used for production and never executed unless explicitly enabled.
 * All secrets come from Railway environment variables, not this repository.
 */
import { Client } from 'pg';

async function main() {
  if (process.env.BOAT_PREVIEW_BOOTSTRAP !== 'true')
    throw new Error('Preview bootstrap is disabled');
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const password = process.env.BOAT_PREVIEW_APP_DB_PASSWORD;
  if (!adminUrl || !password || !/^[a-f0-9]{64}$/.test(password))
    throw new Error('Preview database credentials are missing or malformed');
  const databaseName = new URL(adminUrl).pathname.slice(1);
  if (databaseName !== 'boat_preview')
    throw new Error('Refusing to bootstrap a database other than boat_preview');

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const found = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'app_user'",
    );
    if (found.rowCount === 0) {
      await client.query(
        `CREATE ROLE app_user LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
      );
    } else {
      await client.query(
        `ALTER ROLE app_user LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`,
      );
    }
    await client.query('GRANT CONNECT ON DATABASE boat_preview TO app_user');
    await client.query('GRANT USAGE ON SCHEMA public TO app_user');
    console.log('Isolated preview application role ready');
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error('Preview database bootstrap failed:', error.message);
  process.exitCode = 1;
});
