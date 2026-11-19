-- Persist the actual outcome, not a frontend estimate of successful rows.
ALTER TABLE catalog_sync_runs ADD COLUMN summary jsonb NOT NULL DEFAULT '{}';
