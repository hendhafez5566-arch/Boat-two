ALTER TABLE departments ADD COLUMN archived_at timestamptz;
ALTER TABLE departments ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX departments_active_idx ON departments(tenant_id,name) WHERE archived_at IS NULL;
CREATE TRIGGER audit_departments AFTER INSERT OR UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION audit_core_change();
