CREATE TABLE crm_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK(kind IN ('import','export')),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','canceled')),
 input jsonb NOT NULL DEFAULT '{}',result jsonb NOT NULL DEFAULT '[]',errors jsonb NOT NULL DEFAULT '[]',
 processed int NOT NULL DEFAULT 0,total int NOT NULL DEFAULT 0,succeeded int NOT NULL DEFAULT 0,created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_jobs USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON crm_jobs TO app_user;
CREATE INDEX crm_jobs_tenant_created_idx ON crm_jobs(tenant_id,created_at DESC);
