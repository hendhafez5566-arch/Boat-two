-- Additive only: previous applications can ignore this optional field.
ALTER TABLE crm_deals ADD COLUMN loss_reason text CHECK (length(loss_reason) <= 500);
CREATE INDEX crm_deals_contact_updated_idx ON crm_deals(tenant_id,contact_id,updated_at DESC);
CREATE INDEX crm_tasks_contact_due_idx ON crm_tasks(tenant_id,contact_id,due_at);
-- Keep nested views separate from legacy flat campaign audiences so old versions never widen them.
CREATE TABLE crm_saved_views (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 filters jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_saved_views FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm_saved_views USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON crm_saved_views TO app_user;
CREATE INDEX crm_saved_views_tenant_idx ON crm_saved_views(tenant_id,created_at DESC);
