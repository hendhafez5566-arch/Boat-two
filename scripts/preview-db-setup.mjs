import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const u = process.env.DATABASE_ADMIN_URL;
if (!u || new URL(u).pathname !== '/chatbot' || process.env.BOAT_PREVIEW_ONLY !== 'true')
  throw new Error('Refusing to bootstrap outside isolated preview chatbot database');
const c = new Client({ connectionString: u });
try {
  await c.connect();
  await c.query(`DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user LOGIN PASSWORD 'app_pass' NOSUPERUSER NOBYPASSRLS; END IF; END $do$;`);
  await c.query('GRANT CONNECT ON DATABASE chatbot TO app_user');
  await c.query('GRANT USAGE ON SCHEMA public TO app_user');
  console.log('Isolated preview DB application role initialized');
} finally { await c.end(); }
