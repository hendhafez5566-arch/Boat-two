ALTER TABLE crm_create_receipts DROP CONSTRAINT crm_create_receipts_kind_check;
ALTER TABLE crm_create_receipts ADD CONSTRAINT crm_create_receipts_kind_check
  CHECK (kind IN ('contacts', 'deals', 'tasks', 'contacts_edit', 'deals_edit', 'tasks_edit'));
