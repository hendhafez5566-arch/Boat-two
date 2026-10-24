ALTER TABLE whatsapp_templates ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
-- Submission claims persist before provider I/O. Unknown outcomes require sync, never blind retry.
COMMENT ON COLUMN whatsapp_templates.revision IS 'Optimistic draft edits and submission claims';
