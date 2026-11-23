CREATE TABLE commerce_demo_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  restored_from uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,restored_from) REFERENCES commerce_demo_releases(tenant_id,id)
);
CREATE INDEX commerce_demo_releases_recent ON commerce_demo_releases (tenant_id, created_at DESC);
ALTER TABLE commerce_demo_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_demo_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY commerce_demo_releases_tenant ON commerce_demo_releases
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON commerce_demo_releases TO app_user;
