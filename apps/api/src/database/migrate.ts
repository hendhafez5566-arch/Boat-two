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
      // Explicitly authorize a ONE-TIME QA bootstrap only in the preview
      // environment and for the preconfigured test WhatsApp channel. The SQL
      // migration will additionally verify the Meta phone-number ID.
      if ((file === '096_preview_catalog_demo.sql' || file === '097_preview_catalog_demo_retry.sql') &&
          process.env.BOAT_PREVIEW_ONLY === 'true' &&
          process.env.WHATSAPP_PREVIEW_BOT_ENABLED === 'true') {
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
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  // Verify the one-time QA import actually persisted; report counts only,
  // never phone numbers, customer content, credentials, or token values.
  if (process.env.BOAT_PREVIEW_ONLY === 'true' &&
      process.env.WHATSAPP_PREVIEW_BOT_ENABLED === 'true' &&
      process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID) {
    const target = await client.query(
      `SELECT type,status,external_id='1280213898505884' AS phone_match
         FROM channels WHERE id=$1::uuid`,
      [process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID],
    );
    console.log('QA_PREVIEW_TARGET', JSON.stringify({
      found: target.rowCount === 1,
      type: target.rows[0]?.type ?? null,
      status: target.rows[0]?.status ?? null,
      phoneMatch: target.rows[0]?.phone_match ?? false,
    }));
    const check = await client.query(
      `SELECT
         COUNT(DISTINCT s.id)::int AS data_sources,
         COUNT(DISTINCT f.id)::int AS published_bots,
         COUNT(DISTINCT cp.id) FILTER (WHERE NOT cp.archived)::int AS visible_catalog_items,
         COUNT(DISTINCT cp.id) FILTER (WHERE cp.archived)::int AS hidden_catalog_items,
         BOOL_OR(c.settings->>'activeBotFlowId'=f.id::text) AS bot_activated
       FROM channels c
       LEFT JOIN catalog_sources s ON s.tenant_id=c.tenant_id
         AND s.name='كتالوج سياحي تجريبي — ملف Excel'
       LEFT JOIN catalog_products cp ON cp.source_id=s.id
       LEFT JOIN flows f ON f.tenant_id=c.tenant_id
         AND f.name='تجربة بوت سياحي ديناميكي — كتالوج Excel'
         AND f.status='published'
       WHERE c.id=$1::uuid AND c.type='whatsapp'
         AND c.external_id='1280213898505884'`,
      [process.env.WHATSAPP_PREVIEW_BOT_CHANNEL_ID],
    );
    console.log('QA_TOURISM_EXCEL_CHECK', JSON.stringify(check.rows[0] ?? {}));
  }
  console.log('Migrations up to date');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
