ALTER TABLE crm_pipelines ADD COLUMN owner_id uuid REFERENCES users(id);
ALTER TABLE crm_pipelines ADD COLUMN ownership_revision integer NOT NULL DEFAULT 1;
CREATE TRIGGER audit_pipeline_ownership AFTER UPDATE OF owner_id ON crm_pipelines FOR EACH ROW EXECUTE FUNCTION audit_core_change();
