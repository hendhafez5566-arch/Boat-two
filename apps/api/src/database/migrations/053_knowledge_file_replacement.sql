ALTER TABLE knowledge_revisions ADD COLUMN file_sha256 text;
ALTER TABLE knowledge_revisions ADD COLUMN file_bytes integer;
ALTER TABLE knowledge_revisions ADD COLUMN file_mime text;
CREATE TABLE knowledge_extractions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
 job_id uuid NOT NULL UNIQUE REFERENCES knowledge_jobs(id) ON DELETE CASCADE,source_revision integer NOT NULL,
 title text NOT NULL,source_ref text,content text NOT NULL,content_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE knowledge_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_extractions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_extractions USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON knowledge_extractions TO app_user;
CREATE INDEX knowledge_extraction_source ON knowledge_extractions(source_id,created_at DESC,id);
