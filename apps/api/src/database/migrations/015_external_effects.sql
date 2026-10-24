CREATE TABLE external_effects(tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,effect_key text NOT NULL,request_hash text NOT NULL,status text NOT NULL CHECK(status IN ('started','completed','ambiguous')),result jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,effect_key));
ALTER TABLE external_effects ENABLE ROW LEVEL SECURITY;ALTER TABLE external_effects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON external_effects USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON external_effects TO app_user;
