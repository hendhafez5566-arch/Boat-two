CREATE INDEX crm_notes_contact_recent_idx ON crm_notes (contact_id, created_at DESC);
