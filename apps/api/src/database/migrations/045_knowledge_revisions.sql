ALTER TABLE knowledge_sources ADD COLUMN revision int NOT NULL DEFAULT 1;
ALTER TABLE knowledge_sources ADD COLUMN archived_at timestamptz;
ALTER TABLE knowledge_jobs ADD COLUMN source_revision int NOT NULL DEFAULT 1;
CREATE TABLE knowledge_revisions(
 tenant_id uuid NOT NULL REFERENCES tenants(id),source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,revision int NOT NULL,
 title text NOT NULL,type text NOT NULL,source_ref text,content text,actor_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_id,revision)
);
ALTER TABLE knowledge_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_revisions USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON knowledge_revisions TO app_user;
INSERT INTO knowledge_revisions(tenant_id,source_id,revision,title,type,source_ref,content,actor_id) SELECT tenant_id,id,revision,title,type,source_ref,content,created_by FROM knowledge_sources;
CREATE TRIGGER knowledge_source_audit AFTER UPDATE ON knowledge_sources FOR EACH ROW WHEN(OLD.revision IS DISTINCT FROM NEW.revision OR OLD.archived_at IS DISTINCT FROM NEW.archived_at) EXECUTE FUNCTION audit_core_change();
