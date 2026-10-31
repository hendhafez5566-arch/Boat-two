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
      // Historical demo migrations remain byte-for-byte intact. Never authorize
      // their active-flow/session changes as part of an ordinary deployment.
      // Existing applied migrations and owner demo data are left untouched.
      const allowLegacyDemoBootstrap = process.env.BOAT_ALLOW_LEGACY_DEMO_BOOTSTRAP === 'true';
      // Explicitly authorize a ONE-TIME QA bootstrap only in the preview
      // environment and for the preconfigured test WhatsApp channel. The SQL
      // migration will additionally verify the Meta phone-number ID.
      if (
        (file === '096_preview_catalog_demo.sql' ||
          file === '097_preview_catalog_demo_retry.sql') &&
        allowLegacyDemoBootstrap &&
        process.env.BOAT_PREVIEW_ONLY === 'true' &&
        process.env.WHATSAPP_PREVIEW_BOT_ENABLED === 'true'
      ) {
        await client.query(
          "SELECT set_config('boat.preview_seed_channel', $1, true), set_config('boat.preview_seed_conversation', $2, true)",
          [
            process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID ?? '',
            process.env.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID ?? '',
          ],
        );
        const confirmation = await client.query<{ channel: string }>(
          "SELECT current_setting('boat.preview_seed_channel', true) AS channel",
        );
        if (confirmation.rows[0]?.channel !== process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID)
          throw new Error('Scoped QA seed session was not established');
      }
      let script = readFileSync(join(dir, file), 'utf8');
      if (
        file === '098_preview_catalog_direct.sql' &&
        allowLegacyDemoBootstrap &&
        process.env.BOAT_PREVIEW_ONLY === 'true' &&
        process.env.WHATSAPP_PREVIEW_BOT_ENABLED === 'true'
      ) {
        // This is a narrowly scoped recovery for the missed preview import.
        // Inline only strongly validated UUIDs; never interpolate customer input.
        const channel = process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID ?? '';
        const conversation = process.env.WHATSAPP_PREVIEW_BOT_CONVERSATION_ID ?? '';
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuid.test(channel) || !uuid.test(conversation))
          throw new Error('Preview scope UUIDs are required for one-time catalog import');
        script = script
          .replace(
            "nullif(current_setting('boat.preview_seed_channel', true), '')",
            `'${channel}'::text`,
          )
          .replace(
            "nullif(current_setting('boat.preview_seed_conversation', true), '')",
            `'${conversation}'::text`,
          );
        if (script.includes("current_setting('boat.preview_seed_"))
          throw new Error('Preview seed parameters could not be bound');
      }
      await client.query(script);
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
