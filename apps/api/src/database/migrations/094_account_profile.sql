ALTER TABLE users ADD COLUMN IF NOT EXISTS account_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
