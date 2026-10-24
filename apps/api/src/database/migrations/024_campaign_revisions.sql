ALTER TABLE campaigns ADD COLUMN revision int NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER audit_campaign AFTER INSERT OR UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION audit_core_change();
