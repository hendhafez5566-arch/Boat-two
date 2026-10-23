ALTER TABLE crm_deals ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE crm_tasks ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX crm_deals_owner_status_idx ON crm_deals(tenant_id,owner_id,status,updated_at DESC);
CREATE INDEX crm_tasks_assignee_due_idx ON crm_tasks(tenant_id,assigned_to,status,due_at);
CREATE TRIGGER audit_crm_deals AFTER INSERT OR UPDATE ON crm_deals FOR EACH ROW EXECUTE FUNCTION audit_core_change();
CREATE TRIGGER audit_crm_tasks AFTER INSERT OR UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION audit_core_change();
