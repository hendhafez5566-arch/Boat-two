ALTER TABLE knowledge_jobs ADD COLUMN payload_purged_at timestamptz;
ALTER TABLE knowledge_extractions ALTER COLUMN content DROP NOT NULL;
ALTER TABLE knowledge_extractions ADD COLUMN content_chars integer NOT NULL DEFAULT 0;
UPDATE knowledge_extractions SET content_chars=length(content);
ALTER TABLE knowledge_extractions ADD COLUMN purged_at timestamptz;
CREATE TABLE knowledge_retention_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),requested_by uuid NOT NULL REFERENCES users(id),
 cutoff timestamptz NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
 jobs_purged integer NOT NULL DEFAULT 0,extractions_purged integer NOT NULL DEFAULT 0,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE knowledge_retention_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_retention_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_retention_runs USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON knowledge_retention_runs TO app_user;
GRANT UPDATE(content,purged_at) ON knowledge_extractions TO app_user;
CREATE UNIQUE INDEX knowledge_one_retention ON knowledge_retention_runs(tenant_id) WHERE status='pending';
CREATE TRIGGER audit_core AFTER INSERT OR UPDATE ON knowledge_retention_runs FOR EACH ROW EXECUTE FUNCTION audit_core_change();
