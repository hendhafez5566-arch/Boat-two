-- Additive, backwards-compatible: existing writers keep normal priority.
-- No changes to RLS, identities, external connections, active flows, or existing task state.
ALTER TABLE crm_tasks ADD COLUMN priority text NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low','normal','high'));
